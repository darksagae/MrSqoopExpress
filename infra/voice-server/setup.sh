#!/bin/sh
# Downloads Piper and the medium-quality Lessac voice (pinned, checksum-verified)
# into /opt/voice. cloud-init runs this once on first boot; see README.md.
set -eu

APP_DIR=${APP_DIR:-/opt/voice}
PIPER_URL=https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
PIPER_SHA256=a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992
VOICE_URL=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
VOICE_SHA256=5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f
CONFIG_SHA256=efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0

work=$(mktemp -d)
fetch() { curl -fsSL --retry 5 --retry-delay 5 -o "$work/$2" "$1" && echo "$3  $work/$2" | sha256sum -c -; }
fetch "$PIPER_URL" piper.tar.gz "$PIPER_SHA256"
fetch "$VOICE_URL" en_US-lessac-medium.onnx "$VOICE_SHA256"
fetch "$VOICE_URL.json" en_US-lessac-medium.onnx.json "$CONFIG_SHA256"

mkdir -p "$APP_DIR"
tar -xzf "$work/piper.tar.gz" -C "$APP_DIR"
mv "$work/en_US-lessac-medium.onnx" "$work/en_US-lessac-medium.onnx.json" "$APP_DIR/"
rm -rf "$work"
