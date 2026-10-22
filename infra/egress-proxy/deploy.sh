#!/usr/bin/env bash
set -euo pipefail
target=${1:?Usage: deploy.sh user@vps}
if [[ ! "$target" =~ ^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$ ]]; then echo 'Use an explicit user@host.' >&2; exit 2; fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
remote_dir=$(ssh -o BatchMode=yes "$target" 'mktemp -d /tmp/mse-egress.XXXXXXXX')
if [[ ! "$remote_dir" =~ ^/tmp/mse-egress\.[a-zA-Z0-9]+$ ]]; then echo 'Unexpected remote staging path.' >&2; exit 2; fi
cleanup() { ssh -o BatchMode=yes "$target" "rm -rf -- '$remote_dir'" || true; }
trap cleanup EXIT
scp -q "$script_dir/proxy.cjs" "$script_dir/update-local.sh" "$target:$remote_dir/"
ssh -o BatchMode=yes "$target" "bash '$remote_dir/update-local.sh' '$remote_dir/proxy.cjs'"
