#!/usr/bin/env node
/**
 * Sqoop Assist voice server: Piper (MIT, open source) with the "Lessac" voice
 * (medium quality), on the same 512 MB Vultr server as the payment egress
 * proxy. It needs ~100-220 MB and makes speech many times faster than it plays.
 * The high-quality model peaked over the service's memory cap while speaking,
 * which made it swap and take longer than the speech itself. The Kokoro voice
 * before that needed 300-700 MB and, on Vercel, took 7-14 s per sentence.
 *
 *   POST /tts  {"text": "..."}  Authorization: Bearer <VOICE_SECRET>  ->  audio/wav
 *   GET  /health                                                      ->  ok | loading
 *
 * Only the shop's /api/assist/tts calls it, which keeps the per-visitor rate
 * limit and same-site check. TLS uses a self-signed certificate that the shop
 * pins (VOICE_SERVER_CA), so the server needs no domain name.
 *
 * Env: VOICE_SECRET, TLS_CERT, TLS_KEY, PORT (8443), PIPER_BIN, PIPER_MODEL, OUT_DIR
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import readline from 'node:readline';

const PORT = Number(process.env.PORT || 8443);
const SECRET = process.env.VOICE_SECRET || '';
const PIPER_BIN = process.env.PIPER_BIN || '/opt/voice/piper/piper';
const PIPER_MODEL = process.env.PIPER_MODEL || '/opt/voice/en_US-lessac-medium.onnx';
const OUT_DIR = process.env.OUT_DIR || '/tmp/voice';
const SETUP_LOG = '/var/log/voice-setup.log';
const MAX_CHARS = 300;
const MAX_WAITING = 8; // sentences queued before we answer "busy" (keeps each under the timeout)
const JOB_TIMEOUT_MS = 20000;
const CACHE_MAX = 30; // ~200 KB each; memory is tight on this server

if (SECRET.length < 24) throw new Error('VOICE_SECRET must be at least 24 characters');

// Piper stays running and reads one JSON line per sentence, writes the WAV to
// the file named in that line and prints the file's path when it is done.
let piper = null;
let ready = false;
let problem = ''; // why the voice isn't ready, for /health
const jobs = new Map(); // output file -> { resolve, reject }

function startPiper() {
  const proc = spawn(PIPER_BIN, ['--model', PIPER_MODEL, '--json-input', '--quiet'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    const file = line.trim();
    jobs.get(file)?.resolve(file);
    jobs.delete(file);
  });
  proc.stdin.on('error', () => {}); // the stop handler deals with a dead process
  let stopped = false;
  const stop = (why, retryMs) => {
    if (stopped) return; // a failed start can report both 'error' and 'exit'
    stopped = true;
    console.error(`piper stopped (${why}), restarting`);
    problem = `piper ${why}`;
    piper = null;
    ready = false;
    for (const job of jobs.values()) job.reject(new Error('piper stopped'));
    jobs.clear();
    setTimeout(boot, retryMs);
  };
  // 'error' means it couldn't start at all (e.g. not installed yet): retry slowly.
  proc.on('error', (error) => stop(error.code || error.message, 10000));
  proc.on('exit', (code, signal) => stop(`exited ${code ?? signal}`, 2000));
  piper = proc;
}

async function synthesize(text) {
  if (!piper) throw new Error('piper is not running');
  const file = path.join(OUT_DIR, `${crypto.randomUUID()}.wav`);
  const done = new Promise((resolve, reject) => jobs.set(file, { resolve, reject }));
  const timer = setTimeout(() => piper?.kill(), JOB_TIMEOUT_MS); // stuck: restart it
  piper.stdin.write(JSON.stringify({ text, output_file: file }) + '\n');
  try {
    await done;
    return await fs.readFile(file);
  } finally {
    clearTimeout(timer);
    fs.unlink(file).catch(() => {});
  }
}

async function boot() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  startPiper();
  try {
    await synthesize('Hello.'); // loads the model before we take traffic
    ready = true;
    problem = '';
    console.log('voice ready');
  } catch (error) {
    console.error('warm-up failed:', error.message);
  }
}

// Piper works through lines one at a time; this caps how many can wait.
let waiting = 0;
async function queued(text) {
  waiting++;
  try {
    return await synthesize(text);
  } finally {
    waiting--;
  }
}

// Short prompts ("What's your order number?") come up again and again.
const cache = new Map();
function remember(text, wav) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(text, wav);
}

/** Why the voice isn't ready, including the end of the install log if it failed. */
function notReady() {
  let setup = '';
  try {
    setup = readFileSync(SETUP_LOG, 'utf8').trim().split('\n').slice(-3).join(' | ');
  } catch {}
  return ['loading', problem, setup && `setup: ${setup}`].filter(Boolean).join('; ');
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
  if (req.method === 'GET' && req.url === '/health') return send(res, ready ? 200 : 503, ready ? 'ok' : notReady());
  if (req.method !== 'POST' || req.url !== '/tts') return send(res, 404, 'not found');
  if (!authorized(req)) return send(res, 401, 'unauthorized');
  if (!ready) return send(res, 503, 'loading');

  const body = await readJson(req);
  // One line per sentence: control characters and newlines become spaces.
  const text = typeof body?.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim() : '';
  if (!text || text.length > MAX_CHARS) return send(res, 400, `text is required (max ${MAX_CHARS} characters)`);

  let wav = cache.get(text);
  if (!wav) {
    if (waiting >= MAX_WAITING) return send(res, 503, 'busy');
    wav = await queued(text);
    remember(text, wav);
  }
  send(res, 200, wav, 'audio/wav');
}

const server = https.createServer(
  { cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) },
  (req, res) => {
    handle(req, res).catch((error) => {
      console.error('request failed:', error.message);
      if (!res.headersSent) send(res, 503, 'voice failed');
    });
  }
);
server.requestTimeout = 30000;
server.listen(PORT, () => console.log(`listening on ${PORT}`));
boot();
