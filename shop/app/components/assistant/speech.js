/**
 * Voice for Sqoop Assist in the browser: answers are spoken with our Piper
 * voice (/api/assist/tts, one sentence at a time so speech starts quickly,
 * fetching the next sentence while one plays), falling back to the device's
 * own voice; questions are heard with the browser's speech recognition.
 */

const FIRST_SENTENCE_WAIT_MS = 6000;
let player = null;
let speaking = 0; // bumped to cancel whatever is playing

function getPlayer() {
  if (!player && typeof Audio !== 'undefined') player = new Audio();
  return player;
}

/** iOS only plays audio started from a tap; call this from the tap that leads to speech. */
export function unlockAudio() {
  const p = getPlayer();
  if (!p || p.dataset?.unlocked) return;
  // A tiny silent clip, played inside the user's tap.
  p.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABgAAAykAWlpaWlpaWlpaWlpaWlpaWnt7e3t7e3t7e3t7e3t7e3t7nJycnJycnJycnJycnJycnL29vb29vb29vb29vb29vb293t7e3t7e3t7e3t7e3t7e3t7/////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCowAAAAAAAAMpso+sIAAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
  p.play().catch(() => {});
  if (p.dataset) p.dataset.unlocked = '1';
}

export function stopSpeaking() {
  speaking++;
  const p = getPlayer();
  if (p) p.pause();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => (s.length <= 280 ? [s] : s.match(/.{1,280}(\s|$)/g).map((x) => x.trim())));
}

function fetchVoice(sentence) {
  return fetch('/api/assist/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: sentence }),
  })
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null);
}

function playBlob(blob, run) {
  return new Promise((resolve) => {
    const p = getPlayer();
    if (!p || run !== speaking) return resolve();
    const url = URL.createObjectURL(blob);
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    p.src = url;
    p.onended = done;
    p.onerror = done;
    p.onpause = done;
    p.play().catch(done);
  });
}

function speakWithDevice(text, run) {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined' || run !== speaking) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

/** Speak an answer. Resolves when it has finished (or was stopped). */
export async function speak(text) {
  stopSpeaking();
  const run = speaking;
  const parts = sentences(text);
  if (!parts.length) return;
  let next = fetchVoice(parts[0]);
  const first = await Promise.race([next, new Promise((r) => setTimeout(() => r('slow'), FIRST_SENTENCE_WAIT_MS))]);
  if (run !== speaking) return;
  if (!first || first === 'slow') return speakWithDevice(text, run);
  for (let i = 0; i < parts.length; i++) {
    const blob = i === 0 ? first : await next;
    if (run !== speaking) return;
    if (i + 1 < parts.length) next = fetchVoice(parts[i + 1]);
    if (!blob) return speakWithDevice(parts.slice(i).join(' '), run);
    await playBlob(blob, run);
  }
}

export function canListen() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Listen for one question.
 * @returns {() => void} stop function
 */
export function listen({ onText, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.onresult = (e) => onText(e.results[0][0].transcript);
  rec.onend = () => onEnd?.();
  rec.onerror = () => onEnd?.();
  rec.start();
  return () => rec.stop();
}
