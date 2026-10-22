# Payment egress proxy (fixed IP for LipaPay)

LipaPay only accepts API calls from whitelisted IPs, and Vercel functions have no
fixed IP. A small Vultr server gives us one: the shop tunnels LipaPay requests
through it (`shop/lib/egress.js`). TLS to LipaPay runs end-to-end inside the
tunnel, so the server never sees keys or request bodies. It only accepts TLS,
needs a password, and only connects to hosts on `PROXY_ALLOW`, port 443.

## Create the server

1. Generate secrets somewhere outside the repo:
   ```
   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
     -subj "/CN=mse-egress-proxy" -keyout proxy.key -out proxy.crt
   openssl rand -hex 24 > password
   ```
2. `node render-cloud-init.mjs <that-dir> > user-data.yaml`
3. Create a Vultr instance (Debian 12 — Ubuntu 24.04 needs 1 GB RAM; plan `vc2-1c-0.5gb`, region `ewr`) with
   that file as user-data. It configures itself on first boot.
4. Check `https://<ip>/health` answers `ok` (self-signed cert, so `curl -k`).

The same server also runs the Sqoop Assist voice: pass the voice secrets dir as a
second argument to `render-cloud-init.mjs` (see `../voice-server/README.md`).

## Connect the shop (Vercel project "shop")

- `EGRESS_PROXY_URL` = `https://<ip>`
- `EGRESS_PROXY_AUTH` = contents of `password`
- `EGRESS_PROXY_CA` = contents of `proxy.crt`
- Send LipaPay the server IP to whitelist.

## Update an existing VPS

Run `./deploy.sh root@<vps-ip>` from this directory with the existing SSH key
loaded. The updater checks Node syntax, backs up `/opt/egress/proxy.cjs`,
restarts `egress`, and checks the pinned-certificate health endpoint and
`X-Egress-Revision` against the deployed source hash. It restores the previous
source if the restart or health check fails. The existing environment file,
password, certificates, IP address, and destination allowlist are retained.

The proxy is a CONNECT tunnel; Airtel request signing and the LipaPay API client
run in the Vercel `shop` project. Proxy credentials authorize tunnelling, not
SSH deployment. Updating a running VPS requires SSH access or a Vultr console
session in addition to the Vercel credentials.

Run the proxy regression suite with
`node --test infra/egress-proxy/tests/proxy.test.mjs` from the repository root.
