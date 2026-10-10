import { isVoiceServerConfigured, voiceServerFetch } from '@/lib/assist/voice-server';

/**
 * POST /api/assist/tts  { text }  ->  audio/wav
 *
 * Speaks one sentence of a Sqoop Assist answer for the /assist demo page. The
 * page sends an answer sentence by sentence so speech starts quickly. The
 * voice (Piper) runs on our voice server (infra/voice-server, on the same
 * Vultr server as the payment proxy); this route only checks the request and
 * passes it on. If the voice server is unreachable the page falls back to the
 * device's own voice.
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

export async function POST(request) {
  if (!sameSite(request)) return Response.json({ error: 'Not allowed.' }, { status: 403 });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allowed(ip)) return Response.json({ error: 'Too many requests.' }, { status: 429 });

  const { text } = await request.json().catch(() => ({}));
  const sentence = typeof text === 'string' ? text.trim() : '';
  if (!sentence || sentence.length > MAX_CHARS) {
    return Response.json({ error: 'Text is required (max 300 characters).' }, { status: 400 });
  }

  if (!isVoiceServerConfigured()) {
    return Response.json({ error: 'Voice is unavailable right now.' }, { status: 503 });
  }

  try {
    const res = await voiceServerFetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentence }),
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
