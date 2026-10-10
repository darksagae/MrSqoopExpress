/**
 * The voice server's part of the egress server's cloud-init user-data (it runs
 * on the same Vultr server). Used by infra/egress-proxy/render-cloud-init.mjs
 * when it is given a voice secrets dir holding voice.crt, voice.key and secret.
 *
 * Returns YAML fragments that slot into that file's lists.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const indent = (s) => s.trimEnd().split('\n').map((l) => '      ' + l).join('\n');

export function voiceCloudInit(dir) {
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const secret = read('secret').trim();
  if (!/^[A-Za-z0-9]{24,}$/.test(secret)) throw new Error('voice secret must be 24+ letters/digits');

  return {
    packages: `
  - ca-certificates
  - curl`,
    users: `
  - name: voice
    system: true
    shell: /usr/sbin/nologin`,
    files: `
  - path: /opt/voice/server.mjs
    permissions: '0644'
    content: |
${indent(fs.readFileSync(path.join(here, 'server.mjs'), 'utf8'))}
  - path: /opt/voice/setup.sh
    permissions: '0755'
    content: |
${indent(fs.readFileSync(path.join(here, 'setup.sh'), 'utf8'))}
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
      PORT=8443
      TLS_CERT=/opt/voice/voice.crt
      TLS_KEY=/opt/voice/voice.key
      VOICE_SECRET=${secret}
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
      ExecStart=/usr/bin/node /opt/voice/server.mjs
      NoNewPrivileges=true
      ProtectSystem=strict
      ProtectHome=true
      PrivateTmp=true
      # Payments come first: the voice gets the CPU and memory the proxy leaves.
      Nice=10
      CPUWeight=20
      MemoryMax=300M
      OOMScoreAdjust=500
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target`,
    // Runs after the proxy is up, so payments are back before the voice downloads.
    runcmd: `
  - chown voice:voice /opt/voice/voice.key
  - /opt/voice/setup.sh
  - ufw allow 8443/tcp
  - systemctl daemon-reload
  - systemctl enable --now voice`,
  };
}
