#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
SERVER_JS="${SERVER_JS:-$ROOT_DIR/server.js}"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Mission Control start failed: node not found at $NODE_BIN" >&2
  exit 1
fi

if [[ ! -f "$SERVER_JS" ]]; then
  echo "Mission Control start failed: server.js not found at $SERVER_JS" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec "$NODE_BIN" "$SERVER_JS"
