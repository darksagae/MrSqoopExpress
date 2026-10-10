import { Agent, fetch as undiciFetch } from 'undici';

/**
 * Requests to our voice server (infra/voice-server), which runs Piper on the
 * same Vultr server as the payment egress proxy.
 *
 * Env:
 *   VOICE_SERVER_URL     https://<server-ip>:8443
 *   VOICE_SERVER_SECRET  shared secret the voice server expects
 *   VOICE_SERVER_CA      the voice server's self-signed certificate (PEM; \n escapes ok)
 *
 * The certificate is self-signed and pinned: only that exact certificate is
 * trusted, so the IP not matching a hostname is irrelevant.
 */
let agent = null;

export function isVoiceServerConfigured() {
  return Boolean(process.env.VOICE_SERVER_URL && process.env.VOICE_SERVER_SECRET && process.env.VOICE_SERVER_CA);
}

export function voiceServerFetch(path, init = {}) {
  if (!agent) {
    const ca = process.env.VOICE_SERVER_CA.replace(/\\n/g, '\n');
    agent = new Agent({ connect: { ca, checkServerIdentity: () => undefined } });
  }
  return undiciFetch(`${process.env.VOICE_SERVER_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${process.env.VOICE_SERVER_SECRET}` },
    dispatcher: agent,
  });
}
