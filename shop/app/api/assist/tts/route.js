import { Agent, fetch as undiciFetch } from 'undici';

/**
 * POST /api/assist/tts  { text }  ->  audio/wav
 *
 * Speaks one sentence of a Sqoop Assist answer for the /assist demo page. The
 * page sends an answer sentence by sentence so speech starts quickly. The
 * Kokoro voice runs on our voice server (infra/voice-server), where the model
 * stays loaded; this route only checks the request and passes it on. If the
 * voice server is unreachable the page falls back to the device's own voice.
 *
 * Env:
 *   VOICE_SERVER_URL     https://<server-ip>
 *   VOICE_SERVER_SECRET  shared secret the voice server expects
 *   VOICE_SERVER_CA      the voice server's self-signed certificate (PEM; \n escapes ok)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_CHARS = 300;
const LIMIT = 60; // sentences per visitor per window
const WINDOW_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20000;

// Per-instance only, but enough to stop one visitor hogging the voice server.
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function sameSite(request) {
  const host = request.headers.get('host');
  const from = request.headers.get('origin') || request.headers.get('referer');
  if (!host || !from) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

// The voice server's certificate is self-signed and pinned: only that exact
// certificate is trusted, so the IP not matching a hostname is irrelevant.
let agent = null;
function voiceAgent() {
  if (!agent) {
    const ca = process.env.VOICE_SERVER_CA.replace(/\\n/g, '\n');
    agent = new Agent({ connect: { ca, checkServerIdentity: () => undefined } });
  }
  return agent;
}

export async function POST(request) {
  if (!sameSite(request)) return Response.json({ error: 'Not allowed.' }, { status: 403 });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allowed(ip)) return Response.json({ error: 'Too many requests.' }, { status: 429 });

  const { text } = await request.json().catch(() => ({}));
  const sentence = typeof text === 'string' ? text.trim() : '';
  if (!sentence || sentence.length > MAX_CHARS) {
    return Response.json({ error: 'Text is required (max 300 characters).' }, { status: 400 });
  }

  const { VOICE_SERVER_URL, VOICE_SERVER_SECRET, VOICE_SERVER_CA } = process.env;
  if (!VOICE_SERVER_URL || !VOICE_SERVER_SECRET || !VOICE_SERVER_CA) {
    return Response.json({ error: 'Voice is unavailable right now.' }, { status: 503 });
  }

  try {
    const res = await undiciFetch(`${VOICE_SERVER_URL.replace(/\/$/, '')}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VOICE_SERVER_SECRET}` },
      body: JSON.stringify({ text: sentence }),
      dispatcher: voiceAgent(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`voice server answered ${res.status}`);
    const wav = await res.arrayBuffer();
    return new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[assist/tts] voice server failed:', error);
    return Response.json({ error: 'Voice is unavailable right now.' }, { status: 503 });
  }
}
