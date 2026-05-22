import type { MetadataRoute } from 'next';

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
    sitemap: 'https://veloseller.ru/sitemap.xml',
  };
}
