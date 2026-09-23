# Clerkship Dev Container Verification

This repository-owned VS Code status item displays the existing local verification
receipt for the current commit and tracked working tree:

- Green: the complete verification passed for this commit with no tracked changes.
- Red: the recorded verification failed for the current commit and clean tracked tree.
- Gray: evidence is missing, stale, running, unreadable, or unavailable.

Clicking the item runs the manual **Verify Dev Container** task. Opening the
workspace only reads status; it does not start verification. Status refreshes on
receipt creation, change, or deletion, on window focus, and every 15 seconds.
The item is available only inside the repository's Dev Container.

The image packages this source with pinned `@vscode/vsce` and post-create installs
the resulting local `/opt/clerkship-devcontainer-receipt-status.vsix`. There is no
Marketplace installation or runtime download. The extension has no network,
webview, credential, arbitrary-shell, or repository-write interface. It invokes
only the repository's fixed status evaluator with bounded execution time/output;
the manual task owns any verification writes.

Green proves the runtime contract, full local gate, and nonvisual smoke coverage
recorded in that receipt. It does not prove deployment, provider behavior,
microphone/headphone behavior, VoiceOver, faculty approval, clinical correctness,
local LFS browser coverage without a deploy URL, or Ubuntu visual-baseline parity.
