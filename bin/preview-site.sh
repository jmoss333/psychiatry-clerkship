#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
BUILD_SCRIPT="$ROOT/13_Faculty_Resources/_automation/site_build/build_and_check.sh"

usage() {
  cat <<'EOF'
Usage: bash bin/preview-site.sh <ms3|res> [options]

Build, serve, and open one learner-site preview.

Options:
  --port PORT   Override the audience's default localhost port.
  --no-build    Serve the existing build without rebuilding it.
  --no-open     Do not open the preview in the default browser.
  -h, --help    Show this help.
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

if [ "$#" -eq 0 ]; then
  usage >&2
  exit 2
fi

AUDIENCE="$1"
shift
case "$AUDIENCE" in
  ms3) PORT=4173 ;;
  res) PORT=4174 ;;
  *) printf 'ERROR: audience must be ms3 or res\n' >&2; usage >&2; exit 2 ;;
esac

DO_BUILD=1
DO_OPEN=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || { printf 'ERROR: --port requires a value\n' >&2; exit 2; }
      PORT="$2"
      shift 2
      ;;
    --no-build) DO_BUILD=0; shift ;;
    --no-open) DO_OPEN=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'ERROR: unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) die 'port must be an integer from 1 through 65535' ;;
esac
NORMALIZED_PORT="$PORT"
while [ "${#NORMALIZED_PORT}" -gt 1 ] && [ "${NORMALIZED_PORT#0}" != "$NORMALIZED_PORT" ]; do
  NORMALIZED_PORT="${NORMALIZED_PORT#0}"
done
if [ "$NORMALIZED_PORT" = '0' ] || [ "${#NORMALIZED_PORT}" -gt 5 ]; then
  die 'port must be an integer from 1 through 65535'
fi
PORT=$((10#$NORMALIZED_PORT))
[ "$PORT" -le 65535 ] || die 'port must be an integer from 1 through 65535'

if [ "$DO_BUILD" -eq 1 ]; then
  printf 'Building %s preview…\n' "$AUDIENCE"
  /bin/bash "$BUILD_SCRIPT" "$AUDIENCE"
fi

SITE_DIR="${PREVIEW_SITE_DIR:-$ROOT/_build/$AUDIENCE}"
[ -d "$SITE_DIR" ] || die "built site not found: $SITE_DIR"
[ -f "$SITE_DIR/index.html" ] || die "built site has no index.html: $SITE_DIR"

# Every python3 below runs with -I. `python3 -` and `python3 -m` otherwise put the caller's cwd
# on sys.path, and the import system lists that directory: run from a $TMPDIR holding ~120,000
# leaked fixtures, `import urllib.request` took ~6.5 s and the readiness loop timed out
# (2026-09-24). A module in the cwd named like the stdlib would also shadow it. -I, not -P:
# -P needs Python 3.11 and macOS's /usr/bin/python3 is 3.9. Pinned by
# tests/preview-site-isolation.test.mjs.
python3 -I - "$PORT" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    print(f"ERROR: port {port} is already in use on 127.0.0.1", file=sys.stderr)
    raise SystemExit(1)
finally:
    sock.close()
PY

if [ "$DO_OPEN" -eq 1 ]; then
  if command -v open >/dev/null 2>&1; then
    OPEN_COMMAND=open
  elif command -v xdg-open >/dev/null 2>&1; then
    OPEN_COMMAND=xdg-open
  else
    die 'no browser opener found; rerun with --no-open to serve without opening'
  fi
fi

SERVER_PID=''
SERVER_LOG="$(mktemp "${TMPDIR:-/tmp}/clerkship-preview.XXXXXX")"
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -f "$SERVER_LOG"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

python3 -I -m http.server "$PORT" --bind 127.0.0.1 --directory "$SITE_DIR" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

attempt=0
while [ "$attempt" -lt 50 ]; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    sed -n '1,80p' "$SERVER_LOG" >&2
    die 'preview server exited during startup'
  fi
  if python3 -I - "$PORT" <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen(f"http://127.0.0.1:{int(sys.argv[1])}/", timeout=0.2) as response:
        raise SystemExit(0 if response.status == 200 else 1)
except Exception:
    raise SystemExit(1)
PY
  then
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.1
done
[ "$attempt" -lt 50 ] || die 'preview server did not become ready'

URL="http://127.0.0.1:$PORT/"
printf 'Preview ready: %s\n' "$URL"
printf 'Audience: %s · Source: %s\n' "$AUDIENCE" "$SITE_DIR"
printf 'Press Ctrl-C to stop.\n'

if [ "$DO_OPEN" -eq 1 ]; then
  "$OPEN_COMMAND" "$URL"
fi

wait "$SERVER_PID"
