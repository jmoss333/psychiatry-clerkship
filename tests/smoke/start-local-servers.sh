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
  normalized=$((10#$raw))
  if [ "$normalized" -lt 1 ]; then
    die 'SMOKE_READY_ATTEMPTS must be an integer of at least 1'
  fi
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
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" >/dev/null 2>&1 || true
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
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  done
  for pid in "${PIDS[@]}"; do
    wait "$pid" >/dev/null 2>&1 || true
  done
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
  trap - EXIT HUP INT TERM
  if [ "$STARTUP_COMPLETE" -ne 1 ]; then
    [ "$status" -ne 0 ] || status=1
    set +e
    cleanup_processes
    if [ -n "$PID_MANIFEST" ]; then rm -f "$PID_MANIFEST"; fi
    if [ -n "$PID_TMP" ]; then rm -f "$PID_TMP"; fi
    print_logs
  fi
  exit "$status"
}

start_server() {
  local label="$1"
  local port="$2"
  local directory="$3"
  local log="$STATE_DIR/$label.log"
  local pid
  refuse_existing_artifact "$log" "$label log"
  python3 -m http.server "$port" \
    --bind 127.0.0.1 \
    --directory "$directory" >"$log" 2>&1 &
  pid=$!
  LABELS+=("$label")
  PORTS+=("$port")
  LOGS+=("$log")
  PIDS+=("$pid")
  printf '%s\t%s\t%s\n' "$label" "$pid" "$port" >> "$STARTUP_JOURNAL"
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
    if curl --connect-timeout 1 --max-time 2 -fsS "$url" >/dev/null 2>&1; then
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
    [ "$1" = '--print-config' ] || die 'usage: start-local-servers.sh [--print-config]'
    MODE='print-config'
    ;;
  *) die 'usage: start-local-servers.sh [--print-config]' ;;
esac

validate_config
if [ "$MODE" = 'print-config' ]; then
  print_config
  exit 0
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

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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

printf 'STATE_DIR\t%s\n' "$STATE_DIR"
for ((index = 0; index < ${#PIDS[@]}; index++)); do
  printf 'SERVER_PID\t%s\t%s\n' "${LABELS[$index]}" "${PIDS[$index]}"
done
printf 'Stop with: kill'
for pid in "${PIDS[@]}"; do printf ' %s' "$pid"; done
printf '\nServers ready\n'

STARTUP_COMPLETE=1
trap - EXIT HUP INT TERM
