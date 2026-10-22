import { detectNetwork } from './networks.js';

function invalid(code, message) {
  return Object.assign(new Error(message), { code });
}

export function normalizeWallet(phone) {
  const value = String(phone ?? '').trim();
  if (!/^[+\d\s()-]+$/.test(value)) throw invalid('LIPAPAY_INVALID_WALLET', 'Invalid mobile-money number.');
  let p = value.replace(/\D/g, '');
  if (p.startsWith('00256')) p = p.slice(2);
  if (p.startsWith('256')) p = '0' + p.slice(3);
  if (/^7\d{8}$/.test(p)) p = '0' + p;
  if (!/^07\d{8}$/.test(p) || !detectNetwork(p)) throw invalid('LIPAPAY_INVALID_WALLET', 'Invalid Ugandan mobile-money number.');
  return p;
}

/** Ordered exactly as the vendor's unifiedorder signing table. */
export function collectionFields({ merchantId, notifyUrl, amountUGX, phone, orderId, note, network, now = Date.now() }) {
  const channel = { mtn: 1, airtel: 2 }[network];
  const traderId = normalizeWallet(phone);
  if (!channel || detectNetwork(traderId) !== network) throw invalid('LIPAPAY_INVALID_WALLET', 'The number does not match the selected network.');
  const amount = Number(amountUGX);
  if (!Number.isSafeInteger(amount) || amount < 500 || !Number.isSafeInteger(amount * 100)) {
    throw invalid('LIPAPAY_AMOUNT_TOO_LOW', 'A whole-shilling amount of at least 500 UGX is required.');
  }
  if (!/^[0-9A-Za-z_*\-]{6,36}$/.test(String(orderId))) throw invalid('LIPAPAY_INVALID_REFERENCE', 'Invalid merchant payment reference.');
  const mch = Number(merchantId);
  if (!Number.isSafeInteger(mch) || mch < 1) throw invalid('LIPAPAY_CONFIG_INVALID', 'Invalid merchant configuration.');
  let callback;
  try { callback = new URL(notifyUrl); } catch { throw invalid('LIPAPAY_CONFIG_INVALID', 'Invalid callback configuration.'); }
  if (!['https:', 'http:'].includes(callback.protocol) || callback.username || callback.password || String(notifyUrl).length > 155) {
    throw invalid('LIPAPAY_CONFIG_INVALID', 'Invalid callback configuration.');
  }
  return {
    Version: 'v1.0', MchID: mch, TimeStamp: Math.floor(now / 1000),
    Channel: channel, OutTradeNo: String(orderId), Amount: amount * 100,
    TransactionType: 1, TraderID: traderId, TraderFullName: 'NONEEDMATCHNAMES',
    Description: String(note || `MrSqoopExpress ${orderId}`).slice(0, 200), NotifyUrl: notifyUrl,
  };
}
