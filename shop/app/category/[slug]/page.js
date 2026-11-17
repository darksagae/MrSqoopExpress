import Link from 'next/link';
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
  const url = `https://www.mrsqoopexpress.com/category/${categorySlug(category)}`;
  const breadcrumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mrsqoopexpress.com/' },
    { '@type': 'ListItem', position: 2, name: category.label, item: url },
  ] };
  return <>
    <section className="section category-intro">
      <nav className="category-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{category.label}</span></nav>
      <h1>{category.label} — Shop Online in Uganda</h1>
      <p>Browse {category.label.toLowerCase()} from international suppliers with Mr Sqoop Express. View prices in Uganda shillings and check each product’s available options, shipping cost and delivery window to Uganda before ordering.</p>
    </section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, '\\u003c') }} />
    <HomeClient initial={initial} initialQuery={category.keyword} categoryTitle={category.label} />
  </>;

}
