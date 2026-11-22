export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/api/products/', '/api/settings/public', '/api/promo-banner'], disallow: ['/api/', '/account/', '/checkout/', '/login', '/signup', '/assist'] }],
    sitemap: 'https://www.mrsqoopexpress.com/sitemap.xml',
  };
}
