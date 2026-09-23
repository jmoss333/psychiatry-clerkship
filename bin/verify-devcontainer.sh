#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

receipt_path=""
refresh_deps=0
receipt_seen=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --refresh-deps)
      if [ "$refresh_deps" = 1 ]; then
        echo "Duplicate option: --refresh-deps" >&2
        exit 2
      fi
      refresh_deps=1
      shift
      ;;
    --receipt)
      if [ "$receipt_seen" = 1 ] || [ "$#" -lt 2 ] || [ -z "$2" ] || [[ "$2" == --* ]]; then
        echo "Invalid option: --receipt requires one path" >&2
        exit 2
      fi
      receipt_path="$2"
      receipt_seen=1
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [ "${CLERKSHIP_DEVCONTAINER:-}" != "1" ]; then
  echo "verify-devcontainer.sh must run inside the project Dev Container." >&2
  exit 2
fi

stage="startup"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

record() {
  [ -n "$receipt_path" ] || return 0
  node bin/devcontainer-receipt.mjs record \
    --path "$receipt_path" --status "$1" --stage "$stage" \
    --exit-code "$2" --started-at "$started_at"
}

on_error() {
  exit_code=$?
  trap - ERR
  record failed "$exit_code" || true
  exit "$exit_code"
}
trap on_error ERR

stage="dependencies"
record running 0
if [ "$refresh_deps" = 1 ]; then
  bash .devcontainer/install-dependencies.sh
fi
if [ ! -x .venv/bin/python3 ]; then
  echo "verify-devcontainer.sh requires the virtualenv from .devcontainer/post-create.sh." >&2
  record failed 2 || true
  exit 2
fi

export VIRTUAL_ENV="$PWD/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"

stage="runtime-contract"
node bin/check-runtime-contract.mjs --current
stage="full-gate"
bash bin/verify.sh
stage="nonvisual-smoke"
env -u SPECS bash bin/verify-smoke.sh
stage="complete"
record passed 0

echo "DEV CONTAINER VERIFIED — runtime, full gate, and nonvisual smoke suite passed"
