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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.promo) setPromo(d.promo); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!promo || (!promo.text && !promo.code)) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the code is still on screen */ }
  };

  return (
    <div className={`promo ${className}`} role="note">
      {promo.text && <span className="promo-text">{promo.text}</span>}
      {promo.text && promo.code && <span className="promo-sep" aria-hidden="true">|</span>}
      {promo.code && (
        <button type="button" className="promo-code" onClick={copy} aria-label={`Copy code ${promo.code}`}>
          Code: <strong>{promo.code}</strong>
          <span className="promo-copy">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
    </div>
  );
}
