// Fails when any installed dependency (prod or dev) carries a licence outside the MIT-compatible allowlist.
// Run with `pnpm check:licenses`; CI runs it on every push.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "CC-BY-4.0",
  "Unlicense",
  "Python-2.0",
]);

/**
 * Evaluates an SPDX licence expression against the allowlist. `OR` passes when either side passes, `AND` only
 * when both do; brackets group. Anything unparseable fails closed.
 */
export function allowed(expr) {
  const tokens = String(expr).match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const parseOr = () => {
    let ok = parseAnd();
    while (tokens[i] === "OR") {
      i++;
      const right = parseAnd();
      ok = ok || right;
    }
    return ok;
  };
  const parseAnd = () => {
    let ok = parseAtom();
    while (tokens[i] === "AND") {
      i++;
      const right = parseAtom();
      ok = ok && right;
    }
    return ok;
  };
  const parseAtom = () => {
    const t = tokens[i++];
    if (t === "(") {
      const ok = parseOr();
      if (tokens[i++] !== ")") throw new Error("unbalanced");
      return ok;
    }
    if (t === undefined || t === ")" || t === "AND" || t === "OR") throw new Error("unexpected token");
    return ALLOWED.has(t);
  };
  try {
    const ok = parseOr();
    return i === tokens.length && ok;
  } catch {
    return false;
  }
}

function main() {
  const out = execFileSync("pnpm", ["licenses", "list", "--json"], { encoding: "utf8" });
  const byLicence = JSON.parse(out);
  const bad = [];
  let count = 0;
  for (const [licence, pkgs] of Object.entries(byLicence)) {
    for (const pkg of pkgs) {
      count++;
      if (!allowed(licence)) bad.push(`${pkg.name}@${pkg.versions.join(",")}: ${licence}`);
    }
  }
  if (bad.length > 0) {
    console.error(`Licence check failed for ${bad.length} package(s):\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `Licence check passed: ${count} packages, licences: ${Object.keys(byLicence).sort().join(", ")}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
