import { CATEGORIES, categorySlug } from '@/lib/categories';
import { sitemapProducts } from '@/lib/catalog-seo';

const SITE = 'https://www.mrsqoopexpress.com';
export const revalidate = 3600;

export default async function sitemap() {
  const products = await sitemapProducts();
  return [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/international-shopping-uganda`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE}/returns`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    ...CATEGORIES.map((category) => ({ url: `${SITE}/category/${categorySlug(category)}`, changeFrequency: 'daily', priority: 0.8 })),
    ...products.map((product) => ({ url: `${SITE}/product/${product.id}`, lastModified: new Date(product.updated_at), changeFrequency: 'daily', priority: 0.6 })),
  ];
}
