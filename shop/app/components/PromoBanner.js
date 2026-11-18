'use client';

import { useEffect, useState } from 'react';

/**
 * The operator's promo line, e.g. "10% off your first order | Code: SQOOP10".
 * Set from the admin; renders nothing when there is no active promo. Tapping the
 * code copies it.
 */
export default function PromoBanner({ className = '' }) {
  const [promo, setPromo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const images = promo?.images?.length ? promo.images : promo?.image ? [promo.image] : [];
  const seconds = promo?.rotationSeconds || 5;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (images.length < 2 || paused || interacting || reducedMotion) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex(value => (value + 1) % images.length);
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [images.length, seconds, paused, interacting, reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.promo) setPromo(d.promo); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!promo || (!promo.text && !promo.code && !images.length)) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the code is still on screen */ }
  };

  return (
    <div className={`promo ${className}`} role="note">
      {images.length > 0 && (
        <section className="promo-slideshow" aria-label="Promotional flyers" aria-roledescription="carousel"
          onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
          onFocus={() => setInteracting(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
          <a href="/#shop" className="promo-img" aria-label={promo.text || 'Shop promotion'}>
            <img src={images[index % images.length]} alt={promo.text || `Promotional flyer ${(index % images.length) + 1}`} loading="eager" decoding="async" />
          </a>
          {images.length > 1 && <div className="promo-controls">
            <button type="button" onClick={() => setIndex(value => (value - 1 + images.length) % images.length)} aria-label="Previous flyer">‹</button>
            <span>{(index % images.length) + 1} / {images.length}</span>
            <button type="button" onClick={() => setIndex(value => (value + 1) % images.length)} aria-label="Next flyer">›</button>
            {!reducedMotion && <button type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Play flyers' : 'Pause flyers'}</button>}
          </div>}
        </section>
      )}
      {promo.text && <span className="promo-text">{promo.text}</span>}
      {promo.text && promo.code && <span className="promo-sep" aria-hidden="true">|</span>}
      {promo.code && (
        <button type="button" className="promo-code" onClick={copy} aria-label={`Copy code ${promo.code}`}>
          Code: <strong>{promo.code}</strong>
          <span className="promo-copy">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
      {(promo.minOrder > 0 || promo.endsAt) && (
        <span className="promo-cond">
          {promo.minOrder > 0 && `Valid on orders over UGX ${Number(promo.minOrder).toLocaleString('en-US')}`}
          {promo.minOrder > 0 && promo.endsAt && ' · '}
          {promo.endsAt && `Ends ${new Date(`${promo.endsAt}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
          {promo.code && ' · Enter the code at checkout'}
        </span>
      )}
    </div>
  );
}
