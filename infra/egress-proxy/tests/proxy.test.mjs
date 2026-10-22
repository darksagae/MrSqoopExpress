import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import net from 'node:net';
import https from 'node:https';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createProxy, REVISION } = require('../proxy.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mse-proxy-test-'));
execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')], {stdio:'ignore'});
const cert = fs.readFileSync(path.join(dir,'cert.pem'));
const key = fs.readFileSync(path.join(dir,'key.pem'));
const password = 'offline-proxy-test-password-12345';
const authorization = 'Basic '+Buffer.from('shop:'+password).toString('base64');
const logger = {info(){},warn(){}};
test.after(() => fs.rmSync(dir,{recursive:true,force:true}));
async function fixture(t, options={}) {
  const upstream=net.createServer((s)=>s.pipe(s));
  const connections = new Set();
  upstream.on('connection',s=>{connections.add(s);s.on('close',()=>connections.delete(s));});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const server=createProxy({cert,key,password,allow:'pay.test',logger,
    connect:()=>net.connect(upstream.address().port,'127.0.0.1'),...options});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.destroyTunnels();for(const s of connections)s.destroy();await Promise.all([
    new Promise(r=>server.close(r)),new Promise(r=>upstream.close(r))]);});
  return {server,upstream,port:server.address().port};
}
async function tunnel(port, {host='pay.test:443',auth=authorization}={}) {
  const socket=tls.connect({host:'127.0.0.1',port,servername:'localhost',ca:cert});
  await once(socket,'secureConnect');
  const header=new Promise((resolve,reject)=>{
    let data=Buffer.alloc(0);
    const listen=(chunk)=>{data=Buffer.concat([data,chunk]);const end=data.indexOf('\r\n\r\n');
      if(end>=0){socket.off('data',listen);resolve(data.toString());}};
    socket.on('data',listen);socket.on('error',reject);
  });
  socket.write(`CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\nProxy-Authorization: ${auth}\r\n\r\n`);
  return {socket,header:await header};
}
test('health preserves ok body and exposes the deployed code revision',async(t)=>{
  const {port}=await fixture(t);
  const result=await new Promise((resolve,reject)=>https.get({hostname:'127.0.0.1',port,servername:'localhost',ca:cert,path:'/health'},r=>{
    let body='';r.on('data',c=>body+=c);r.on('end',()=>resolve({body,headers:r.headers}));
  }).on('error',reject));
  assert.equal(result.body,'ok');assert.equal(result.headers['x-egress-revision'],REVISION);
});
test('unauthorized CONNECT never opens an upstream tunnel',async(t)=>{
  let called=0;const {port}=await fixture(t,{connect:()=>{called++;throw Error('must not connect');}});
  const {socket,header}=await tunnel(port,{auth:'Basic invalid'});assert.match(header,/407/);socket.destroy();assert.equal(called,0);
});
test('destination allowlist and HTTPS port remain enforced',async(t)=>{
  const {port}=await fixture(t);
  for(const host of ['other.test:443','pay.test:80','pay.test.attacker.test:443']) {
    const {socket,header}=await tunnel(port,{host});assert.match(header,/403/);socket.destroy();
  }
});
test('established CONNECT carries bytes unchanged',async(t)=>{
  const {port}=await fixture(t);const {socket,header}=await tunnel(port);assert.match(header,/200 Connection Established/);
  const payload=Buffer.from([0x16,0x03,0x03,0x00,0x06,0,1,2,3,4,5]);
  const received=once(socket,'data');socket.write(payload);assert.deepEqual((await received)[0],payload);socket.destroy();
});
test('connection refusal returns a proper pre-tunnel 502',async(t)=>{
  const closed=net.createServer();closed.listen(0,'127.0.0.1');await once(closed,'listening');const portClosed=closed.address().port;
  await new Promise(r=>closed.close(r));
  const {port}=await fixture(t,{connect:()=>net.connect(portClosed,'127.0.0.1')});
  const {socket,header}=await tunnel(port);assert.match(header,/502 Bad Gateway/);socket.destroy();
});
test('upstream failure after CONNECT closes instead of injecting HTTP into payment TLS',async(t)=>{
  let upstreamSocket;const {port}=await fixture(t,{connect:(_,host)=>{assert.equal(host,'pay.test');upstreamSocket=new net.Socket();
    setImmediate(()=>upstreamSocket.emit('connect'));return upstreamSocket;}});
  const {socket,header}=await tunnel(port);assert.match(header,/200 Connection Established/);
  let received='';socket.on('data',c=>received+=c.toString());const closed=new Promise(r=>socket.once('close',r));
  upstreamSocket.destroy(Object.assign(new Error('reset'),{code:'ECONNRESET'}));await closed;
  assert.doesNotMatch(received,/HTTP\/1.1 502/);
});
