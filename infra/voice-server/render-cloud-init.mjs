#!/usr/bin/env node
/**
 * Build the cloud-init user-data that turns a fresh Ubuntu 24.04 server into
 * the voice server on first boot, with no one having to log in to it.
 *
 *   node render-cloud-init.mjs <secrets-dir> > user-data.yaml
 *
 * <secrets-dir> must hold voice.crt, voice.key and secret (see README.md).
 * The output contains the private key and secret: keep it out of the repo.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) {
  console.error('usage: node render-cloud-init.mjs <secrets-dir>');
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const own = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const indent = (s) => s.trimEnd().split('\n').map((l) => '      ' + l).join('\n');

const secret = read('secret').trim();
if (!/^[A-Za-z0-9]{24,}$/.test(secret)) throw new Error('secret must be 24+ letters/digits');
// The lock file is the bulk of the user-data; compress it to stay well under the size limit.
const lock = zlib.gzipSync(own('package-lock.json'), { level: 9 }).toString('base64');

process.stdout.write(`#cloud-config
package_update: true
package_upgrade: true
packages:
  - ca-certificates
  - curl
  - xz-utils
  - ufw
  - unattended-upgrades
users:
  - name: voice
    system: true
    shell: /usr/sbin/nologin
write_files:
  - path: /opt/voice/server.mjs
    permissions: '0644'
    content: |
${indent(own('server.mjs'))}
  - path: /opt/voice/package.json
    permissions: '0644'
    content: |
${indent(own('package.json'))}
  - path: /opt/voice/package-lock.json
    permissions: '0644'
    encoding: gz+b64
    content: ${lock}
  - path: /opt/voice/setup.sh
    permissions: '0755'
    content: |
${indent(own('setup.sh'))}
  - path: /opt/voice/voice.crt
    permissions: '0644'
    content: |
${indent(read('voice.crt'))}
  - path: /opt/voice/voice.key
    permissions: '0600'
    content: |
${indent(read('voice.key'))}
  - path: /etc/voice.env
    permissions: '0600'
    content: |
      PORT=443
      TLS_CERT=/opt/voice/voice.crt
      TLS_KEY=/opt/voice/voice.key
      VOICE_SECRET=${secret}
      MODEL_CACHE=/var/lib/voice/hf-cache
  - path: /etc/systemd/system/voice.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Sqoop Assist voice server
      After=network-online.target
      Wants=network-online.target

      [Service]
      User=voice
      EnvironmentFile=/etc/voice.env
      WorkingDirectory=/opt/voice
      ExecStart=/opt/node/bin/node /opt/voice/server.mjs
      AmbientCapabilities=CAP_NET_BIND_SERVICE
      NoNewPrivileges=true
      ProtectSystem=strict
      ProtectHome=true
      PrivateTmp=true
      StateDirectory=voice
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target
runcmd:
  - chown voice:voice /opt/voice/voice.key
  - /opt/voice/setup.sh
  - ufw --force reset
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 443/tcp
  - ufw --force enable
  - systemctl daemon-reload
  - systemctl enable --now voice
`);
