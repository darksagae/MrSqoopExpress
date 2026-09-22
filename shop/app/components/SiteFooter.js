import Link from 'next/link';

/** Visa card mark — rounded card outline with the italic wordmark. */
function VisaBadge() {
  return (
    <svg width="44" height="28" viewBox="0 0 44 28" aria-label="Visa" role="img">
      <rect x="0.5" y="0.5" width="43" height="27" rx="4" fill="#1A1F71" stroke="#e0e0e0" />
      <text x="22" y="19" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="12" fill="#fff">
        VISA
      </text>
    </svg>
  );
}

/** Mastercard mark — the two overlapping circles. */
function MastercardBadge() {
  return (
    <svg width="44" height="28" viewBox="0 0 44 28" aria-label="Mastercard" role="img">
      <rect x="0.5" y="0.5" width="43" height="27" rx="4" fill="#fff" stroke="#e0e0e0" />
      <circle cx="18" cy="14" r="7.5" fill="#EB001B" />
      <circle cx="26" cy="14" r="7.5" fill="#F79E1B" fillOpacity="0.9" />
    </svg>
  );
}

function MtnBadge() {
  return (
    <span className="pay-badge pay-badge-mtn" aria-label="MTN Mobile Money">
      MTN MoMo
    </span>
  );
}

function AirtelBadge() {
  return (
    <span className="pay-badge pay-badge-airtel" aria-label="Airtel Money">
      Airtel Money
    </span>
  );
}

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="logo footer-logo">
        <span className="logo-title">MrSqoopExpress</span>
        <p className="footer-tagline">YOU SHOP. WE SHIP. YOU SMILE.</p>
      </div>

      <div className="footer-pay">
        <span className="footer-pay-label">We accept</span>
        <div className="footer-pay-badges">
          <MtnBadge />
          <AirtelBadge />
          <VisaBadge />
          <MastercardBadge />
        </div>
      </div>

      <nav className="footer-links" aria-label="Legal">
        <Link href="/privacy">Privacy Policy</Link>
        <span className="footer-links-sep">·</span>
        <Link href="/returns">Return Policy</Link>
      </nav>

      <p>&copy; 2026 MrSqoopExpress. All rights reserved.</p>
    </footer>
  );
}
