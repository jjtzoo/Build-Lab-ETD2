import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteConfig";

/** Allow all crawlers everywhere and point them at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
