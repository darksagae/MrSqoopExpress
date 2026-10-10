# Voice server (Sqoop Assist's spoken answers)

The /assist page speaks answers sentence by sentence through the shop's
`/api/assist/tts`. That route keeps the same-site check and per-visitor rate
limit and forwards each sentence here (`POST /tts`, bearer secret, pinned
self-signed TLS on port 8443). If this server is down, the page falls back to
the device's own voice.

It runs [Piper](https://github.com/rhasspy/piper) (MIT) with the `en_US-lessac-high`
voice on the same $3.50 Vultr server as the payment egress proxy. On its one
core Piper makes speech about 4x faster than it plays (~0.5 s for a short
sentence) in ~210 MB. The Kokoro voice it replaces ran on Vercel and took
7-14 s per sentence; Kokoro also needs 300-700 MB and is slower than real time
on one core, so it can't share this server.

systemd runs it as `mse-voice` (Debian already has a `voice` group, which
makes a `voice` user impossible), with low CPU priority and a 300 MB memory
cap, so payments always come first. Piper peaks at ~250 MB while loading the
voice, so the setup adds a 1 GB swap file to absorb that on this 512 MB server.

`/health` says why the voice isn't ready (e.g. `piper ENOENT`) and shows the
end of `/var/log/voice-setup.log`. Only Vercel can reach port 8443 from our
side, so read it through the shop: `GET /api/admin/egress-check?voice=1`
with the `EGRESS_CHECK_TOKEN` bearer.

## Install (on the egress server)

1. Generate secrets somewhere outside the repo:
   ```
   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
     -subj "/CN=mse-voice" -keyout voice.key -out voice.crt
   openssl rand -hex 24 > secret
   ```
2. Render the server's user-data with both secret dirs:
   `node ../egress-proxy/render-cloud-init.mjs <egress-secrets> <voice-secrets> > user-data.yaml`
3. Set it as the instance's user-data and reinstall the instance through the
   Vultr API. The IP stays the same, so LipaPay's whitelist is unaffected. The
   proxy is back within a few minutes; the voice follows once Piper and the
   voice model (~140 MB) are downloaded.

## Connect the shop (Vercel project "shop")

- `VOICE_SERVER_URL` = `https://<ip>:8443`
- `VOICE_SERVER_SECRET` = contents of `secret`
- `VOICE_SERVER_CA` = contents of `voice.crt`
