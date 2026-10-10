/**
 * GET /assist
 *
 * A browser simulation of Alexa+ talking to Sqoop Assist (/api/mcp), so the
 * voice integration can be tried and demoed without an Echo device.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sqoop Assist · Alexa+ for Mr Sqoop Express</title>
<style>
  :root { --bg:#0b1220; --panel:#121b2e; --line:#22314f; --text:#e8eefc; --muted:#8fa3c7; --cyan:#22d3ee; --blue:#3b82f6; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--text); font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  header { display:flex; align-items:center; justify-content:space-between; padding:18px 28px; border-bottom:1px solid var(--line); }
  header b { font-size:20px; letter-spacing:.2px; }
  header span { color:var(--muted); font-size:14px; }
  main { flex:1; min-height:0; width:100%; display:grid; grid-template-columns: 1fr 360px; gap:24px; padding:20px 28px; max-width:1400px; margin:0 auto; }
  main { grid-template-columns: minmax(0,1fr) 360px; }
  #lastcall { display:none; text-align:center; font-family:ui-monospace,Menlo,monospace; font-size:12px; color:var(--cyan); margin:-6px 0 10px; }
  .stage { background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:24px; display:flex; flex-direction:column; min-height:0; }
  .orb-wrap { display:flex; justify-content:center; padding:0 0 14px; }
  .orb { width:64px; height:64px; border-radius:50%; background:radial-gradient(circle at 50% 45%, #0e1a33 55%, transparent 56%), conic-gradient(var(--cyan), var(--blue), var(--cyan)); box-shadow:0 0 0 0 rgba(34,211,238,.6); transition:transform .2s; }
  .orb.listening { animation:pulse 1.2s infinite; }
  .orb.speaking { animation:spin 1.4s linear infinite, pulse 1.4s infinite; }
  .orb.thinking { animation:spin .8s linear infinite; }
  @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(34,211,238,.55)} 70%{box-shadow:0 0 0 22px rgba(34,211,238,0)} 100%{box-shadow:0 0 0 0 rgba(34,211,238,0)} }
  @keyframes spin { to { transform:rotate(360deg) } }
  #log { flex:1; min-height:0; overflow-y:auto; scroll-behavior:smooth; display:flex; flex-direction:column; gap:14px; padding:4px; }
  .msg { max-width:80%; padding:14px 18px; border-radius:18px; line-height:1.45; font-size:18px; }
  .you { align-self:flex-end; background:#1e3a8a; border-bottom-right-radius:6px; }
  .alexa { align-self:flex-start; background:#0f2a3a; border:1px solid #155e75; border-bottom-left-radius:6px; }
  .who { font-size:12px; color:var(--muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:1px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; align-self:stretch; }
  .card { background:#0c1426; border:1px solid var(--line); border-radius:14px; overflow:hidden; font-size:14px; }
  .card img { width:100%; aspect-ratio:1; object-fit:cover; background:#fff; }
  .card div { padding:10px 12px; }
  .card .t { color:var(--text); margin-bottom:6px; min-height:36px; }
  .card .p { color:var(--cyan); font-weight:700; font-size:16px; }
  .card .d { color:var(--muted); font-size:12px; margin-top:4px; }
  form { display:flex; gap:10px; margin-top:16px; }
  input { flex:1; background:#0c1426; border:1px solid var(--line); color:var(--text); border-radius:999px; padding:14px 20px; font-size:17px; }
  button { background:var(--blue); color:#fff; border:0; border-radius:999px; padding:0 22px; font-size:16px; cursor:pointer; }
  button.mic { background:#0e7490; width:52px; padding:0; font-size:22px; }
  aside { background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:20px; font-size:14px; overflow-y:auto; min-height:0; }
  aside h3 { font-size:14px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; }
  .call { background:#0c1426; border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:10px; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; white-space:pre-wrap; word-break:break-word; }
  .call b { color:var(--cyan); }
  .flow { color:var(--muted); line-height:1.6; margin-bottom:18px; }
  .flow code { color:var(--text); }
  @media (max-width:900px){ body { height:100dvh; } header { padding:12px 16px; } header span { display:none; } main { grid-template-columns:minmax(0,1fr); padding:10px; gap:0; } aside { display:none; } .stage { padding:14px; border-radius:16px; } .msg { max-width:92%; font-size:16px; } .cards { grid-template-columns:repeat(2,minmax(0,1fr)); } #lastcall { display:block; } input { font-size:16px; padding:12px 16px; min-width:0; } button { padding:0 16px; } button.mic { width:44px; flex:none; } .cards { max-width:100%; } }
</style>
</head>
<body>
<header><b>Sqoop Assist</b><span>Alexa+ experience for Mr Sqoop Express · powered by MCP</span></header>
<main>
  <section class="stage">
    <div class="orb-wrap"><div class="orb" id="orb"></div></div>
    <div id="lastcall"></div>
    <div id="log"></div>
    <form id="f">
      <button type="button" class="mic" id="mic" title="Speak">🎤</button>
      <input id="q" autocomplete="off" placeholder='Try: "Find me wireless earbuds under 150,000 shillings"'>
      <button>Ask</button>
    </form>
  </section>
  <aside>
    <h3>How it works</h3>
    <p class="flow">You speak → Alexa+ → <code>Sqoop Assist MCP server</code> at <code>/api/mcp</code> (Streamable HTTP) → live Mr Sqoop Express store data → spoken answer. This page simulates Alexa+ in your browser.</p>
    <h3>MCP tool calls</h3>
    <div id="calls"><div class="call" style="color:var(--muted)">Waiting for your first question…</div></div>
  </aside>
</main>
<script>
const sessionMem = { lastProducts: [], pendingOrder: null };
let rpcId = 0;
async function callTool(name, args) {
  const r = await fetch('/api/mcp', { method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const res = j.result || {};
  return { speech: (res.content || []).filter(c => c.type === 'text').map(c => c.text).join(' '), data: res.structuredContent };
}
const ORDER_RE = /\\b(MSE[-\\s]?[A-Z0-9-]+)\\b/i, PHONE_RE = /(\\+?256|0)\\s?7\\d{2}\\s?\\d{3}\\s?\\d{3}/;
const ORDINALS = [[/\\b(second|2nd|two)\\b/, 1], [/\\b(third|3rd|three|last)\\b/, 2], [/\\b(first|1st)\\b/, 0]];
function parseAmount(s) {
  const m = s.match(/(?:under|below|less than|cheaper than|max|maximum)\\s+(?:ugx\\s*)?(\\d[\\d,.]*)\\s*(k|thousand|m|million)?/i);
  if (!m) return; let n = parseFloat(m[1].replace(/,/g, '')); const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1e3; if (u === 'm' || u === 'million') n *= 1e6; return n;
}
function searchTerm(s) {
  return s.toLowerCase().replace(/\\b(alexa|please|can you|could you|find me|find|show me|show|search for|search|look for|i want|i need|get me|some|a|an|any)\\b/g, ' ')
    .replace(/\\b(under|below|less than|cheaper than)\\b.*$/, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();
}
function remember(data) { if (data?.products?.length) sessionMem.lastProducts = data.products.map(p => ({ id: p.id })); }
async function think(u) {
  const lower = u.toLowerCase();
  const orderId = u.match(ORDER_RE)?.[1]?.replace(/\\s/g, '-').toUpperCase();
  const phone = u.match(PHONE_RE)?.[0]?.replace(/\\s/g, '');
  if (/\\b(order|track|where is my|package)\\b/.test(lower) || orderId || (sessionMem.pendingOrder && phone)) {
    const id = orderId || sessionMem.pendingOrder;
    if (!id) return { speech: "Sure. What's your order number? It starts with M S E." };
    if (!phone) { sessionMem.pendingOrder = id; return { speech: \`Got it, order \${id}. For your security, what phone number did you use at checkout?\` }; }
    sessionMem.pendingOrder = null; const args = { order_id: id, phone };
    return { tool: 'track_order', args, ...(await callTool('track_order', args)) };
  }
  if (/\\b(deal|deals|offer|offers|trending|popular|discount|promo)\\b/.test(lower)) {
    const r = await callTool('get_deals', {}); remember(r.data); return { tool: 'get_deals', args: {}, ...r };
  }
  if (/\\b(how much|price|cost|shipping|breakdown|deliver)\\b/.test(lower) && sessionMem.lastProducts.length) {
    const idx = ORDINALS.find(([re]) => re.test(lower))?.[1] ?? 0;
    const pick = sessionMem.lastProducts[Math.min(idx, sessionMem.lastProducts.length - 1)];
    const args = { product_id: pick.id }; return { tool: 'get_price_quote', args, ...(await callTool('get_price_quote', args)) };
  }
  const query = searchTerm(u);
  if (!query) return { speech: "You can ask me to find a product, check a price, track your order or hear today's deals." };
  const args = { query }; const max = parseAmount(u); if (max) args.max_price_ugx = max;
  const r = await callTool('search_products', args); remember(r.data); return { tool: 'search_products', args, ...r };
}
const log = document.getElementById('log'), orb = document.getElementById('orb'), calls = document.getElementById('calls');
const fmt = n => new Intl.NumberFormat('en-UG').format(Math.round(n));

function add(cls, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.innerHTML = \`<div class="who">\${cls === 'you' ? 'You' : 'Alexa'}</div>\`;
  el.appendChild(document.createTextNode(text));
  log.appendChild(el); log.scrollTop = log.scrollHeight;
}
function cards(data) {
  const list = data?.products || (data?.product ? [data.product] : []);
  if (!list.length) return;
  const wrap = document.createElement('div'); wrap.className = 'cards';
  for (const p of list) {
    wrap.insertAdjacentHTML('beforeend', \`<a class="card" href="\${p.url}" target="_blank" style="text-decoration:none">
      <img src="\${p.image}" alt=""><div><div class="t">\${p.title}</div>
      <div class="p">UGX \${fmt(p.totalUGX)}</div><div class="d">Delivered to Uganda · \${p.delivery.replace(/^delivery takes /, "")}</div></div></a>\`);
  }
  log.appendChild(wrap); log.scrollTop = log.scrollHeight;
}
function showCall(tool, args) {
  if (calls.firstElementChild?.style.color) calls.innerHTML = '';
  document.getElementById('lastcall').textContent = 'MCP tools/call → ' + tool;
  calls.insertAdjacentHTML('afterbegin', \`<div class="call"><b>tools/call</b> \${tool}\\n\${JSON.stringify(args, null, 2)}</div>\`);
}
// Best voice first: ElevenLabs through /api/assist/tts, else the nicest voice the device has.
const player = new Audio();
let ttsOff = false, unlocked = false;
function unlockAudio() {
  // iOS only lets audio play after a tap, so prime the player on the first one.
  if (unlocked) return; unlocked = true;
  player.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABgAAAykAWlpaWlpaWlpaWlpaWlpaWnt7e3t7e3t7e3t7e3t7e3t7nJycnJycnJycnJycnJycnL29vb29vb29vb29vb29vb293t7e3t7e3t7e3t7e3t7e3t7/////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCowAAAAAAAAMpso+sIAAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
  player.play().then(() => player.pause()).catch(() => {});
}
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

function bestDeviceVoice() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  const prefer = ['natural', 'neural', 'premium', 'enhanced', 'google us english', 'samantha', 'ava', 'jenny', 'aria', 'zira'];
  for (const word of prefer) {
    const v = voices.find(x => x.name.toLowerCase().includes(word));
    if (v) return v;
  }
  return voices.find(v => v.lang === 'en-US') || voices[0];
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

function speakWithDevice(text) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = bestDeviceVoice(); if (v) u.voice = v;
    u.rate = 1.0; u.onend = u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}
// Kokoro (free, open-source) on this server, one sentence at a time so speech
// starts quickly. Falls back to the device voice if the server is slow or busy.
const FIRST_SENTENCE_WAIT_MS = 12000;
function sentences(text) {
  return text.split(/(?<=[.!?])\\s+/).map(s => s.trim()).filter(Boolean)
    .flatMap(s => s.length <= 280 ? [s] : s.match(/.{1,280}(\\s|$)/g).map(x => x.trim()));
}
function fetchVoice(sentence) {
  return fetch('/api/assist/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: sentence }) })
    .then(r => r.ok ? r.blob() : null).catch(() => null);
}
function playBlob(blob) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    player.src = url;
    player.onended = player.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    player.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
  });
}
async function speakWithServerVoice(text) {
  if (ttsOff) return false;
  const parts = sentences(text);
  if (!parts.length) return true;
  let next = fetchVoice(parts[0]);
  const first = await Promise.race([next, new Promise(r => setTimeout(() => r('slow'), FIRST_SENTENCE_WAIT_MS))]);
  if (!first || first === 'slow') return false;
  for (let i = 0; i < parts.length; i++) {
    const blob = i === 0 ? first : await next;
    if (i + 1 < parts.length) next = fetchVoice(parts[i + 1]);
    if (!blob) { await speakWithDevice(parts.slice(i).join(' ')); return true; }
    await playBlob(blob);
  }
  return true;
}
async function speak(text) {
  if (window.SILENT) return;
  orb.className = 'orb speaking';
  try { if (!(await speakWithServerVoice(text))) await speakWithDevice(text); }
  finally { orb.className = 'orb'; }
}
async function ask(text) {
  add('you', text); orb.className = 'orb thinking';
  try {
    const t = await think(text);
    if (t.tool) showCall(t.tool, t.args);
    add('alexa', t.speech); cards(t.data);
    await speak(t.speech);
  } catch { add('alexa', "Sorry, something went wrong."); }
  orb.className = 'orb';
}
window.ask = ask;
document.getElementById('f').onsubmit = e => { e.preventDefault(); const q = document.getElementById('q'); if (q.value.trim()) { ask(q.value.trim()); q.value = ''; } };
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
document.getElementById('mic').onclick = () => {
  if (!SR) return alert('Voice input needs Chrome. You can type instead.');
  const rec = new SR(); rec.lang = 'en-US'; orb.className = 'orb listening';
  rec.onresult = e => ask(e.results[0][0].transcript);
  rec.onend = () => { if (orb.className.includes('listening')) orb.className = 'orb'; };
  rec.start();
};
</script>
</body>
</html>
`;

export function GET() {
  return new Response(PAGE, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
