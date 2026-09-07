#!/bin/bash
set -euo pipefail
FAMILY_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAMILY_REPO_ROOT="$(cd "$FAMILY_SCRIPT_DIR/../.." && pwd)"
FAMILY_COMMON_DIR="$(git -C "$FAMILY_REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
FAMILY_ENV_FILE="${DANA_ENV_FILE:-$(dirname "$FAMILY_COMMON_DIR")/.env.dana.local}"
FAMILY_PYTHON="$FAMILY_REPO_ROOT/output/speech/dana-runtime-venv/bin/python"
FAMILY_URL='http://127.0.0.1:4320/_prototypes/sp-interview/family-visit.html'
if ! test -f "$FAMILY_ENV_FILE" || test -L "$FAMILY_ENV_FILE"; then
  echo 'The approved local voice API configuration is missing.'
  exit 1
fi
if ! test -x "$FAMILY_PYTHON"; then
  echo 'Install the shared voice runtime using DANA_CONVERSATION.md first.'
  exit 1
fi
if curl --max-time 2 --silent --fail 'http://127.0.0.1:4320/api/family/health' | "$FAMILY_PYTHON" -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("configured") is True and d.get("localOnly") is True and d.get("caseId")=="family_morgan_maya_001" else 1)' 2>/dev/null; then
  open -a 'Google Chrome' "$FAMILY_URL"
  exit 0
fi
cd "$FAMILY_REPO_ROOT"
echo 'Starting the local family visit. Keep this Terminal window open while you practice.'
env -u OPENAI_API_KEY DANA_PYTHON="$FAMILY_PYTHON" node --env-file="$FAMILY_ENV_FILE" "$FAMILY_SCRIPT_DIR/family-live-server.mjs" --port 4320 &
FAMILY_SERVER_PID=$!
trap 'kill "$FAMILY_SERVER_PID" 2>/dev/null || true' EXIT
for FAMILY_TRY in 1 2 3 4 5; do
  if curl --max-time 2 --silent --fail 'http://127.0.0.1:4320/api/family/health' >/dev/null; then
    open -a 'Google Chrome' "$FAMILY_URL"
    wait "$FAMILY_SERVER_PID"
    exit 0
  fi
  sleep 1
done
echo 'The family visit did not start. Check whether another application is using port 4320.'
exit 1
