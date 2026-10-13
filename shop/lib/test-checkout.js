/**
 * Test checkout: while it is switched on, an order skips Mobile Money and is
 * recorded as paid, so everything after payment (the admin's confirmation, the
 * supplier order to the warehouse and its shipping cost) can be checked without
 * moving any money. Pricing and the checkout total check still run as normal.
 *
 * CHECKOUT_TEST_MODE (Vercel env, needs a redeploy to change):
 *   unset / "off"           normal checkout, everyone pays
 *   "all"                   nobody pays
 *   "a@x.com,b@y.com"       only these signed-in accounts skip payment
 *
 * Test orders carry the payment reference TEST-<order id>, which the admin
 * shows next to the order, so they can't be mistaken for paid ones.
 */
export const TEST_REF_PREFIX = 'TEST-';

export function isTestCheckout(account) {
  const mode = String(process.env.CHECKOUT_TEST_MODE || '').trim().toLowerCase();
  if (!mode || mode === 'off') return false;
  if (mode === 'all') return true;
  const email = String(account?.email || '').trim().toLowerCase();
  return Boolean(email) && mode.split(',').map((e) => e.trim()).includes(email);
}

export const isTestRef = (reference) => String(reference || '').startsWith(TEST_REF_PREFIX);
