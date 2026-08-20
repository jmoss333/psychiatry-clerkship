#!/usr/bin/env bash
set -u
set -o pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
LAUNCHER="$SCRIPT_DIR/start-local-servers.sh"
STATE_DIR=""
CONTROL_FIFO=""
LAUNCHER_PID=""
LAUNCHER_READY=0
FD9_OPEN=0
MANIFEST_CHECKSUM=""

owned_launcher() {
  local owned
  [ -n "$LAUNCHER_PID" ] || return 1
  while IFS= read -r owned; do
    [ "$owned" = "$LAUNCHER_PID" ] && return 0
  done < <(jobs -pr)
  return 1
}

runner_cleanup() {
  local status=$?
  local cleanup_failed=0
  trap - EXIT HUP INT TERM
  set +e
  if [ -n "$STATE_DIR" ] && [ -d "$STATE_DIR" ]; then
    : > "$STATE_DIR/.wrapper-cleaning" || cleanup_failed=1
  fi
  if [ "$FD9_OPEN" -eq 1 ]; then
    if [ "$LAUNCHER_READY" -eq 1 ] && owned_launcher; then
      printf 'STOP\n' >&9 || cleanup_failed=1
    fi
    exec 9>&-
    FD9_OPEN=0
  fi
  if [ -n "$LAUNCHER_PID" ]; then
    wait "$LAUNCHER_PID"
    launcher_status=$?
    if [ "$launcher_status" -ne 0 ] && [ "$status" -eq 0 ]; then cleanup_failed=1; fi
  fi
  if [ -n "$STATE_DIR" ] && [ -e "$STATE_DIR" ]; then
    rm -f "$STATE_DIR/server-pids.tsv" "$STATE_DIR/.startup-pids.tsv" "$STATE_DIR"/server-pids.tsv.tmp.* \
      "$STATE_DIR/ms3.log" "$STATE_DIR/res.log" "$STATE_DIR/faculty.log" \
      "$STATE_DIR/launcher.stdout" "$STATE_DIR/launcher.stderr" \
      "$STATE_DIR/.wrapper-cleaning" "$CONTROL_FIFO"
    rmdir "$STATE_DIR" >/dev/null 2>&1 || cleanup_failed=1
  fi
  if [ "$cleanup_failed" -ne 0 ] && [ "$status" -eq 0 ]; then status=1; fi
  exit "$status"
}

trap runner_cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smoke-playwright.XXXXXX")" || exit 1
[ -d "$STATE_DIR" ] && [ ! -L "$STATE_DIR" ] || exit 1
STATE_OWNER="$(stat -f '%u' "$STATE_DIR" 2>/dev/null || stat -c '%u' "$STATE_DIR" 2>/dev/null || true)"
[ "$STATE_OWNER" = "$(id -u)" ] || exit 1
CONTROL_FIFO="$STATE_DIR/control.fifo"
mkfifo "$CONTROL_FIFO" || exit 1
[ -p "$CONTROL_FIFO" ] && [ ! -L "$CONTROL_FIFO" ] || exit 1
FIFO_OWNER="$(stat -f '%u' "$CONTROL_FIFO" 2>/dev/null || stat -c '%u' "$CONTROL_FIFO" 2>/dev/null || true)"
[ "$FIFO_OWNER" = "$(id -u)" ] || exit 1
exec 9<>"$CONTROL_FIFO" || exit 1
FD9_OPEN=1

export SMOKE_SERVER_STATE_DIR="$STATE_DIR"
/bin/bash "$LAUNCHER" --wait "$CONTROL_FIFO" 9>&- >"$STATE_DIR/launcher.stdout" 2>"$STATE_DIR/launcher.stderr" &
LAUNCHER_PID=$!

wait_for_marker() {
  local marker="$1"
  local attempt=0
  while [ "$attempt" -lt 200 ]; do
    if grep -Fqx "$marker" "$STATE_DIR/launcher.stdout" 2>/dev/null; then return 0; fi
    owned_launcher || return 1
    sleep 0.05
    attempt=$((attempt + 1))
  done
  return 1
}

if ! wait_for_marker CONTROL_READY; then
  [ ! -f "$STATE_DIR/launcher.stderr" ] || sed -n '1,120p' "$STATE_DIR/launcher.stderr" >&2
  exit 1
fi
LAUNCHER_READY=1
if ! wait_for_marker SERVERS_READY; then
  [ ! -f "$STATE_DIR/launcher.stderr" ] || sed -n '1,120p' "$STATE_DIR/launcher.stderr" >&2
  exit 1
fi
owned_launcher || exit 1

MANIFEST="$STATE_DIR/server-pids.tsv"
[ -f "$MANIFEST" ] && [ ! -L "$MANIFEST" ] || exit 1
MANIFEST_OWNER="$(stat -f '%u' "$MANIFEST" 2>/dev/null || stat -c '%u' "$MANIFEST" 2>/dev/null || true)"
[ "$MANIFEST_OWNER" = "$(id -u)" ] || exit 1

expected_labels="ms3 res faculty"
expected_ports="${SMOKE_MS3_PORT:-4200} ${SMOKE_RES_PORT:-4201} ${SMOKE_FACULTY_PORT:-4202}"
actual_labels=""
actual_ports=""
rows=0
while IFS=$'\t' read -r label pid port extra; do
  [ -n "$label" ] || exit 1
  [ -z "${extra:-}" ] || exit 1
  case "$pid" in ''|*[!0-9]*) exit 1 ;; esac
  case "$port" in ''|*[!0-9]*) exit 1 ;; esac
  grep -Fqx "SERVER_PID"$'\t'"$label"$'\t'"$pid" "$STATE_DIR/launcher.stdout" || exit 1
  actual_labels="${actual_labels:+$actual_labels }$label"
  actual_ports="${actual_ports:+$actual_ports }$port"
  rows=$((rows + 1))
done < "$MANIFEST"
[ "$rows" -eq 3 ] && [ "$actual_labels" = "$expected_labels" ] && [ "$actual_ports" = "$expected_ports" ] || exit 1
MANIFEST_CHECKSUM="$(cksum < "$MANIFEST")" || exit 1

set +e
(cd "$SCRIPT_DIR" && npx playwright test "$@" 9>&-)
test_status=$?
set -e

if [ ! -f "$MANIFEST" ] || [ -L "$MANIFEST" ] || [ "$(cksum < "$MANIFEST" 2>/dev/null)" != "$MANIFEST_CHECKSUM" ]; then
  test_status=1
fi
owned_launcher || test_status=1
exit "$test_status"
