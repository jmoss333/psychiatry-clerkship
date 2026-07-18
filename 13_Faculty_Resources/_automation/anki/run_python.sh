#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LOCK_PROFILE="${ANKI_LOCK:-build}"

case "$LOCK_PROFILE" in
  build)
    LOCK_FILE="$SCRIPT_DIR/requirements.lock"
    ;;
  min)
    LOCK_FILE="$SCRIPT_DIR/requirements-min.lock"
    ;;
  current)
    LOCK_FILE="$SCRIPT_DIR/requirements-current.lock"
    ;;
  *)
    echo "Unsupported ANKI_LOCK '$LOCK_PROFILE'; use build, min, or current." >&2
    exit 2
    ;;
esac

if [[ ! -f "$LOCK_FILE" ]]; then
  echo "Anki dependency lock is missing: $LOCK_FILE" >&2
  exit 2
fi

PYTHON=""
if [[ -n "${PCL_ANKI_PYTHON:-}" ]]; then
  if [[ ! -x "$PCL_ANKI_PYTHON" ]]; then
    echo "PCL_ANKI_PYTHON is not executable: $PCL_ANKI_PYTHON" >&2
    exit 2
  fi
  PYTHON="$PCL_ANKI_PYTHON"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON="$(command -v python3.11)"
elif command -v python3 >/dev/null 2>&1 && \
    python3 -c 'import sys; raise SystemExit(sys.implementation.name != "cpython" or sys.version_info[:2] != (3, 11))'; then
  PYTHON="$(command -v python3)"
elif command -v uv >/dev/null 2>&1; then
  uv python install 3.11.9 >&2
  PYTHON="$(uv python find 3.11.9)"
else
  cat >&2 <<'EOF'
CPython 3.11 is required for the governed Anki environment.
Install uv (https://docs.astral.sh/uv/) or set PCL_ANKI_PYTHON to an executable CPython 3.11 interpreter.
EOF
  exit 2
fi

if ! "$PYTHON" -c 'import sys; raise SystemExit(sys.implementation.name != "cpython" or sys.version_info[:2] != (3, 11))'; then
  echo "Rejected interpreter '$PYTHON': CPython 3.11 is required." >&2
  exit 2
fi

PYTHON="$("$PYTHON" -c 'import os, sys; print(os.path.realpath(sys.executable))')"
PYTHON_VERSION="$("$PYTHON" -c 'import platform; print(platform.python_version())')"
LOCK_SHA256="$(shasum -a 256 "$LOCK_FILE" | awk '{print $1}')"
ENVIRONMENT_SHA256="$(printf '%s\n%s\n' "$PYTHON_VERSION" "$LOCK_SHA256" | shasum -a 256 | awk '{print $1}')"
VENV_DIR="$REPO_ROOT/_build/anki-venv/$ENVIRONMENT_SHA256"
READY_MARKER="$VENV_DIR/.pcl-anki-ready"

echo "PCL Anki runner: CPython $PYTHON_VERSION, $LOCK_PROFILE lock." >&2

if [[ ! -f "$READY_MARKER" ]]; then
  rm -rf "$VENV_DIR"
  mkdir -p "$(dirname "$VENV_DIR")"
  "$PYTHON" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python" -m pip install \
    --disable-pip-version-check \
    --require-hashes \
    --requirement "$LOCK_FILE"
  : > "$READY_MARKER"
fi

if [[ "$LOCK_PROFILE" == "min" ]]; then
  EXPECTED_ANKI_VERSION="23.10.1"
else
  EXPECTED_ANKI_VERSION="26.5"
fi

"$VENV_DIR/bin/python" - "$EXPECTED_ANKI_VERSION" <<'PY'
from importlib.metadata import version
import sys

anki_version = version("anki")
expected = sys.argv[1]
if anki_version != expected:
    raise SystemExit(
        f"Anki {expected} is required for this lock profile; found {anki_version!r}."
    )
PY

export PCL_ANKI_LOCK_PROFILE="$LOCK_PROFILE"
exec "$VENV_DIR/bin/python" "$@"
