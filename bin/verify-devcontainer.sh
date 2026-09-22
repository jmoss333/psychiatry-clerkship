#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "${CLERKSHIP_DEVCONTAINER:-}" != "1" ]; then
  echo "verify-devcontainer.sh must run inside the project Dev Container." >&2
  exit 2
fi

if [ ! -x .venv/bin/python3 ]; then
  echo "verify-devcontainer.sh requires the virtualenv from .devcontainer/post-create.sh." >&2
  exit 2
fi

export VIRTUAL_ENV="$PWD/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"

node bin/check-runtime-contract.mjs --current
bash bin/verify.sh
env -u SPECS bash bin/verify-smoke.sh

echo "DEV CONTAINER VERIFIED — runtime, full gate, and nonvisual smoke suite passed"
