import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteConfig";

/**
 * Static sitemap for the four indexable surfaces. `/live` is intentionally
 * excluded: it is a dynamic, plan-specific mirror of `/match-plan` and would
 * only add duplicate content.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const routes: Array<{ path: string; priority: number }> = [
    { path: "", priority: 1 },
    { path: "/build-lab", priority: 0.8 },
    { path: "/theorycraft", priority: 0.8 },
    { path: "/match-plan", priority: 0.8 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority,
  }));
}
