#!/usr/bin/env node
/**
 * Build the cloud-init user-data that turns a fresh Debian 12 (or Ubuntu) server into
 * the egress proxy on first boot, with no one having to log in to it.
 *
 *   node render-cloud-init.mjs <secrets-dir> > user-data.yaml
 *
 * <secrets-dir> must hold proxy.crt, proxy.key and password (see README.md).
 * The output contains the private key and password: keep it out of the repo.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) {
  console.error('usage: node render-cloud-init.mjs <secrets-dir>');
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const indent = (s) => s.trimEnd().split('\n').map((l) => '      ' + l).join('\n');

const password = read('password').trim();
if (!/^[A-Za-z0-9]{24,}$/.test(password)) throw new Error('password must be 24+ letters/digits');
const allow = process.env.PROXY_ALLOW || 'pay.lipapayug.com';

process.stdout.write(`#cloud-config
package_update: true
package_upgrade: true
packages:
  - nodejs
  - ufw
  - unattended-upgrades
users:
  - name: egress
    system: true
    shell: /usr/sbin/nologin
write_files:
  - path: /opt/egress/proxy.cjs
    permissions: '0644'
    content: |
${indent(fs.readFileSync(path.join(here, 'proxy.cjs'), 'utf8'))}
  - path: /opt/egress/proxy.crt
    permissions: '0644'
    content: |
${indent(read('proxy.crt'))}
  - path: /opt/egress/proxy.key
    permissions: '0600'
    content: |
${indent(read('proxy.key'))}
  - path: /etc/egress.env
    permissions: '0600'
    content: |
      PROXY_PORT=443
      PROXY_CERT=/opt/egress/proxy.crt
      PROXY_KEY=/opt/egress/proxy.key
      PROXY_PASSWORD=${password}
      PROXY_ALLOW=${allow}
  - path: /etc/systemd/system/egress.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Payment API egress proxy
      After=network-online.target
      Wants=network-online.target

      [Service]
      User=egress
      EnvironmentFile=/etc/egress.env
      ExecStart=/usr/bin/node /opt/egress/proxy.cjs
      AmbientCapabilities=CAP_NET_BIND_SERVICE
      NoNewPrivileges=true
      ProtectSystem=strict
      ProtectHome=true
      PrivateTmp=true
      Restart=always
      RestartSec=2

      [Install]
      WantedBy=multi-user.target
runcmd:
  - chown egress:egress /opt/egress/proxy.key
  - ufw default deny incoming
  - ufw allow 22/tcp
  - ufw allow 443/tcp
  - ufw --force enable
  - systemctl daemon-reload
  - systemctl enable --now egress
`);
