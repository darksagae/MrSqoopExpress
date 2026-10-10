import { speak } from '@/lib/assist/kokoro';

/**
 * POST /api/assist/tts  { text }  ->  audio/wav
 *
 * Speaks one sentence of a Sqoop Assist answer for the /assist demo page with
 * Kokoro, a free open-source voice running on this server. The page sends an
 * answer sentence by sentence so speech starts quickly. Generating audio uses
 * server CPU, so requests must come from this site, sentences are capped and
 * each visitor is rate limited.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CHARS = 300;
const LIMIT = 60; // sentences per visitor per window
const WINDOW_MS = 10 * 60 * 1000;

// Per-instance only, but enough to stop one visitor hogging the server.
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

// The same short prompts ("What's your order number?") come up again and again.
const cache = new Map();
const CACHE_MAX = 50;

export async function POST(request) {
  if (!sameSite(request)) return Response.json({ error: 'Not allowed.' }, { status: 403 });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allowed(ip)) return Response.json({ error: 'Too many requests.' }, { status: 429 });

  const { text } = await request.json().catch(() => ({}));
  const sentence = typeof text === 'string' ? text.trim() : '';
  if (!sentence || sentence.length > MAX_CHARS) {
    return Response.json({ error: 'Text is required (max 300 characters).' }, { status: 400 });
  }

  try {
    let wav = cache.get(sentence);
    if (!wav) {
      wav = await speak(sentence);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(sentence, wav);
    }
    return new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[assist/tts] Kokoro failed:', error);
    return Response.json({ error: 'Voice is unavailable right now.' }, { status: 503 });
  }
}
