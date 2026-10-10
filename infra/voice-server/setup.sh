#!/bin/sh
# Downloads Piper and the Lessac voice (pinned, checksum-verified) into
# /opt/voice. cloud-init runs this once on first boot; see README.md.
set -eu

APP_DIR=${APP_DIR:-/opt/voice}
PIPER_URL=https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
PIPER_SHA256=a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992
VOICE_URL=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx
VOICE_SHA256=4cabf7c3a638017137f34a1516522032d4fe3f38228a843cc9b764ddcbcd9e09
CONFIG_SHA256=db42b97d9859f257bc1561b8ed980e7fb2398402050a74ddd6cbec931a92412f

work=$(mktemp -d)
fetch() { curl -fsSL --retry 5 --retry-delay 5 -o "$work/$2" "$1" && echo "$3  $work/$2" | sha256sum -c -; }
fetch "$PIPER_URL" piper.tar.gz "$PIPER_SHA256"
fetch "$VOICE_URL" en_US-lessac-high.onnx "$VOICE_SHA256"
fetch "$VOICE_URL.json" en_US-lessac-high.onnx.json "$CONFIG_SHA256"

mkdir -p "$APP_DIR"
tar -xzf "$work/piper.tar.gz" -C "$APP_DIR"
mv "$work/en_US-lessac-high.onnx" "$work/en_US-lessac-high.onnx.json" "$APP_DIR/"
rm -rf "$work"
