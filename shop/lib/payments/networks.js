/**
 * Which mobile-money network a Ugandan number belongs to, from its prefix.
 * Source: LipaPay's operator table (LIPAPAY_API_REFERENCE.md). A payment
 * prompt sent to the wrong network never reaches the customer's phone, so the
 * number decides, not which button was tapped.
 *
 * @returns 'mtn' | 'airtel' | null (null when the prefix isn't known)
 */
export function detectNetwork(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('256')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length !== 9) return null;

  const n = Number(p.slice(0, 3));
  if ((n >= 760 && n <= 789) || (n >= 790 && n <= 794)) return 'mtn';
  if ((n >= 700 && n <= 709) || (n >= 730 && n <= 731) || (n >= 740 && n <= 759)) return 'airtel';
  return null;
}
