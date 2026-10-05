const SITE = 'https://www.mrsqoopexpress.com';

export default function sitemap() {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/international-shopping-uganda`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/returns`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
