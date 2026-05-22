// robots.txt: разрешаем краулерам публичную часть, блокируем приватную.

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/news";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/admin/",
          "/account/",
          "/billing/",
          "/connections/",
          "/onboarding/",
          "/auth/",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
