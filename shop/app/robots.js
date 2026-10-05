export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/account/', '/checkout/', '/login', '/signup'] }],
    sitemap: 'https://www.mrsqoopexpress.com/sitemap.xml',
  };
}
