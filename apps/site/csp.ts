/**
 * The site's security headers, in one place. The Vite build writes `SITE_CSP` into every page as a
 * `<meta http-equiv="Content-Security-Policy">` fallback; `public/_headers` (Cloudflare Pages, Netlify) and
 * `deploy/nginx/dustwright.conf` send the same values as real headers, and a test keeps all three in step.
 */

/**
 * Every page: scripts, styles and fonts from the site only; `fetch` to the site or any https: URL (a viewer's
 * `src`); images from the site and data: URLs; frames from the site only (the embedding example frames
 * viewer.html), so no page can show another site inside Dustwright's chrome. No plugins, no `<base>`, no form posts.
 */
export const SITE_CSP = [
  "default-src 'self'",
  "connect-src 'self' https:",
  "img-src 'self' data:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * The embedding example also frames a viewer on a local build (another port is another origin), so its meta CSP
 * adds local http origins. Hosts never send this: their header is SITE_CSP.
 */
export const EMBED_EXAMPLE_CSP = SITE_CSP.replace(
  "frame-src 'self'",
  "frame-src 'self' http://127.0.0.1:* http://localhost:*",
);

/** Headers every response carries, besides the CSP. */
export const SITE_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};
