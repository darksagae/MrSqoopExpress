import { fetch as undiciFetch, ProxyAgent } from 'undici';

/**
 * Outbound requests that must leave from our fixed IP (payment APIs that
 * whitelist callers, i.e. LipaPay) go through the egress proxy on the Vultr
 * server. Without EGRESS_PROXY_URL set this is plain fetch, so local
 * development and sandbox testing are unaffected.
 *
 * Env:
 *   EGRESS_PROXY_URL  https://<server-ip>:3129
 *   EGRESS_PROXY_AUTH the proxy password
 *   EGRESS_PROXY_CA   the proxy's self-signed certificate (PEM; \n escapes ok)
 *
 * The proxy's certificate is self-signed and pinned: only that exact
 * certificate is trusted, so the IP not matching a hostname is irrelevant.
 */
let agent = null;

export function isEgressConfigured() {
  return Boolean(process.env.EGRESS_PROXY_URL && process.env.EGRESS_PROXY_AUTH && process.env.EGRESS_PROXY_CA);
}

function getAgent() {
  if (!agent) {
    const ca = process.env.EGRESS_PROXY_CA.replace(/\\n/g, '\n');
    agent = new ProxyAgent({
      uri: process.env.EGRESS_PROXY_URL,
      token: 'Basic ' + Buffer.from('shop:' + process.env.EGRESS_PROXY_AUTH).toString('base64'),
      proxyTls: { ca, checkServerIdentity: () => undefined },
    });
  }
  return agent;
}

export function egressFetch(url, init = {}) {
  if (!isEgressConfigured()) return fetch(url, init);
  return undiciFetch(url, { ...init, dispatcher: getAgent() });
}
