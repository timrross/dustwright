/** Escapes JSON so it can sit inside an HTML script element: `<`, `>`, `&`, U+2028 and U+2029 become \u escapes. */
export function escapeJsonForScript(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Thrown when the viewer script could break out of its script element. */
export class UnsafeScriptError extends Error {}

/**
 * Builds the single-file viewer: one HTML page with exactly one inline script (the viewer bundle followed by the
 * design text as an escaped JS string literal, which the viewer parses with the same guards as a file) and no
 * remote URLs. No design text appears outside that string: the page title is fixed and the viewer sets everything
 * else with textContent.
 */
export function buildBundleHtml(viewerScript: string, designText: string): string {
  if (/<\/script|<!--/i.test(viewerScript)) {
    throw new UnsafeScriptError("viewer script contains a sequence that would end its script element");
  }
  // JSON.stringify of a string is a valid JS string literal; the escapes keep it inert inside the script element.
  const literal = escapeJsonForScript(JSON.stringify(designText));
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Dustwright design</title>",
    "</head>",
    '<body style="margin:0">',
    '<redstone-viewer height="100vh"></redstone-viewer>',
    `<script>${viewerScript}\n;DustwrightViewer.mount(${literal});</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
