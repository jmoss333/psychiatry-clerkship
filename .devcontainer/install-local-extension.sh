#!/usr/bin/env bash
set -euo pipefail

if [ "${CLERKSHIP_DEVCONTAINER:-}" != "1" ]; then
  echo "Local extension installation requires the project Dev Container." >&2
  exit 1
fi

# postCreate runs before the interactive terminal receives VS Code's CLI PATH.
# Use the installed server directly, never the image's placeholder `code` shim.
server_root="${VSCODE_AGENT_FOLDER:-${HOME}/.vscode-server}"
server_cli=""
for candidate in "$server_root"/bin/*/bin/code-server; do
  [ -x "$candidate" ] || continue
  if [ -n "$server_cli" ]; then
    echo "Ambiguous VS Code server CLI; cannot choose a server for local extension installation." >&2
    exit 1
  fi
  server_cli="$candidate"
done
if [ -z "$server_cli" ]; then
  echo "No VS Code server CLI found; reopen through VS Code Dev Containers." >&2
  exit 1
fi

exec "$server_cli" --extensions-dir "$server_root/extensions" \
  --install-extension /opt/clerkship-devcontainer-receipt-status.vsix --force
