/**
 * Canonical public origin of the site, used by metadata, sitemap and robots.
 *
 * Override with the `NEXT_PUBLIC_SITE_URL` environment variable (set it in the
 * Render dashboard) whenever the deployed URL changes — e.g. after renaming the
 * service or attaching a custom domain. The fallback is the current Render URL.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://element-td2-build-lab.onrender.com"
).replace(/\/+$/, "");

/** Human-readable product name, reused across metadata surfaces. */
export const SITE_NAME = "Element TD 2 Build Lab";
