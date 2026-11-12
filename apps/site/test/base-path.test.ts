import { describe, expect, it } from "vitest";
import { normaliseBase, rebaseHtml, rebaseMarkdown } from "../base-path.js";

describe("the site's base path", () => {
  it("is / unless DUSTWRIGHT_BASE names a path, and always starts and ends with a slash", () => {
    expect(normaliseBase(undefined)).toBe("/");
    expect(normaliseBase("")).toBe("/");
    expect(normaliseBase("/")).toBe("/");
    expect(normaliseBase("/dustwright")).toBe("/dustwright/");
    expect(normaliseBase("dustwright/")).toBe("/dustwright/");
    expect(normaliseBase("/a/b/")).toBe("/a/b/");
  });

  it("refuses anything but plain path segments", () => {
    for (const bad of ["https://example.com/", "/a/../b", '/"onload="x', "/a b"])
      expect(() => normaliseBase(bad), bad).toThrow(/DUSTWRIGHT_BASE/);
  });

  it("leaves a page alone at the root", () => {
    const html = '<a href="/play/">Play</a>';
    expect(rebaseHtml(html, "/")).toBe(html);
  });

  it("puts the base in front of root-relative links and viewer sources, once", () => {
    const html = [
      '<a href="/">Home</a> <a href="/play/">Play</a>',
      '<redstone-viewer src="/examples/not-gate.rsd.json"></redstone-viewer>',
      '<script type="module" src="/dustwright/assets/main-abc.js"></script>',
      '<a href="https://example.com/x">out</a> <a href="//example.com/x">out</a> <a href="#top">top</a>',
    ].join("\n");
    const out = rebaseHtml(html, "/dustwright/");
    expect(out).toContain('<a href="/dustwright/">Home</a> <a href="/dustwright/play/">Play</a>');
    expect(out).toContain('src="/dustwright/examples/not-gate.rsd.json"');
    expect(out).toContain('src="/dustwright/assets/main-abc.js"');
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('href="//example.com/x"');
    expect(out).toContain('href="#top"');
    expect(rebaseHtml(out, "/dustwright/")).toBe(out);
  });

  it("does the same for Markdown links", () => {
    const text = "- [Playground](/play/)\n- [Out](https://example.com/)\n";
    expect(rebaseMarkdown(text, "/")).toBe(text);
    expect(rebaseMarkdown(text, "/dustwright/")).toBe(
      "- [Playground](/dustwright/play/)\n- [Out](https://example.com/)\n",
    );
  });
});
