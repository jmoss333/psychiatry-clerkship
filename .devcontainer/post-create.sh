#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

python3 bin/devcontainer-preflight.py --context container

bash .devcontainer/install-dependencies.sh

bash .devcontainer/install-local-extension.sh

node bin/check-runtime-contract.mjs --current
