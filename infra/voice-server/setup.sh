#!/bin/sh
# Installs Node.js (pinned, checksum-verified) and the voice server's
# dependencies. cloud-init runs this once on first boot; see README.md.
set -eu

NODE_VERSION=v22.22.2
NODE_SHA256=88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a
NODE_DIR=${NODE_DIR:-/opt/node}
APP_DIR=${APP_DIR:-/opt/voice}

tarball=node-$NODE_VERSION-linux-x64.tar.xz
work=$(mktemp -d)
curl -fsSL -o "$work/$tarball" "https://nodejs.org/dist/$NODE_VERSION/$tarball"
echo "$NODE_SHA256  $work/$tarball" | sha256sum -c -
mkdir -p "$NODE_DIR"
tar -xJf "$work/$tarball" -C "$NODE_DIR" --strip-components=1
rm -rf "$work"

cd "$APP_DIR"
PATH="$NODE_DIR/bin:$PATH" npm ci --omit=dev --no-audit --no-fund
