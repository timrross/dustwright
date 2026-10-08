import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The security model bans eval, new Function and HTML sinks everywhere. This proves the lint config enforces it.
const eslint = new ESLint({ cwd: fileURLToPath(new URL("..", import.meta.url)) });

async function ruleIds(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: "packages/viewer/src/probe.ts" });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "");
}

describe("security lint rules", () => {
  it.each([
    ["eval", "eval('1');\n", "no-eval"],
    ["new Function", "export const f = new Function('return 1');\n", "no-new-func"],
    ["innerHTML", "document.body.innerHTML = 'x';\n", "no-restricted-syntax"],
    ["innerHTML (computed)", "document.body['innerHTML'] = 'x';\n", "no-restricted-syntax"],
    ["outerHTML", "document.body.outerHTML = 'x';\n", "no-restricted-syntax"],
    ["insertAdjacentHTML", "document.body.insertAdjacentHTML('beforeend', 'x');\n", "no-restricted-syntax"],
    ["document.write", "document.write('x');\n", "no-restricted-syntax"],
  ])("bans %s", async (_name, code, ruleId) => {
    expect(await ruleIds(code)).toContain(ruleId);
  });

  it("allows textContent", async () => {
    expect(await ruleIds("document.body.textContent = 'x';\n")).toEqual([]);
  });
});
