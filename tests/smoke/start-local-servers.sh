#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
cd "$ROOT"

MS3_PORT="${SMOKE_MS3_PORT:-4200}"
RES_PORT="${SMOKE_RES_PORT:-4201}"
FACULTY_PORT="${SMOKE_FACULTY_PORT:-4202}"
MS3_DIR="${SMOKE_MS3_DIR:-_build/ms3}"
RES_DIR="${SMOKE_RES_DIR:-_build/res}"
FACULTY_DIR="${SMOKE_FACULTY_DIR:-faculty-console}"
READY_ATTEMPTS="${SMOKE_READY_ATTEMPTS:-15}"
READY_DELAY="${SMOKE_READY_DELAY_SECONDS:-1}"
READY_PATH="${SMOKE_READY_PATH:-/}"
STATE_DIR="${SMOKE_SERVER_STATE_DIR:-}"

PIDS=()
LABELS=()
PORTS=()
LOGS=()
STARTUP_COMPLETE=0
STARTUP_JOURNAL=""
PID_MANIFEST=""
PID_TMP=""
DEFERRED_SIGNAL_STATUS=0
WAIT_MODE=0
CONTROL_FIFO=""
CONTROL_FD_OPEN=0

error() {
  printf 'ERROR: %s\n' "$*" >&2
}

die() {
  error "$*"
  exit 1
}

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$ROOT" "$1" ;;
  esac
}

normalize_port() {
  local name="$1"
  local raw="$2"
  local normalized
  case "$raw" in
    ''|*[!0-9]*) die "$name must be an integer from 1 through 65535" ;;
  esac
  normalized="$raw"
  while [ "${#normalized}" -gt 1 ] && [ "${normalized#0}" != "$normalized" ]; do
    normalized="${normalized#0}"
  done
  if [ "$normalized" = '0' ] || [ "${#normalized}" -gt 5 ]; then
    die "$name must be an integer from 1 through 65535"
  fi
  normalized=$((10#$normalized))
  if [ "$normalized" -gt 65535 ]; then
    die "$name must be an integer from 1 through 65535"
  fi
  printf '%s\n' "$normalized"
}

normalize_attempts() {
  local raw="$1"
  local normalized
  case "$raw" in
    ''|*[!0-9]*) die 'SMOKE_READY_ATTEMPTS must be an integer of at least 1' ;;
  esac
  normalized="$raw"
  while [ "${#normalized}" -gt 1 ] && [ "${normalized#0}" != "$normalized" ]; do
    normalized="${normalized#0}"
  done
  # Eighteen decimal digits always fit Bash 3.2 signed integer arithmetic.
  if [ "$normalized" = '0' ] || [ "${#normalized}" -gt 18 ]; then
    die 'SMOKE_READY_ATTEMPTS must be an integer of at least 1'
  fi
  normalized=$((10#$normalized))
  printf '%s\n' "$normalized"
}

validate_config() {
  MS3_PORT="$(normalize_port SMOKE_MS3_PORT "$MS3_PORT")"
  RES_PORT="$(normalize_port SMOKE_RES_PORT "$RES_PORT")"
  FACULTY_PORT="$(normalize_port SMOKE_FACULTY_PORT "$FACULTY_PORT")"
  READY_ATTEMPTS="$(normalize_attempts "$READY_ATTEMPTS")"

  if [ "$MS3_PORT" = "$RES_PORT" ] \
    || [ "$MS3_PORT" = "$FACULTY_PORT" ] \
    || [ "$RES_PORT" = "$FACULTY_PORT" ]; then
    die 'ports must be distinct'
  fi
  if ! [[ "$READY_DELAY" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    die 'SMOKE_READY_DELAY_SECONDS must be a nonnegative number'
  fi
  case "$READY_PATH" in
    /*) ;;
    *) die 'SMOKE_READY_PATH must begin with /' ;;
  esac
  case "$READY_PATH" in
    *$'\n'*|*$'\r'*) die 'SMOKE_READY_PATH must not contain a newline' ;;
  esac
  [ -n "$MS3_DIR" ] || die 'SMOKE_MS3_DIR must not be empty'
  [ -n "$RES_DIR" ] || die 'SMOKE_RES_DIR must not be empty'
  [ -n "$FACULTY_DIR" ] || die 'SMOKE_FACULTY_DIR must not be empty'
}

print_config() {
  printf 'CONFIG\tms3\t%s\t%s\n' "$MS3_PORT" "$(resolve_path "$MS3_DIR")"
  printf 'CONFIG\tres\t%s\t%s\n' "$RES_PORT" "$(resolve_path "$RES_DIR")"
  printf 'CONFIG\tfaculty\t%s\t%s\n' "$FACULTY_PORT" "$(resolve_path "$FACULTY_DIR")"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

require_directory() {
  local label="$1"
  local directory="$2"
  [ -d "$directory" ] || die "directory for $label does not exist: $directory"
}

preflight_ports() {
  python3 - "$MS3_PORT" "$RES_PORT" "$FACULTY_PORT" <<'PY'
import socket
import sys

sockets = []
try:
    for raw_port in sys.argv[1:]:
        port = int(raw_port)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # Match Python's HTTPServer bind behavior: a just-cleaned listener may leave
        # harmless TIME_WAIT sockets, while an actually listening owner still fails.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            sock.close()
            print(f"ERROR: port {port} is already in use on 127.0.0.1", file=sys.stderr)
            raise SystemExit(1)
        sockets.append(sock)
finally:
    for sock in sockets:
        sock.close()
PY
}

refuse_existing_artifact() {
  local artifact="$1"
  local description="$2"
  if [ -e "$artifact" ] || [ -L "$artifact" ]; then
    die "$description already exists: $artifact"
  fi
}

cleanup_processes() {
  local pid
  local attempt=0
  local alive
  if [ "${#PIDS[@]}" -eq 0 ]; then return 0; fi
  for pid in "${PIDS[@]}"; do
    if owned_job "$pid"; then
      kill -TERM "$pid" >/dev/null 2>&1 || true
    fi
  done
  while [ "$attempt" -lt 20 ]; do
    alive=0
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then alive=1; fi
    done
    [ "$alive" -eq 0 ] && break
    sleep 0.1
    attempt=$((attempt + 1))
  done
  for pid in "${PIDS[@]}"; do
    if owned_job "$pid"; then
      kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  done
  for pid in "${PIDS[@]}"; do
    wait "$pid" >/dev/null 2>&1 || true
  done
}

owned_job() {
  local expected="$1"
  local owned
  while IFS= read -r owned; do
    [ "$owned" = "$expected" ] && return 0
  done < <(jobs -pr)
  return 1
}

print_logs() {
  local index
  local line
  for ((index = 0; index < ${#LOGS[@]}; index++)); do
    [ -f "${LOGS[$index]}" ] || continue
    printf '%s\n' "--- ${LABELS[$index]} server log ---" >&2
    while IFS= read -r line || [ -n "$line" ]; do
      printf '%s\n' "$line" >&2
    done < "${LOGS[$index]}"
  done
}

on_exit() {
  local status=$?
  local index
  trap - EXIT HUP INT TERM
  if [ "$STARTUP_COMPLETE" -ne 1 ] || [ "$WAIT_MODE" -eq 1 ]; then
    if [ "$STARTUP_COMPLETE" -ne 1 ]; then [ "$status" -ne 0 ] || status=1; fi
    set +e
    cleanup_processes
    if [ -n "$PID_MANIFEST" ]; then rm -f "$PID_MANIFEST"; fi
    if [ -n "$PID_TMP" ]; then rm -f "$PID_TMP"; fi
    if [ "$WAIT_MODE" -eq 1 ] && [ -n "$STARTUP_JOURNAL" ]; then rm -f "$STARTUP_JOURNAL"; fi
    if [ "$status" -ne 0 ]; then print_logs; fi
    if [ "$WAIT_MODE" -eq 1 ]; then
      for ((index = 0; index < ${#LOGS[@]}; index++)); do rm -f "${LOGS[$index]}"; done
      rm -f "$CONTROL_FIFO" "$STATE_DIR/launcher.stdout" "$STATE_DIR/launcher.stderr"
      rmdir "$STATE_DIR" >/dev/null 2>&1 || true
    fi
  fi
  exit "$status"
}

start_server() {
  local label="$1"
  local port="$2"
  local directory="$3"
  local log="$STATE_DIR/$label.log"
  local pid
  local deferred_status
  refuse_existing_artifact "$log" "$label log"
  # Defer signal exit only until the child is visible to cleanup and the journal.
  DEFERRED_SIGNAL_STATUS=0
  trap 'DEFERRED_SIGNAL_STATUS=129' HUP
  trap 'DEFERRED_SIGNAL_STATUS=130' INT
  trap 'DEFERRED_SIGNAL_STATUS=143' TERM
  python3 -m http.server "$port" \
    --bind 127.0.0.1 \
    --directory "$directory" >"$log" 2>&1 &
  pid=$!
  LABELS+=("$label")
  PORTS+=("$port")
  LOGS+=("$log")
  PIDS+=("$pid")
  printf '%s\t%s\t%s\n' "$label" "$pid" "$port" >> "$STARTUP_JOURNAL"
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  deferred_status="$DEFERRED_SIGNAL_STATUS"
  DEFERRED_SIGNAL_STATUS=0
  if [ "$deferred_status" -ne 0 ]; then exit "$deferred_status"; fi
  printf 'Started\t%s\t%s\n' "$label" "$pid"
}

wait_until_ready() {
  local label="$1"
  local port="$2"
  local pid="$3"
  local attempt=1
  local url="http://127.0.0.1:${port}${READY_PATH}"
  while [ "$attempt" -le "$READY_ATTEMPTS" ]; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      error "$label server PID $pid exited before becoming ready"
      return 1
    fi
    if curl -q --noproxy '*' --connect-timeout 1 --max-time 2 -fsS "$url" >/dev/null 2>&1; then
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        error "$label server PID $pid exited before becoming ready"
        return 1
      fi
      printf 'Ready\t%s\thttp://127.0.0.1:%s%s\n' "$label" "$port" "$READY_PATH"
      return 0
    fi
    if [ "$attempt" -lt "$READY_ATTEMPTS" ]; then sleep "$READY_DELAY"; fi
    attempt=$((attempt + 1))
  done
  error "$label server did not become ready after $READY_ATTEMPTS attempts: $url"
  return 1
}

case "$#" in
  0) MODE='start' ;;
  1)
    [ "$1" = '--print-config' ] || die 'usage: start-local-servers.sh [--print-config | --wait control-fifo]'
    MODE='print-config'
    ;;
  2)
    [ "$1" = '--wait' ] || die 'usage: start-local-servers.sh [--print-config | --wait control-fifo]'
    MODE='wait'; WAIT_MODE=1; CONTROL_FIFO="$2"
    ;;
  *) die 'usage: start-local-servers.sh [--print-config | --wait control-fifo]' ;;
esac

validate_config
if [ "$MODE" = 'print-config' ]; then
  print_config
  exit 0
fi

if [ "$WAIT_MODE" -eq 1 ]; then
  [ -n "$CONTROL_FIFO" ] || die 'control FIFO path is required'
  case "$CONTROL_FIFO" in /*) ;; *) die 'control FIFO path must be absolute' ;; esac
  [ ! -L "$CONTROL_FIFO" ] || die 'control FIFO must not be a symlink'
  [ -p "$CONTROL_FIFO" ] || die 'control path must be one FIFO'
  FIFO_OWNER="$(stat -f '%u' "$CONTROL_FIFO" 2>/dev/null || stat -c '%u' "$CONTROL_FIFO" 2>/dev/null || true)"
  [ "$FIFO_OWNER" = "$(id -u)" ] || die 'control FIFO must be owned by the current user'
  trap on_exit EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  exec 8<>"$CONTROL_FIFO"
  exec 7<"$CONTROL_FIFO"
  exec 8>&-
  CONTROL_FD_OPEN=1
  printf 'CONTROL_READY\n'
fi

require_command python3
require_command curl
MS3_DIR="$(resolve_path "$MS3_DIR")"
RES_DIR="$(resolve_path "$RES_DIR")"
FACULTY_DIR="$(resolve_path "$FACULTY_DIR")"
require_directory ms3 "$MS3_DIR"
require_directory res "$RES_DIR"
require_directory faculty "$FACULTY_DIR"
preflight_ports

if [ -n "$STATE_DIR" ]; then
  STATE_DIR="$(resolve_path "$STATE_DIR")"
  [ ! -L "$STATE_DIR" ] || die 'server state directory must not be a symlink'
  mkdir -p "$STATE_DIR"
else
  STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smoke-servers.XXXXXX")"
fi
PID_MANIFEST="$STATE_DIR/server-pids.tsv"
STARTUP_JOURNAL="$STATE_DIR/.startup-pids.tsv"
PID_TMP="$STATE_DIR/server-pids.tsv.tmp.$$"
refuse_existing_artifact "$PID_MANIFEST" 'PID manifest'
refuse_existing_artifact "$STARTUP_JOURNAL" 'startup journal'
refuse_existing_artifact "$PID_TMP" 'temporary PID manifest'
: > "$STARTUP_JOURNAL"
printf 'STATE_DIR\t%s\n' "$STATE_DIR"

if [ "$WAIT_MODE" -ne 1 ]; then
  trap on_exit EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

start_server ms3 "$MS3_PORT" "$MS3_DIR"
start_server res "$RES_PORT" "$RES_DIR"
start_server faculty "$FACULTY_PORT" "$FACULTY_DIR"

for ((index = 0; index < ${#PIDS[@]}; index++)); do
  wait_until_ready "${LABELS[$index]}" "${PORTS[$index]}" "${PIDS[$index]}"
done
for ((index = 0; index < ${#PIDS[@]}; index++)); do
  kill -0 "${PIDS[$index]}" >/dev/null 2>&1 \
    || die "${LABELS[$index]} server PID ${PIDS[$index]} exited after readiness"
done

: > "$PID_TMP"
for ((index = 0; index < ${#PIDS[@]}; index++)); do
  printf '%s\t%s\t%s\n' \
    "${LABELS[$index]}" "${PIDS[$index]}" "${PORTS[$index]}" >> "$PID_TMP"
done
mv "$PID_TMP" "$PID_MANIFEST"
rm -f "$STARTUP_JOURNAL"

for ((index = 0; index < ${#PIDS[@]}; index++)); do
  printf 'SERVER_PID\t%s\t%s\n' "${LABELS[$index]}" "${PIDS[$index]}"
done
printf 'Stop with: kill'
for pid in "${PIDS[@]}"; do printf ' %s' "$pid"; done
printf '\nServers ready\n'

STARTUP_COMPLETE=1
if [ "$WAIT_MODE" -eq 1 ]; then
  printf 'SERVERS_READY\n'
  CONTROL_LINE=''
  if IFS= read -r CONTROL_LINE <&7; then
    [ "$CONTROL_LINE" = 'STOP' ] || die 'control FIFO accepted only STOP'
  fi
  exec 7<&-
  CONTROL_FD_OPEN=0
  exit 0
fi
trap - EXIT HUP INT TERM
