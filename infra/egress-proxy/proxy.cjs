'use strict';
/**
 * Fixed-IP egress proxy for payment APIs that whitelist caller IPs (LipaPay).
 *
 * The shop's serverless functions have no fixed IP, so they open an HTTPS
 * CONNECT tunnel through this server instead. TLS to the payment API runs
 * end-to-end inside the tunnel: this process only ever sees the destination
 * host name, never request bodies or keys.
 *
 * Locked down three ways: TLS to the proxy itself, a Basic-auth password, and
 * an allowlist of destination hosts (port 443 only).
 *
 * Env: PROXY_PORT, PROXY_CERT, PROXY_KEY (file paths), PROXY_PASSWORD,
 *      PROXY_ALLOW (comma-separated hosts; ".example.com" also allows subdomains)
 */
const fs = require('fs');
const net = require('net');
const https = require('https');
const crypto = require('crypto');

const PORT = Number(process.env.PROXY_PORT || 3129);
const PASSWORD = process.env.PROXY_PASSWORD || '';
const ALLOW = String(process.env.PROXY_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const IDLE_MS = 60_000;

if (PASSWORD.length < 24) throw new Error('PROXY_PASSWORD must be at least 24 characters');
if (!ALLOW.length) throw new Error('PROXY_ALLOW is empty');

const expected = Buffer.from('Basic ' + Buffer.from('shop:' + PASSWORD).toString('base64'));

function authorized(header) {
  const given = Buffer.from(String(header || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function allowedHost(host) {
  const h = host.toLowerCase();
  return ALLOW.some((a) => (a.startsWith('.') ? h.endsWith(a) || h === a.slice(1) : h === a));
}

function reject(socket, status, text) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

const server = https.createServer({
  cert: fs.readFileSync(process.env.PROXY_CERT),
  key: fs.readFileSync(process.env.PROXY_KEY),
  minVersion: 'TLSv1.2',
});

// Plain requests are never proxied; only CONNECT tunnels are.
server.on('request', (req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 405, { 'Content-Type': 'text/plain' });
  res.end(req.url === '/health' ? 'ok' : 'CONNECT only');
});

server.on('connect', (req, socket, head) => {
  socket.on('error', () => {});
  if (!authorized(req.headers['proxy-authorization'])) {
    return socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="egress"\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }
  const m = /^([a-z0-9.-]+):(\d+)$/i.exec(req.url || '');
  if (!m || m[2] !== '443' || !allowedHost(m[1])) {
    console.warn(`[egress] refused ${req.url}`);
    return reject(socket, 403, 'Forbidden');
  }

  const upstream = net.connect(443, m[1], () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.setTimeout(IDLE_MS, () => upstream.destroy());
  socket.setTimeout(IDLE_MS, () => socket.destroy());
  upstream.on('error', (e) => {
    console.warn(`[egress] upstream ${m[1]} failed: ${e.code || e.message}`);
    reject(socket, 502, 'Bad Gateway');
  });
  socket.on('close', () => upstream.destroy());
  console.log(`[egress] tunnel ${m[1]}`);
});

server.listen(PORT, () => console.log(`[egress] listening on ${PORT}, allow: ${ALLOW.join(', ')}`));
