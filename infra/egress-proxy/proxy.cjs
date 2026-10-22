'use strict';
// Authenticated CONNECT tunnel. Payment TLS remains end-to-end: this process
// never decrypts payment payloads or sees the merchant signing key.
const fs = require('node:fs');
const net = require('node:net');
const https = require('node:https');
const crypto = require('node:crypto');
const REVISION = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').slice(0, 12);

function createProxy({ cert, key, password, allow, connect = net.connect,
  connectTimeout = 10000, idleTimeout = 60000, logger = console }) {
  if (typeof password !== 'string' || password.length < 24) throw Error('PROXY_PASSWORD must be at least 24 characters');
  const hosts = String(allow || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!hosts.length) throw Error('PROXY_ALLOW is empty');
  const expected = Buffer.from('Basic ' + Buffer.from('shop:' + password).toString('base64'));
  const server = https.createServer({ cert, key, minVersion: 'TLSv1.2', headersTimeout: 10000, requestTimeout: 15000 });
  const sockets = new Set();
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('request', (req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 405, {
      'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Egress-Revision': REVISION,
    });
    res.end(req.url === '/health' ? 'ok' : 'CONNECT only');
  });
  server.on('connect', (req, socket, head) => {
    socket.on('error', () => {});
    const reject = (code, reason) => {
      const challenge = code === 407 ? 'Proxy-Authenticate: Basic realm="egress"\r\n' : '';
      socket.end(`HTTP/1.1 ${code} ${reason}\r\n${challenge}Connection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    const given = Buffer.from(String(req.headers['proxy-authorization'] || ''));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return reject(407, 'Proxy Authentication Required');
    }
    const match = /^([a-z0-9.-]+):443$/i.exec(req.url || '');
    const host = match?.[1].toLowerCase();
    if (!host || !hosts.some((a) => a.startsWith('.') ? host === a.slice(1) || host.endsWith(a) : host === a)) {
      return reject(403, 'Forbidden');
    }
    const id = crypto.randomUUID();
    const started = Date.now();
    let established = false;
    let finished = false;
    const upstream = connect(443, host);
    const timer = setTimeout(() => upstream.destroy(Object.assign(new Error('Connect timed out'), { code: 'ETIMEDOUT' })), connectTimeout);
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      upstream.destroy();
      socket.destroy();
      logger.info(`[egress] closed ${id} host=${host} established=${established} ms=${Date.now() - started}`);
    };
    socket.on('close', finish);
    upstream.on('close', () => {
      if (finished) return;
      if (established && upstream.readableEnded) {
        clearTimeout(timer);
        socket.end(); // Let the last TLS bytes flush before closing.
      } else finish();
    });
    upstream.once('connect', () => {
      clearTimeout(timer);
      if (finished || socket.destroyed) return finish();
      established = true;
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
      socket.setTimeout(idleTimeout, finish);
      upstream.setTimeout(idleTimeout, finish);
      logger.info(`[egress] connected ${id} host=${host}`);
    });
    upstream.on('error', (error) => {
      clearTimeout(timer);
      logger.warn(`[egress] failed ${id} host=${host} code=${error.code || 'UNKNOWN'}`);
      if (established) {
        // HTTP inside an established tunnel corrupts the payment TLS stream.
        // Close it; the caller must reconcile an uncertain collection instead.
        finish();
      } else {
        finished = true;
        upstream.destroy();
        reject(502, 'Bad Gateway');
      }
    });
  });
  server.destroyTunnels = () => { for (const socket of sockets) socket.destroy(); };
  return server;
}

module.exports = { createProxy, REVISION };
if (require.main === module) {
  const server = createProxy({
    cert: fs.readFileSync(process.env.PROXY_CERT), key: fs.readFileSync(process.env.PROXY_KEY),
    password: process.env.PROXY_PASSWORD, allow: process.env.PROXY_ALLOW,
  });
  const port = Number(process.env.PROXY_PORT || 3129);
  server.listen(port, () => console.log(`[egress] listening on ${port} revision=${REVISION}`));
}
