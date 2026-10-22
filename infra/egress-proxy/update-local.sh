#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" != 0 ]; then exec sudo -n bash "$0" "$@"; fi
source_file=${1:?Usage: update-local.sh proxy.cjs}
/usr/bin/node --check "$source_file"
backup="/opt/egress/proxy.cjs.backup-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p /opt/egress/proxy.cjs "$backup"
restore() {
  echo 'Egress update failed; restoring the previous source.' >&2
  cp -p "$backup" /opt/egress/proxy.cjs
  systemctl restart egress
}
trap restore ERR
install -o root -g root -m 0644 "$source_file" /opt/egress/proxy.cjs
systemctl restart egress
systemctl is-active --quiet egress
health_check() {
/usr/bin/node <<'JS'
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const config = Object.fromEntries(fs.readFileSync('/etc/egress.env', 'utf8').split('\n')
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const at = line.indexOf('='); return [line.slice(0,at), line.slice(at+1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const expected = crypto.createHash('sha256').update(fs.readFileSync('/opt/egress/proxy.cjs')).digest('hex').slice(0,12);
const request = https.get({hostname:'127.0.0.1',port:Number(config.PROXY_PORT || 3129),path:'/health',
  ca:fs.readFileSync(config.PROXY_CERT),checkServerIdentity:()=>undefined}, response => {
  let body=''; response.on('data',chunk=>body+=chunk);
  response.on('end',()=>{
    if(response.statusCode!==200 || body!=='ok' || response.headers['x-egress-revision']!==expected) {
      console.error('New proxy health/revision check failed.'); process.exitCode=1;
    } else console.log('Egress healthy; deployed revision '+expected);
  });
});
request.setTimeout(5000,()=>request.destroy(new Error('Health check timed out')));
request.on('error',error=>{console.error(error.message);process.exitCode=1;});
JS
}
healthy=false
for attempt in 1 2 3 4 5; do
  if health_check; then healthy=true; break; fi
  sleep 1
done
"$healthy"
trap - ERR
echo "Previous source retained at $backup"
