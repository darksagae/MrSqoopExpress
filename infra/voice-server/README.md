# Voice server (Sqoop Assist's Kokoro voice)

The /assist page speaks answers with Kokoro-82M, a free open-source voice. On
Vercel every cold start downloaded and loaded the 326 MB model, and the shared
CPU generated speech slower than it plays (7–14 s per sentence). This server
keeps the model loaded, so a sentence is ready in about 1–3 s on 2 cores.

The shop's `/api/assist/tts` keeps the same-site check and per-visitor rate
limit and forwards each sentence here (`POST /tts`, bearer secret). TLS uses a
self-signed certificate the shop pins, so no domain name is needed. If the
server is down, the page falls back to the device's own voice.

## Create the server

1. Generate secrets somewhere outside the repo:
   ```
   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
     -subj "/CN=mse-voice" -keyout voice.key -out voice.crt
   openssl rand -hex 24 > secret
   ```
2. `node render-cloud-init.mjs <that-dir> > user-data.yaml`
3. Create a Vultr instance (Ubuntu 24.04, 2 vCPU / 2 GB, e.g. `vhp-2c-2gb-amd`,
   region `ewr` next to Vercel's `iad1`) with that file as user-data. It
   configures itself on first boot (about 5 minutes) and only opens port 443.
4. Check `https://<ip>/health` answers `ok` (self-signed cert, so `curl -k`).

## Connect the shop (Vercel project "shop")

- `VOICE_SERVER_URL` = `https://<ip>`
- `VOICE_SERVER_SECRET` = contents of `secret`
- `VOICE_SERVER_CA` = contents of `voice.crt`

## Change the server

There is no SSH. To ship a new `server.mjs`, render new user-data and reinstall
the instance with it through the Vultr API (the IP stays the same).
