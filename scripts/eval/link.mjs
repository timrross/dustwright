// M8 check: an agent with no tools at all writes a /view#json= share link for the NOT gate from AUTHORING.md alone.
// The guide goes in the prompt; the agent has no tools (`--tools ""`). The link it writes is saved for the browser
// test in e2e/eval-link.spec.ts, which opens it against the local build.
//   node scripts/eval/link.mjs [--out docs/eval/<date>-link.json]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const args = process.argv.slice(2);
const out = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : join(root, "docs/eval", `${new Date().toISOString().slice(0, 10)}-link.json`);
const guide = readFileSync(join(root, "AUTHORING.md"), "utf8");
const prompt = `Below is AUTHORING.md, the guide to Dustwright redstone designs. Using only this guide, write a share
link that opens a working NOT gate (a lever and a lamp that is lit only while the lever is off) in the Dustwright
viewer. Reply with the link alone on one line, nothing else.

<authoring_guide>
${guide}
</authoring_guide>`;
const run = spawnSync(
  "claude",
  ["-p", prompt, "--tools", "", "--no-session-persistence", "--setting-sources", "", "--strict-mcp-config"],
  {
    cwd: mkdtempSync(join(tmpdir(), "dw-link-")),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
const text = (run.stdout ?? "").trim();
const link = text.split(/\s+/).find((w) => w.includes("/view/#json=")) ?? null;
writeFileSync(
  out,
  `${JSON.stringify({ when: new Date().toISOString(), tools: "none", reply: text, link }, null, 2)}\n`,
);
console.log(
  link ? `link written (${link.length} characters): ${out}` : `no link in the reply: ${text.slice(0, 200)}`,
);
process.exitCode = link ? 0 : 1;
