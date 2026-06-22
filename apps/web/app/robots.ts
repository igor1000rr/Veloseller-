import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/features';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard/',
        '/admin/',
        '/account/',
        '/billing/',
        '/onboarding/',
        '/connections/',
        '/auth/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
