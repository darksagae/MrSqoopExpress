'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../../cart';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');

export default function ProductDetail() {
  const { id } = useParams();
  const { add, setOpen } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mainImg, setMainImg] = useState(null);
  const [variant, setVariant] = useState(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/products/${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) { setError(d); return; }
        const p = d.product;
        setProduct(p);
        setMainImg(p.images?.[0] || p.variants?.[0]?.image || null);
        setVariant(p.variants?.[0] || null);
      })
      .catch((e) => !cancelled && setError({ error: 'Network error', message: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="pd-status">Loading product…</div>;

  if (error) {
    return (
      <div className="pd-status error">
        <strong>{error.error || 'Could not load product'}</strong>
        {error.message && <p>{error.message}</p>}
        <p><Link href="/#shop" className="pd-back">← Back to shop</Link></p>
      </div>
    );
  }

  const price = variant?.priceUGX ?? product.priceUGX;
  const showRange = !variant && product.maxPriceUGX > product.priceUGX;

  // Delivery timing (cost, if any, is already folded into the price above).
  const delivery = product.delivery || null;
  const deliveryText = delivery
    ? delivery.desc ||
      (delivery.minDays && delivery.maxDays ? `${delivery.minDays}–${delivery.maxDays} days` : null)
    : null;

  const addToCart = () => {
    add(
      {
        id: variant ? `${product.id}:${variant.skuId}` : product.id,
        name: variant && variant.label !== 'Default' ? `${product.title} (${variant.label})` : product.title,
        price,
        img: variant?.image || mainImg,
      },
      qty
    );
    setOpen(true);
  };

  return (
    <div className="pd">
      <div className="pd-breadcrumb">
        <Link href="/#shop">Shop</Link> <span>/</span> <span>{product.title.slice(0, 40)}…</span>
      </div>

      <div className="pd-top">
        {/* Gallery */}
        <div className="pd-gallery">
          <div className="pd-main">
            {mainImg && <img src={mainImg} alt={product.title} />}
          </div>
          {product.images?.length > 1 && (
            <div className="pd-thumbs">
              {product.images.slice(0, 8).map((src) => (
                <button
                  key={src}
                  className={`pd-thumb ${src === mainImg ? 'active' : ''}`}
                  onClick={() => setMainImg(src)}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy box */}
        <div className="pd-info">
          <h1 className="pd-title">{product.title}</h1>

          <div className="pd-meta">
            {product.rating && <span>★ {product.rating}</span>}
            {product.reviews && <span>{product.reviews} reviews</span>}
            {product.sales && <span>{product.sales} sold</span>}
          </div>

          <div className="pd-price">
            {fmt(price)}{showRange && <span className="pd-price-range"> – {fmt(product.maxPriceUGX)}</span>}
          </div>

          {product.variants?.length > 1 && (
            <div className="pd-variants">
              <div className="pd-variants-label">Options</div>
              <div className="pd-variant-list">
                {product.variants.map((v) => (
                  <button
                    key={v.skuId}
                    className={`pd-variant ${variant?.skuId === v.skuId ? 'active' : ''}`}
                    onClick={() => { setVariant(v); if (v.image) setMainImg(v.image); }}
                  >
                    {v.image && <img src={v.image} alt="" />}
                    <span>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pd-ship free">
            ✓ Free delivery to Uganda
            {deliveryText ? ` · arrives in ${deliveryText}` : ''}
          </div>

          <div className="pd-buy">
            <div className="pd-qty">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span>{qty}</span>
              <button type="button" onClick={() => setQty((q) => q + 1)}>+</button>
            </div>
            <button className="btn-dark pd-add" onClick={addToCart}>
              Add to Cart
            </button>
          </div>

          <ul className="pd-assurance">
            <li>Pay with Airtel Money or MTN Mobile Money</li>
            {product.store?.name && (
              <li>
                Sold via {product.store.name}
                {product.store.country ? ` (${product.store.country})` : ''}
                {product.store.asDescribedRating ? ` · ${product.store.asDescribedRating}★ as described` : ''}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Specifications */}
      {product.specs?.length > 0 && (
        <section className="pd-section">
          <h2 className="pd-h2">Specifications</h2>
          <table className="pd-specs">
            <tbody>
              {product.specs.map((s, i) => (
                <tr key={i}>
                  <td className="pd-spec-name">{s.name}</td>
                  <td className="pd-spec-val">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Description (seller's full HTML) */}
      {product.descriptionHtml && (
        <section className="pd-section">
          <h2 className="pd-h2">Product Description</h2>
          <div className="pd-desc" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
        </section>
      )}
    </div>
  );
}
