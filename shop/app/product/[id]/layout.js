import { cachedProduct } from '@/lib/catalog-seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await cachedProduct(id);
  return {
    title: product?.title || 'Product details',
    description: product?.title
      ? `Shop ${product.title}. Confirm available options, current price and delivery to Uganda with Mr Sqoop Express.`
      : 'See product options, current price and delivery to Uganda with Mr Sqoop Express.',
    alternates: { canonical: `/product/${encodeURIComponent(id)}` },
  };
}

export default function ProductLayout({ children }) { return children; }
