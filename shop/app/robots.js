export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/account/', '/checkout/', '/login', '/signup', '/assist'] }],
    sitemap: 'https://www.mrsqoopexpress.com/sitemap.xml',
  };
}
