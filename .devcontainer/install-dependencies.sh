#!/usr/bin/env bash
set -euo pipefail

if [[ "${CLERKSHIP_DEVCONTAINER:-}" != "1" ]]; then
  echo "Dependency installation may only reset the venv inside the Dev Container." >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
rm -rf -- "$repo_root/.venv"
cd "$repo_root"

python3 -m venv .venv
.venv/bin/python -m pip install \
  --requirement requirements.txt \
  --requirement requirements-dev.txt \
  'PyYAML==6.0.2'

npm --prefix metrics ci
npm --prefix sp-proxy ci
npm --prefix sp-preview ci
npm --prefix tests/smoke ci

(
  cd tests/smoke
  npx playwright install chromium
)
