/**
 * A root-relative site path ("/play/") under the path the site is served from: unchanged on its own domain,
 * "/dustwright/play/" as a GitHub Pages project site. The build sets the base (vite.config.ts).
 */
export const sitePath = (path: string): string => import.meta.env.BASE_URL + path.replace(/^\//, "");
