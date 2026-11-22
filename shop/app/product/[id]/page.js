import Link from 'next/link';
import ProductDetailClient from './ProductDetailClient';
import { cachedProduct } from '@/lib/catalog-seo';

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await cachedProduct(id);
  // Cached browse data gives crawlers and slow connections useful HTML while
  // the client obtains current SKU prices and shipping. It is never cart data.
  const preview = product ? <article className="pd">
    <nav className="pd-breadcrumb" aria-label="Breadcrumb"><Link href="/">Shop</Link><span>/</span><span>{product.title}</span></nav>
    <div className="pd-top">
      <div className="pd-gallery"><div className="pd-main">
        {product.image && <img src={product.image} alt={product.title} fetchPriority="high" />}
      </div></div>
      <div className="pd-info"><h1 className="pd-title">{product.title}</h1>
        <p>Shop this product with Mr Sqoop Express for delivery to Uganda.</p>
        <p>Available options, current prices and shipping are confirmed before ordering.</p>
      </div>
    </div>
  </article> : <div className="pd-status" role="status">Loading product…</div>;
  return <ProductDetailClient loadingContent={preview} />;
}
