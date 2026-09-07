#!/bin/bash
set -euo pipefail
DANA_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DANA_REPO_ROOT="$(cd "$DANA_SCRIPT_DIR/../.." && pwd)"
DANA_COMMON_DIR="$(git -C "$DANA_REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
DANA_ENV_FILE="${DANA_ENV_FILE:-$(dirname "$DANA_COMMON_DIR")/.env.dana.local}"
DANA_PYTHON="$DANA_REPO_ROOT/output/speech/dana-runtime-venv/bin/python"
DANA_URL='http://127.0.0.1:4319/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1'
if ! test -f "$DANA_ENV_FILE" || test -L "$DANA_ENV_FILE"; then
  echo 'The approved local Dana API configuration is missing.'
  exit 1
fi
if ! test -x "$DANA_PYTHON"; then
  echo 'Install the local Dana runtime using the commands in DANA_CONVERSATION.md first.'
  exit 1
fi
if curl --silent --fail 'http://127.0.0.1:4319/api/dana/health' | "$DANA_PYTHON" -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("configured") is True and d.get("localOnly") is True and d.get("mode")=="live" and d.get("voice")=="marin" else 1)' 2>/dev/null; then
  open -a 'Google Chrome' "$DANA_URL"
  exit 0
fi
cd "$DANA_REPO_ROOT"
echo 'Starting live Dana. Keep this Terminal window open while you practice.'
# Remove only the inherited key so Node reads the explicitly selected Dana file.
env -u OPENAI_API_KEY DANA_PYTHON="$DANA_PYTHON" node --env-file="$DANA_ENV_FILE" "$DANA_SCRIPT_DIR/dana-live-server.mjs" --port 4319 &
DANA_SERVER_PID=$!
trap 'kill "$DANA_SERVER_PID" 2>/dev/null || true' EXIT
for DANA_TRY in 1 2 3 4 5; do
  if curl --silent --fail 'http://127.0.0.1:4319/api/dana/health' >/dev/null; then
    open -a 'Google Chrome' "$DANA_URL"
    wait "$DANA_SERVER_PID"
    exit 0
  fi
  sleep 1
done
echo 'Dana did not start. Check whether another application is using port 4319.'
exit 1
