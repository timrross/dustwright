import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { JAVA_PATH, PACK_PATH, writeIntoPack } from "../src/pack-write.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const example = join(root, "examples/not-gate.rsd.json");
const fresh = () => mkdtempSync(join(tmpdir(), "rsd-pack-"));

async function rsd(args: string[], env: Record<string, string | undefined> = {}) {
  let stdout = "";
  let stderr = "";
  const { exitCode } = await run(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), env });
  return { exitCode, stdout, stderr };
}

function design(name: string, extra: Record<string, unknown> = {}): string {
  const dir = fresh();
  const file = join(dir, "d.rsd.json");
  writeFileSync(
    file,
    JSON.stringify({ format: "rsd/1", meta: { name, ...extra }, legend: { "#": "stone" }, layers: [["#"]] }),
  );
  return file;
}

describe("rsd export --to mcfunction", () => {
  it("writes into <pack>/functions/rsd/ and prints every path it wrote", async () => {
    const pack = fresh();
    const r = await rsd(["export", example, "--to", "mcfunction", "--pack", pack, "--clear"]);
    expect(r.exitCode).toBe(0);
    const lines = r.stdout.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/functions\/rsd\/not-gate\.mcfunction$/);
    expect(lines[1]).toMatch(/functions\/rsd\/not-gate_clear\.mcfunction$/);
    expect(readdirSync(pack)).toEqual(["functions"]);
  });

  it("overwrites in place with identical bytes", async () => {
    const pack = fresh();
    await rsd(["export", example, "--to", "mcfunction", "--pack", pack]);
    const first = readFileSync(join(pack, "functions/rsd/not-gate.mcfunction"));
    await rsd(["export", example, "--to", "mcfunction", "--pack", pack]);
    expect(readFileSync(join(pack, "functions/rsd/not-gate.mcfunction"))).toEqual(first);
  });

  it("reads the pack root from RSD_PACK_DIR, and has no default", async () => {
    const pack = fresh();
    expect((await rsd(["export", example, "--to", "mcfunction"], { RSD_PACK_DIR: pack })).exitCode).toBe(0);
    const none = await rsd(["export", example, "--to", "mcfunction"]);
    expect(none.exitCode).toBe(2);
    expect(none.stderr).toContain("no default");
  });

  it("parses --origin x y z and --command-limit", async () => {
    const pack = fresh();
    expect(
      (await rsd(["export", example, "--to", "mcfunction", "--pack", pack, "--origin", "-2", "0", "3"]))
        .exitCode,
    ).toBe(0);
    expect(readFileSync(join(pack, "functions/rsd/not-gate.mcfunction"), "utf8").split("\n")[1]).toBe(
      "setblock ~-2 ~ ~3 minecraft:stone",
    );
    expect(
      (await rsd(["export", example, "--to", "mcfunction", "--pack", pack, "--command-limit", "3"])).exitCode,
    ).toBe(1);
    expect(
      (await rsd(["export", example, "--to", "mcfunction", "--pack", pack, "--origin", "1", "x", "2"]))
        .exitCode,
    ).toBe(2);
  });

  it("lists exporters", async () => {
    expect((await rsd(["export", "--list"])).stdout).toContain("mcfunction\tbedrock");
  });

  it("refuses a Bedrock exporter for a java design, a Java exporter for a bedrock one, and an unknown exporter", async () => {
    const pack = fresh();
    const java = design("j", { edition: "java" });
    expect((await rsd(["export", java, "--to", "mcfunction", "--pack", pack])).exitCode).toBe(2);
    expect((await rsd(["export", example, "--to", "schem", "-o", pack])).exitCode).toBe(2);
    expect((await rsd(["export", example, "--to", "schematic", "--pack", pack])).exitCode).toBe(2);
    expect(readdirSync(pack)).toEqual([]);
  });
});

describe("rsd export --to schem|litematic (Java)", () => {
  it("writes <slug>.schem and <slug>.litematic into -o, and needs -o", async () => {
    const out = fresh();
    const java = design("j gate", { edition: "java" });
    const schem = await rsd(["export", java, "--to", "schem", "-o", out]);
    expect(schem.exitCode).toBe(0);
    expect(schem.stdout.trim()).toBe(join(realpathSync(out), "j-gate.schem"));
    expect((await rsd(["export", java, "--to", "litematic", "-o", out])).exitCode).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["j-gate.litematic", "j-gate.schem"]);
    // gzip magic: both are gzipped NBT.
    expect([...readFileSync(join(out, "j-gate.schem")).subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect((await rsd(["export", java, "--to", "schem"])).exitCode).toBe(2);
  });

  it("rsd pack refuses a Java design (a .mcpack is Bedrock's) and writes nothing", async () => {
    const out = fresh();
    const r = await rsd(["pack", design("j", { edition: "java" }), "-o", join(out, "j.mcpack")]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/Bedrock behavior pack/);
    expect(readdirSync(out)).toEqual([]);
  });

  it("the Java writer accepts only a slug file name with its extension", async () => {
    const out = fresh();
    for (const path of ["../x.schem", "functions/rsd/x.mcfunction", "x.html", "a/b.schem"]) {
      await expect(writeIntoPack(out, [{ path, bytes: new Uint8Array([1]) }], JAVA_PATH)).rejects.toThrow();
    }
    expect(readdirSync(out)).toEqual([]);
  });
});

describe("export path safety", () => {
  it("a name of ../../evil gives a safe slug inside functions/rsd/", async () => {
    const pack = fresh();
    const r = await rsd(["export", design("../../evil"), "--to", "mcfunction", "--pack", pack]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(join(realpathSync(pack), "functions/rsd/evil.mcfunction"));
    expect(existsSync(join(pack, "..", "evil.mcfunction"))).toBe(false);
  });

  it("a 200-character name fails with E013 and an emoji name with E012; nothing is written", async () => {
    const pack = fresh();
    const long = await rsd([
      "export",
      design("n".repeat(200)),
      "--to",
      "mcfunction",
      "--pack",
      pack,
      "--json",
    ]);
    expect(long.exitCode).toBe(1);
    expect(JSON.parse(long.stdout).diagnostics[0].code).toBe("E013");
    const emoji = await rsd(["export", design("🧱🔥"), "--to", "mcfunction", "--pack", pack, "--json"]);
    expect(emoji.exitCode).toBe(1);
    expect(JSON.parse(emoji.stdout).diagnostics[0].code).toBe("E012");
    expect(readdirSync(pack)).toEqual([]);
  });

  it("refuses a symlink inside the pack that points outside it", async () => {
    const pack = fresh();
    const outside = fresh();
    symlinkSync(outside, join(pack, "functions"));
    const r = await rsd(["export", example, "--to", "mcfunction", "--pack", pack]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("symlink");
    expect(readdirSync(outside)).toEqual([]);
  });

  it("replaces a target that is a symlink or a hard link without writing through it", async () => {
    for (const link of [symlinkSync, linkSync]) {
      const pack = fresh();
      const outside = fresh();
      mkdirSync(join(pack, "functions/rsd"), { recursive: true });
      writeFileSync(join(outside, "victim.txt"), "keep");
      link(join(outside, "victim.txt"), join(pack, "functions/rsd/not-gate.mcfunction"));
      const r = await rsd(["export", example, "--to", "mcfunction", "--pack", pack]);
      expect(r.exitCode).toBe(0);
      expect(readFileSync(join(outside, "victim.txt"), "utf8")).toBe("keep");
      const target = join(pack, "functions/rsd/not-gate.mcfunction");
      expect(lstatSync(target).isSymbolicLink()).toBe(false);
      expect(readFileSync(target, "utf8")).toMatch(/^# dustwright not-gate/);
      expect(readdirSync(join(pack, "functions/rsd")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    }
  });

  it("writes nothing when any file of an export is refused", async () => {
    const pack = fresh();
    await expect(
      writeIntoPack(pack, [
        { path: "functions/rsd/a.mcfunction", bytes: new Uint8Array([1]) },
        { path: "functions/rsd/../x.mcfunction", bytes: new Uint8Array([1]) },
      ]),
    ).rejects.toThrow();
    expect(existsSync(join(pack, "functions/rsd/a.mcfunction"))).toBe(false);
  });

  it("accepts a pack root that is itself a symlink (it is resolved first)", async () => {
    const real = fresh();
    const link = join(fresh(), "pack");
    symlinkSync(real, link);
    expect((await rsd(["export", example, "--to", "mcfunction", "--pack", link])).exitCode).toBe(0);
    expect(existsSync(join(real, "functions/rsd/not-gate.mcfunction"))).toBe(true);
  });

  it("refuses a missing pack root", async () => {
    expect(
      (await rsd(["export", example, "--to", "mcfunction", "--pack", join(fresh(), "nope")])).exitCode,
    ).toBe(2);
  });

  it("writeIntoPack writes only the two allowed directories", async () => {
    for (const bad of [
      "../x.mcfunction",
      "functions/rsd/../../x.mcfunction",
      "functions/x.mcfunction",
      "scripts/rsd/a.js",
      "functions/rsd/A.mcfunction",
      "/etc/passwd",
    ]) {
      expect(PACK_PATH.test(bad), bad).toBe(false);
      await expect(writeIntoPack(fresh(), [{ path: bad, bytes: new Uint8Array() }])).rejects.toThrow();
    }
    expect(PACK_PATH.test("structures/rsd/not-gate.mcstructure")).toBe(true);
    expect(PACK_PATH.test("structures/rsd/not-gate_clear.mcstructure")).toBe(false);
    expect(PACK_PATH.test("functions/rsd/not-gate.mcstructure")).toBe(false);
  });
});

describe("export JSON and warnings", () => {
  it("carries W108 for unverified blocks into the export output", async () => {
    const pack = fresh();
    const r = await rsd([
      "export",
      join(root, "examples/observer-clock.rsd.json"),
      "--to",
      "mcfunction",
      "--pack",
      pack,
      "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const doc = JSON.parse(r.stdout) as { ok: boolean; diagnostics: { code: string; message: string }[] };
    expect(doc.diagnostics.some((d) => d.code === "W108" && d.message.includes("observer"))).toBe(true);
    const text = await rsd([
      "export",
      join(root, "examples/observer-clock.rsd.json"),
      "--to",
      "mcfunction",
      "--pack",
      pack,
    ]);
    expect(text.stderr).toContain("W108");
  });

  it("prints one JSON document for usage errors and for oversized files", async () => {
    const usage = await rsd([
      "export",
      example,
      "--to",
      "mcfunction",
      "--pack",
      fresh(),
      "--command-limit",
      "0x10",
      "--json",
    ]);
    expect(usage.exitCode).toBe(2);
    expect(JSON.parse(usage.stdout).ok).toBe(false);
    const big = join(fresh(), "big.rsd.json");
    writeFileSync(big, " ".repeat(2 * 1024 * 1024 + 1));
    const r = await rsd(["export", big, "--to", "mcfunction", "--pack", fresh(), "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe("E013");
  });

  it("rejects non-decimal command limits", async () => {
    for (const bad of ["0x10", "1e3", "0", "-5", "1.5"]) {
      expect(
        (await rsd(["export", example, "--to", "mcfunction", "--pack", fresh(), "--command-limit", bad]))
          .exitCode,
        bad,
      ).toBe(2);
    }
  });

  it("refuses Windows device names as slugs (E012)", async () => {
    const r = await rsd([
      "export",
      design("x", { slug: "con" }),
      "--to",
      "mcfunction",
      "--pack",
      fresh(),
      "--json",
    ]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe("E012");
  });
});

describe("rsd export --to mcstructure", () => {
  it("writes structures/rsd/<slug>.mcstructure and lists both exporters", async () => {
    const pack = fresh();
    const r = await rsd(["export", example, "--to", "mcstructure", "--pack", pack]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toMatch(/structures\/rsd\/not-gate\.mcstructure$/);
    expect(readFileSync(join(pack, "structures/rsd/not-gate.mcstructure")).length).toBeGreaterThan(100);
    expect((await rsd(["export", "--list"])).stdout).toBe(
      "mcfunction\tbedrock\nmcstructure\tbedrock\nschem\tjava\nlitematic\tjava\n",
    );
  });
});

describe("rsd loader", () => {
  it("writes one Script API pack for several designs, and refuses Java designs or a missing -o", async () => {
    const out = fresh();
    const file = join(out, "loader.mcpack");
    const r = await rsd(["loader", example, join(root, "examples/repeater-line.rsd.json"), "-o", file]);
    expect(r.exitCode).toBe(0);
    expect([...readFileSync(file).subarray(0, 2)]).toEqual([0x50, 0x4b]);
    expect((await rsd(["loader", example])).exitCode).toBe(2);
    expect(
      (await rsd(["loader", design("j", { edition: "java" }), "-o", join(out, "j.mcpack")])).exitCode,
    ).toBe(2);
    expect(readdirSync(out)).toEqual(["loader.mcpack"]);
  });
});
