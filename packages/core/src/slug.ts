/** A valid slug: runs of `[a-z0-9]` joined by single `-`, 1 to 48 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Maximum slug length. */
export const SLUG_MAX = 48;

/** Windows device names, which cannot be file names on Windows even with an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/** True when `slug` matches the slug grammar and length and is not a Windows device name. */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug) && !RESERVED.test(slug);
}

/**
 * Derives a slug from a design name: lowercase, every character outside `[a-z0-9]` becomes `-`, runs of `-`
 * collapse, the ends are trimmed, and the result is cut to 48 characters (trimmed again). Returns "" when nothing
 * usable remains (for example a name made only of emoji), which the parser reports as E012.
 */
export function deriveSlug(name: string): string {
  const dashed = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return dashed.slice(0, SLUG_MAX).replace(/-+$/g, "");
}
