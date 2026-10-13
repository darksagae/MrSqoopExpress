/**
 * Meta (Facebook/Instagram) Pixel in the browser.
 *
 * The pixel ID comes from the admin settings (via /api/settings/public), so it
 * is only known once the page has asked for it. Events tracked before then are
 * held and sent once the pixel starts, or dropped if it is switched off or the
 * shopper said "No thanks".
 *
 * Purchase is also sent by the server (lib/meta-capi.js), because a customer
 * often approves the Mobile Money prompt on their phone and never comes back to
 * the page. Both use the order number as the event ID, so Meta counts it once.
 *
 * Only product names, IDs, quantities and UGX amounts are sent from here.
 */
const OPT_OUT_KEY = 'mse_no_ads_tracking';
const NOTICE_KEY = 'mse_tracking_notice_seen';

let state = 'pending'; // 'pending' until the settings answer, then 'on' or 'off'
const queue = [];

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
};

// The server reads this cookie at checkout, so a customer who said "No thanks"
// isn't reported to Meta from the server either (lib/meta-capi.js).
const OPT_OUT_COOKIE = 'mse_no_ads';
const cookieSet = () => {
  try {
    return document.cookie.split('; ').includes(`${OPT_OUT_COOKIE}=1`);
  } catch {
    return false;
  }
};

export const optedOut = () => read(OPT_OUT_KEY) === '1' || cookieSet();
export const noticeSeen = () => read(NOTICE_KEY) === '1';
export const markNoticeSeen = () => write(NOTICE_KEY, '1');

function send(name, params, eventId) {
  try {
    window.fbq('track', name, params || {}, eventId ? { eventID: eventId } : undefined);
  } catch {
    // Never let tracking break the shop.
  }
}

/** Load Meta's script and start the pixel. Called once the settings are known. */
export function startPixel(pixelId) {
  if (state !== 'pending' || typeof window === 'undefined') return;
  if (!pixelId || optedOut()) {
    stopPixel();
    return;
  }
  /* eslint-disable */
  // Meta's standard loader: defines fbq, queues calls until fbevents.js arrives.
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', String(pixelId));
  state = 'on';
  for (const [name, params, eventId] of queue.splice(0)) send(name, params, eventId);
}

/** No pixel configured, or the shopper declined: drop everything from now on. */
export function stopPixel() {
  state = 'off';
  queue.length = 0;
}

/** The shopper said "No thanks": stop sending, and remember it on this device. */
export function optOut() {
  write(OPT_OUT_KEY, '1');
  try {
    document.cookie = `${OPT_OUT_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax; Secure`;
  } catch {
    // ignore
  }
  markNoticeSeen();
  try {
    if (window.fbq) window.fbq('consent', 'revoke');
  } catch {
    // ignore
  }
  stopPixel();
}

/**
 * Track a standard Meta event, e.g. track('AddToCart', { value, currency: 'UGX' }).
 * eventId lets the browser and server copies of one event be counted once.
 */
export function track(name, params, { eventId } = {}) {
  if (typeof window === 'undefined' || state === 'off') return;
  if (state === 'pending') {
    if (queue.length < 50) queue.push([name, params, eventId]);
    return;
  }
  send(name, params, eventId);
}

/** The product ID Meta should see: the supplier's product number, without the option. */
export const contentId = (id) => String(id ?? '').split(':')[0];
