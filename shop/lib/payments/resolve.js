import * as mtn from './mtn.js';
import * as lipapay from './lipapay.js';

/**
 * Airtel uses the verified LipaPay prompt integration. MTN retains its existing
 * PAYMENT_PROVIDER selection, including installations using direct MTN.
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

  if (network === 'airtel' || activeProviderName() === 'lipapay') {
    return {
      provider: lipapay,
      ready: lipapay.isLipaPayConfigured(),
      missing: lipapay.lipapayMissing(),
      label,
    };
  }

  const provider = mtn;
  const ready = mtn.isMtnConfigured();
  const missing = mtn.mtnMissing();
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
