#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

bash .devcontainer/install-dependencies.sh

bash .devcontainer/install-local-extension.sh

python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py --worktree-stubs . || {
  echo "Dev Container setup requires materialized LFS media. Run 'git lfs pull' in a full clone, then rebuild the container." >&2
  exit 1
}

if [ -n "${SSH_AUTH_SOCK:-}" ]; then
  echo "NOTICE: the host SSH agent is visible inside this container." >&2
fi
if git config --get-all credential.helper >/dev/null 2>&1; then
  echo "NOTICE: a Git credential helper is configured inside this container." >&2
fi

node bin/check-runtime-contract.mjs --current
