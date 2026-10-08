import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_CODES } from "@dustwright/core";
import { run } from "../src/index.js";

// `--json` output is checked against the published schema, packages/core/schema/diagnostics.json.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const schema = JSON.parse(readFileSync(join(root, "packages/core/schema/diagnostics.json"), "utf8")) as {
  $defs: { diagnostic: { properties: { code: { enum: string[] } } } };
};
const check = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const tmp = mkdtempSync(join(tmpdir(), "rsd-schema-"));

async function json(...args: string[]): Promise<unknown> {
  let stdout = "";
  await run([...args, "--json"], { stdout: (t) => (stdout += t), stderr: () => {} });
  return JSON.parse(stdout);
}

function expectValid(doc: unknown) {
  check(doc);
  expect(check.errors ?? []).toEqual([]);
}

const fixtures = join(root, "packages/validator/fixtures");
const designs = [
  ...readdirSync(join(root, "examples"))
    .filter((f) => f.endsWith(".rsd.json"))
    .map((f) => join(root, "examples", f)),
  ...readdirSync(fixtures).flatMap((code) =>
    ["pass", "fail"].map((k) => join(fixtures, code, `${k}.rsd.json`)),
  ),
];

describe("diagnostics JSON Schema", () => {
  it("lists exactly the catalogue's codes", () => {
    expect(schema.$defs.diagnostic.properties.code.enum).toEqual(DIAGNOSTIC_CODES.map((d) => d.code));
  });

  it.each(designs.map((d) => [d.slice(root.length), d]))(
    "rsd validate --json %s matches it",
    async (_, file) => {
      expectValid(await json("validate", file));
    },
  );

  it("matches when the file cannot be read, and for bad arguments", async () => {
    expectValid(await json("validate", join(tmp, "missing.rsd.json")));
    expectValid(await json("validate"));
  });

  it("matches rsd export --json, on success and on failure", async () => {
    const pack = join(tmp, "pack");
    mkdirSync(pack);
    const ok = await json(
      "export",
      join(root, "examples/not-gate.rsd.json"),
      "--to",
      "mcfunction",
      "--pack",
      pack,
    );
    expect(ok).toMatchObject({ ok: true });
    expectValid(ok);
    const bad = join(tmp, "bad.rsd.json");
    writeFileSync(bad, "{");
    expectValid(await json("export", bad, "--to", "mcfunction", "--pack", pack));
  });
});
