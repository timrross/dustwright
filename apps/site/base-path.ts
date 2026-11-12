/**
 * The path the site is served under: "/" on its own domain, "/dustwright/" as a GitHub Pages project site. Set at
 * build time by the DUSTWRIGHT_BASE environment variable; the pages and scripts are written root-relative
 * ("/play/") and the build puts the base in front.
 */

/** Normalises a base path to start and end with one slash ("dustwright" and "/dustwright" give "/dustwright/"). */
export function normaliseBase(raw: string | undefined): string {
  const parts = (raw ?? "").split("/").filter((p) => p !== "");
  for (const p of parts) {
    if (!/^[\w.-]+$/.test(p) || p === "." || p === "..")
      throw new Error(`DUSTWRIGHT_BASE: "${raw}" is not a plain path`);
  }
  return parts.length === 0 ? "/" : `/${parts.join("/")}/`;
}

/**
 * Puts the base in front of every root-relative `href` and `src` in a built page. Vite does this itself for the
 * scripts, styles and assets it bundles (those already start with the base and are left alone); it does not for
 * links between pages or for a viewer's `src`.
 */
export function rebaseHtml(html: string, base: string): string {
  if (base === "/") return html;
  return html.replace(/(\s(?:href|src))="\/(?!\/)([^"]*)"/g, (all, attr: string, rest: string) =>
    `/${rest}`.startsWith(base) ? all : `${attr}="${base}${rest}"`,
  );
}

/** The same for the root-relative links of a Markdown file (llms.txt). */
export function rebaseMarkdown(text: string, base: string): string {
  if (base === "/") return text;
  return text.replace(/\]\(\/(?!\/)/g, `](${base}`);
}
