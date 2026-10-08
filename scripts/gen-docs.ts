// Writes the generated docs: docs/bedrock-mapping.md (same text as `rsd registry dump`) and docs/diagnostics.md.
//   pnpm docs:gen          write them
//   pnpm docs:gen --check  exit 1 on drift (CI)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderMappingDoc, renderVerifyLog } from "@dustwright/core";
import { EXPORTER_ASSUMPTIONS } from "@dustwright/export";
import { renderDiagnosticsDoc } from "@dustwright/validator";

const root = fileURLToPath(new URL("..", import.meta.url));
const check = process.argv.includes("--check");
const docs: Record<string, string> = {
  "docs/bedrock-mapping.md": renderMappingDoc("bedrock"),
  "docs/diagnostics.md": renderDiagnosticsDoc(),
  "docs/verify-in-game.md": renderVerifyLog("bedrock", EXPORTER_ASSUMPTIONS),
};
let drift = false;
for (const [path, content] of Object.entries(docs)) {
  let current = "";
  try {
    current = readFileSync(`${root}/${path}`, "utf8");
  } catch {
    // a missing file is drift
  }
  if (current === content) continue;
  if (check) {
    console.error(`drift: ${path} is out of date; run pnpm docs:gen`);
    drift = true;
  } else {
    writeFileSync(`${root}/${path}`, content);
    console.log(`wrote ${path}`);
  }
}
if (drift) process.exitCode = 1;
