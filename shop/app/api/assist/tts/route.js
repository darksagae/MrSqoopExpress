/**
 * POST /api/assist/tts  { text }
 *
 * Speaks a Sqoop Assist answer with an ElevenLabs voice for the /assist demo
 * page. Off unless ELEVENLABS_API_KEY is set; the page then falls back to the
 * browser's own voice. Every call spends ElevenLabs credits, so requests must
 * come from this site, text is capped, and each visitor is rate limited.
 */
export const dynamic = 'force-dynamic';

const VOICE_ID = process.env.ASSIST_VOICE_ID || 'cgSgspJ2msm6clMCkdW9'; // Jessica
const MODEL_ID = 'eleven_flash_v2_5'; // fastest and cheapest
const MAX_CHARS = 600;
const LIMIT = 20; // answers per visitor per window
const WINDOW_MS = 10 * 60 * 1000;

// Per-instance only, but enough to stop one visitor running up the bill.
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
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: 'Voice is not configured.' }, { status: 503 });
  if (!sameSite(request)) return Response.json({ error: 'Not allowed.' }, { status: 403 });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allowed(ip)) return Response.json({ error: 'Too many requests.' }, { status: 429 });

  const { text } = await request.json().catch(() => ({}));
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) {
    return Response.json({ error: 'Text is required (max 600 characters).' }, { status: 400 });
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
    }
  );
  if (!res.ok) {
    console.error('[assist/tts] ElevenLabs error', res.status, (await res.text()).slice(0, 200));
    return Response.json({ error: 'Voice is unavailable right now.' }, { status: 502 });
  }
  return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}
