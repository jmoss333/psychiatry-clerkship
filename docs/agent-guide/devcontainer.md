# Local Dev Container

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The VS Code dev container: what it supplies, the host preflight, the deliberately manual full gate, the receipt and the status bar — and what none of that proves.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### Local Dev Container — [report: bin/devcontainer-preflight.py; bin/verify-devcontainer.sh; bin/check-runtime-contract.mjs]
VS Code can reopen this repository in `.devcontainer/`, which supplies Node 22,
Python 3.11, Bash 5+, Git LFS, the locked NPM dependencies, and Chromium.
Run `python3 bin/devcontainer-preflight.py` on the host first (`--json` for tooling).
It checks Git/LFS accessibility, memory capacity, and credential-forwarding warnings without
repairs, downloads, helper execution, or secret output. Exit 1 blocks setup, 2 means could-not-check,
and advisory warnings exit 0. `.devcontainer/post-create.sh` runs it before dependency installation
and the fast runtime contract. The full gate is deliberately manual: run the VS Code task
**Verify Dev Container** via **Tasks: Run Task**, or the receipt-enabled command below. Open a full clone,
not a linked worktree whose Git directory is outside the mounted workspace, and materialize
LFS files with `git lfs checkout` from cached objects first; `git lfs pull` may consume metered
bandwidth. See `.devcontainer/README.md` for the full-clone/cache procedure and troubleshooting.
The tested Colima allocation is 6 GiB after an OOM at 2 GiB, not a universal minimum; low memory
and recognizable broken helper paths are advisory, never automatic host configuration changes.

```bash
node bin/check-runtime-contract.mjs --current  # fast environment proof
bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json
```

A completed attempt writes `output/devcontainer/verification-receipt.json` (local, ignored by Git).
The status bar stays visible: green means the receipt passed for the current clean tracked commit;
red means the current commit's latest attempt failed; gray means no current proof exists
(missing, malformed, running/interrupted, stale, a different commit, or tracked edits).
Clicking the item runs the manual task. Without deploy URLs, the local LFS browser projects remain
skipped: deploy-only LFS browser coverage is not proved, and the receipt says so even after a pass.
Green certifies this checkout's commit, not that it is the latest remote main. Full verification
also runs preflight before refreshing dependencies; a blocker records the failed preflight stage.
The image-supplied `CLERKSHIP_DEVCONTAINER=1` check prevents accidental host invocation; it is a
forgeable environment guard, not authentication or proof that a deliberate caller used the container.
If the receipt directory is wholly unwritable, the task fails but the last atomically completed receipt
may remain readable until permissions or repository freshness change.

The container declares no repository-managed credential or Docker-socket mount. VS Code
may still forward the host SSH agent or Git credential helper; setup reports either state.
It does not prove deployment, provider behavior, microphone/headphone behavior,
VoiceOver, faculty approval, clinical correctness, local LFS browser coverage, or Ubuntu
visual-baseline parity. The local LFS Playwright project skips without a deploy URL.
Never regenerate visual baselines from it; use the existing workflow_dispatch job. A push
made from the host Mac still runs its pre-push gate under host Bash 3.2; run the push from
the container when the Bash 5 environment is part of the evidence.
