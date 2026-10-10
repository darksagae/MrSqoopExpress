#!/usr/bin/env node
/**
 * Sqoop Assist voice server: the Kokoro-82M voice (Apache-2.0) kept loaded in
 * memory on a Vultr server. On Vercel every cold start downloaded and loaded
 * the 326 MB model and the shared CPU generated slower than real time; here the
 * model loads once at boot and a sentence is ready in about a second.
 *
 *   POST /tts  {"text": "..."}  Authorization: Bearer <VOICE_SECRET>  ->  audio/wav
 *   GET  /health                                                      ->  ok | loading
 *
 * Only the shop's /api/assist/tts calls it, which keeps the per-visitor rate
 * limit and same-site check. TLS uses a self-signed certificate that the shop
 * pins (VOICE_SERVER_CA), so the server needs no domain name.
 *
 * Env: VOICE_SECRET, TLS_CERT, TLS_KEY, PORT (443), MODEL_CACHE, VOICE (af_heart)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import { AutoTokenizer, StyleTextToSpeech2Model, env } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = process.env.VOICE || 'af_heart';
const PORT = Number(process.env.PORT || 443);
const SECRET = process.env.VOICE_SECRET || '';
const MAX_CHARS = 300;
const MAX_WAITING = 20; // sentences queued before we answer "busy"
const CACHE_MAX = 300; // ~250 KB each

if (SECRET.length < 24) throw new Error('VOICE_SECRET must be at least 24 characters');
env.cacheDir = process.env.MODEL_CACHE || '/var/lib/voice/hf-cache';

let tts = null;

async function load() {
  const started = Date.now();
  // Load the model ourselves (rather than KokoroTTS.from_pretrained) so ONNX
  // uses every core for one sentence: sentences are generated one at a time.
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(MODEL, {
      dtype: 'fp32',
      device: 'cpu',
      session_options: { intraOpNumThreads: os.availableParallelism(), interOpNumThreads: 1 },
    }),
    AutoTokenizer.from_pretrained(MODEL),
  ]);
  const ready = new KokoroTTS(model, tokenizer);
  await ready.generate('Hello.', { voice: VOICE }); // warm up before taking traffic
  tts = ready;
  console.log(`voice ready in ${Date.now() - started} ms`);
}

// One sentence at a time: two at once would just split the same cores.
let queue = Promise.resolve();
let waiting = 0;
function enqueue(job) {
  waiting++;
  const run = queue.then(job).finally(() => waiting--);
  queue = run.catch(() => {});
  return run;
}

// Short prompts ("What's your order number?") come up again and again.
const cache = new Map();
function remember(text, wav) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(text, wav);
}

/**
 * Kokoro returns 32-bit float samples; 16-bit PCM halves the download on
 * mobile data and plays in every browser, including Safari.
 */
function toWav16(samples, rate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

const secretHash = crypto.createHash('sha256').update(SECRET).digest();
function authorized(req) {
  const given = (req.headers.authorization || '').replace(/^Bearer /, '');
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), secretHash);
}

function readJson(req, limit = 4096) {
  return new Promise((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function send(res, status, body, type = 'text/plain') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function handle(req, res) {
  if (req.method === 'GET' && req.url === '/health') return send(res, tts ? 200 : 503, tts ? 'ok' : 'loading');
  if (req.method !== 'POST' || req.url !== '/tts') return send(res, 404, 'not found');
  if (!authorized(req)) return send(res, 401, 'unauthorized');
  if (!tts) return send(res, 503, 'loading');

  const body = await readJson(req);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_CHARS) return send(res, 400, `text is required (max ${MAX_CHARS} characters)`);

  let wav = cache.get(text);
  if (!wav) {
    if (waiting >= MAX_WAITING) return send(res, 503, 'busy');
    wav = await enqueue(async () => {
      const audio = await tts.generate(text, { voice: VOICE });
      return toWav16(audio.audio, audio.sampling_rate);
    });
    remember(text, wav);
  }
  send(res, 200, wav, 'audio/wav');
}

const server = https.createServer(
  { cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) },
  (req, res) => {
    handle(req, res).catch((error) => {
      console.error('request failed:', error);
      if (!res.headersSent) send(res, 500, 'error');
    });
  }
);
server.requestTimeout = 60_000;
server.listen(PORT, () => console.log(`listening on ${PORT}`));

load().catch((error) => {
  console.error('model failed to load:', error);
  process.exit(1); // systemd restarts us
});
