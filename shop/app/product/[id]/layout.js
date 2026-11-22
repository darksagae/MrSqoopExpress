import { cachedProduct } from '@/lib/catalog-seo';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await cachedProduct(id);
  return {
    title: product?.title || 'Product details',
    description: product?.title
      ? `Shop ${product.title}. Confirm available options, current price and delivery to Uganda with Mr Sqoop Express.`
      : 'See product options, current price and delivery to Uganda with Mr Sqoop Express.',
    ...(product?.image ? { openGraph: { title: product.title, images: [{ url: product.image, alt: product.title }], type: 'website' }, twitter: { card: 'summary_large_image', title: product.title, images: [product.image] } } : {}),
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
    alternates: { canonical: `/product/${encodeURIComponent(id)}` },
  };
}

export default function ProductLayout({ children }) { return children; }
