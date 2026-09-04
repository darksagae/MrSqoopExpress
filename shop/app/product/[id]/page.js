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
  const [shipLoading, setShipLoading] = useState(false);

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

  // Re-quote shipping when the shopper switches variant. AliExpress prices
  // freight per SKU, so a heavier or bulkier option can ship at a different
  // rate — showing the first variant's quote for all of them would be wrong.
  useEffect(() => {
    const skuId = variant?.skuId;
    if (!product || !skuId || skuId === product.shipping?.quotedForSkuId) return;

    let cancelled = false;
    setShipLoading(true);
    fetch(`/api/products/${id}?skuId=${encodeURIComponent(skuId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.product?.shipping) return;
        // Only the shipping block is replaced; everything else is unchanged and
        // swapping the whole product would flicker the gallery and selection.
        setProduct((prev) => (prev ? { ...prev, shipping: d.product.shipping } : prev));
      })
      .catch(() => { /* keep the previous quote rather than blanking the price */ })
      .finally(() => !cancelled && setShipLoading(false));
    return () => { cancelled = true; };
  }, [id, variant?.skuId, product?.shipping?.quotedForSkuId, product]);

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

  // The supplier's shipping charge, quoted per product and never folded into
  // the price because it genuinely differs per product. Customers see it as
  // shipping to Uganda; the Deira leg it was actually priced for is internal.
  const ship = product.shipping || null;
  const shipUGX = ship?.known ? ship.costUGX : null;
  // Carried into the cart so checkout can total it. Not shown here — the
  // storefront quotes product cost and shipping only.
  const handlingUGX = variant?.handlingUGX ?? product.handlingUGX ?? 0;
  const deliveryText =
    ship?.desc || (ship?.minDays && ship?.maxDays ? `${ship.minDays}–${ship.maxDays} days` : null);

  const addToCart = () => {
    add(
      {
        id: variant ? `${product.id}:${variant.skuId}` : product.id,
        name: variant && variant.label !== 'Default' ? `${product.title} (${variant.label})` : product.title,
        price,
        img: variant?.image || mainImg,
        skuId: variant?.skuId ?? ship?.quotedForSkuId ?? null,
        shipUGX,
        handlingUGX,
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


          <div
            className={`pd-ship ${
              ship?.deliverable === false ? 'none' : ship?.free ? 'free' : ship?.known ? '' : 'unknown'
            }`}
          >
            {shipLoading
              ? 'Checking shipping…'
              : ship?.deliverable === false
              ? 'Not available for delivery to'
              : !ship?.known
              ? 'Shipping calculated at checkout'
              : ship.free
                ? '✓ Free shipping'
                : `Shipping ${fmt(ship.costUGX)}`}
            {!shipLoading && ship?.destination ? ` to ${ship.destination}` : ''}
            {!shipLoading && deliveryText ? ` · arrives in ${deliveryText}` : ''}
          </div>

          <div className="pd-buy">
            <div className="pd-qty">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span>{qty}</span>
              <button type="button" onClick={() => setQty((q) => q + 1)}>+</button>
            </div>
            <button
              className="btn-dark pd-add"
              // Same reasoning as the catalogue: never sell what cannot be shipped.
              disabled={shipLoading || ship?.deliverable === false}
              onClick={addToCart}
            >
              {ship?.deliverable === false ? 'Not available for this destination' : 'Add to Cart'}
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
