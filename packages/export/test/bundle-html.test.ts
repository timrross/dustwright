import { describe, expect, it } from "vitest";
import { buildBundleHtml, escapeJsonForScript, UnsafeScriptError } from "../src/index.js";

const HOSTILE = "</script><img src=x onerror=alert(1)><!-- \u2028\u2029 & >";

describe("single-file bundle HTML", () => {
  it("escapes <, >, &, U+2028 and U+2029 in the inlined JSON", () => {
    expect(escapeJsonForScript(JSON.stringify({ a: HOSTILE }))).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(escapeJsonForScript(JSON.stringify({ a: HOSTILE })))).toEqual({ a: HOSTILE });
  });

  it("has exactly one script, no remote URLs, and no design text outside the JSON", () => {
    const html = buildBundleHtml(
      "window.DustwrightViewer={mount(){}};",
      JSON.stringify({ meta: { name: HOSTILE } }),
    );
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html.match(/<\/script/gi)).toHaveLength(1);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("<img");
    expect(html).toContain("<title>Dustwright design</title>");
  });

  it("inlines the design as a string literal that round-trips exactly", () => {
    const text = JSON.stringify({ meta: { name: HOSTILE }, __proto__x: 1 }, null, 2);
    const html = buildBundleHtml("var DustwrightViewer={mount:function(t){globalThis.got=t}};", text);
    const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
    const sandbox: { got?: string } = {};
    new Function("globalThis", script)(sandbox); // eslint-disable-line no-new-func -- test-only evaluation of our own output
    expect(sandbox.got).toBe(text);
  });

  it("refuses a viewer script that could end its script element", () => {
    expect(() => buildBundleHtml("var a='</script>';", "{}")).toThrow(UnsafeScriptError);
    expect(() => buildBundleHtml("var a='<!--';", "{}")).toThrow(UnsafeScriptError);
  });
});
