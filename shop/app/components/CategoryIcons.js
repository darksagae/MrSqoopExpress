/**
 * Fixed icon set for the homepage category tiles.
 *
 * Category tiles used to show the first live AliExpress result photo for
 * their keyword — which meant showing whatever promotional badge, watermark
 * or text overlay that seller happened to put on their listing image. Using
 * a small hand-drawn icon set instead means every tile looks the same and
 * never depends on what a random seller's photo looks like this week.
 */
const ICONS = {
  electronics: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </>
  ),
  fashion: (
    <path d="M9 3L4 6l2 3.5L9 8v13h6V8l3 1.5L20 6l-5-3-1.5 1.5h-3L9 3z" />
  ),
  kitchen: (
    <>
      <path d="M4 9h16" />
      <path d="M5.5 9v3a6.5 6.5 0 0 0 13 0V9" />
      <path d="M2 9h2M20 9h2" />
    </>
  ),
  beauty: (
    <>
      <rect x="9.5" y="2" width="5" height="4.5" rx="1" />
      <path d="M9.5 6.5h5l-.9 12.5a1.6 1.6 0 0 1-1.6 1.5h-.1a1.6 1.6 0 0 1-1.6-1.5L9.5 6.5z" />
    </>
  ),
  fitness: (
    <>
      <rect x="2" y="8.5" width="3" height="7" rx="1" />
      <rect x="19" y="8.5" width="3" height="7" rx="1" />
      <path d="M5 12h14" />
      <path d="M7 9.5v5M17 9.5v5" />
    </>
  ),
  baby: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 9a3 3 0 0 1 6 0" />
      <path d="M12 14v3" />
      <rect x="9" y="18" width="6" height="2.5" rx="1.25" />
    </>
  ),
  pets: (
    <>
      <circle cx="12" cy="15" r="4" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="9" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="5.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="5.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="9" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  automotive: (
    <>
      <path d="M3.5 12.5l1.6-5A2 2 0 0 1 7 6h10a2 2 0 0 1 1.9 1.5l1.6 5" />
      <rect x="2" y="12.5" width="20" height="5" rx="1.5" />
      <circle cx="7" cy="19.2" r="1.6" />
      <circle cx="17" cy="19.2" r="1.6" />
    </>
  ),
  tools: (
    <path d="M14.5 6.2a3.8 3.8 0 0 1-5 5L4.7 16 3 17.7 6.3 21 8 19.3l4.8-4.8a3.8 3.8 0 0 1 5-5l-1.6 1.6-2.4-2.4 1.7-1.5z" />
  ),
  bags: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
      <path d="M9 7.5V5.3A1.8 1.8 0 0 1 10.8 3.5h2.4A1.8 1.8 0 0 1 15 5.3v2.2" />
      <path d="M3 12.5h18" />
    </>
  ),
  office: (
    <>
      <path d="M4.5 19.5l.9-3.6L15.5 5.8l2.7 2.7L8.1 18.6l-3.6.9z" />
      <path d="M14 6.3l3.7 3.7" />
    </>
  ),
};

export default function CategoryIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || null}
    </svg>
  );
}
