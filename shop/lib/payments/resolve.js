import * as mtn from './mtn';
import * as airtel from './airtel';
import * as lipapay from './lipapay';

/**
 * Picks which backend actually moves the money for a given network.
 *
 * The customer chooses "MTN Mobile Money" or "Airtel Money" and that is all
 * they ever see — those labels are the truth either way, since the prompt
 * really does come from their wallet. What changes underneath is whether we
 * talk to MTN and Airtel directly, or to LipaPay's aggregated API.
 *
 *   PAYMENT_PROVIDER=lipapay   → route both networks through LipaPay
 *   anything else (default)    → the direct mtn.js / airtel.js integrations
 *
 * Defaulting to direct matters: LipaPay IP-whitelists its transactional
 * endpoints and Vercel's egress IP is dynamic, so flipping this on before a
 * static IP exists would 403 every checkout. See LIPAPAY_API_REFERENCE.md §7.1.
 */

export const NETWORKS = ['mtn', 'airtel'];

/** Customer-facing wallet names. Never surface the processor here. */
export const NETWORK_LABEL = {
  mtn: 'MTN Mobile Money',
  airtel: 'Airtel Money',
};

export function activeProviderName() {
  return process.env.PAYMENT_PROVIDER === 'lipapay' ? 'lipapay' : 'direct';
}

/**
 * @returns {{ provider: object, ready: boolean, missing: string[], label: string }}
 */
export function resolveProvider(network) {
  const label = NETWORK_LABEL[network];

  if (activeProviderName() === 'lipapay') {
    return {
      provider: lipapay,
      ready: lipapay.isLipaPayConfigured(),
      missing: lipapay.lipapayMissing(),
      label,
    };
  }

  const provider = network === 'mtn' ? mtn : airtel;
  const ready = network === 'mtn' ? mtn.isMtnConfigured() : airtel.isAirtelConfigured();
  const missing = network === 'mtn' ? mtn.mtnMissing() : airtel.airtelMissing();
  return { provider, ready, missing, label };
}

/**
 * Per-network readiness for the public status probe.
 *
 * Deliberately only `ready`. The names of the missing variables identify the
 * processor (LIPAPAY_*, MTN_*, AIRTEL_*) and this endpoint is unauthenticated,
 * so listing them would publish both our payment vendor and our config layout.
 * Operators get the detail from resolveProvider() in the server logs.
 */
export function networkStatus() {
  return Object.fromEntries(
    NETWORKS.map((n) => [n, { ready: resolveProvider(n).ready }])
  );
}
