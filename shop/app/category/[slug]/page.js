import { notFound } from 'next/navigation';
import HomeClient from '../../HomeClient';
import { CATEGORIES, categorySlug } from '@/lib/categories';
import { cachedCategory } from '@/lib/catalog-seo';
import { priceProducts } from '@/lib/catalog';
import { loadSettings } from '@/lib/settings';

export const revalidate = 1800;
export const dynamicParams = false;
export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: categorySlug(category) }));
}
function findCategory(slug) { return CATEGORIES.find((category) => categorySlug(category) === slug); }

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const category = findCategory(slug);
  if (!category) notFound();
  return { title: `${category.label} — Shop Online in Uganda`,
    description: `Shop ${category.label.toLowerCase()} with Mr Sqoop Express. Explore products and confirm current prices, options and delivery to Uganda on each product.`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({ params }) {
  const category = findCategory((await params).slug);
  if (!category) notFound();
  await loadSettings();
  const cached = await cachedCategory(category.keyword);
  const initial = cached ? {
    products: priceProducts(cached, []).map((product) => ({ ...product, skuId: null })),
    hasMore: true, pageSize: 10,
  } : null;
  return <HomeClient initial={initial} initialQuery={category.keyword} categoryTitle={category.label} />;
}
