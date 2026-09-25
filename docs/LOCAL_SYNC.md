# Local and GitHub sync status

Run `python3 bin/sync_status.py --refresh` from a checkout to compare it with the
current `origin/main`. The refresh fetches that branch only; it never switches,
merges, resets, stages, commits, or modifies working files.

Without `--refresh`, the command is offline and labels its remote reference
**CACHED**. Equality with a cached reference does not establish equality with
GitHub now. Claude's existing session-start hook runs this offline report before
its slower probes. Codex does not execute Claude session hooks.

Options:

- `--repo <checkout>`: inspect another checkout without changing it.
- `--remote <name> --branch <name>`: select the remote branch (default `origin/main`).
- `--json`: machine-readable report, including both commit IDs.
- `--check`: exit 1 for different commits or uncommitted work; default report mode
  reports those differences without blocking work. Both modes exit 2 if unknown.

States describe commit history: `in-sync`, `ahead`, `behind`, or `diverged` (both
sides have commits). Working-tree differences are reported separately: changed
tracked paths and untracked files. Renames count both changed paths. Ignored build
outputs are excluded. Detached checkouts are supported. A missing reference,
failed refresh, unrelated history, or shallow repository is **unknown**, never
"in sync". Each Git command has a 15-second timeout; network errors do not print
remote URLs or credentials.

## Recovery comparison — 2026-09-22

Compared local `aa11e96b08ea946030c0d0e9fdcd96da6b458aa7` with GitHub main
`5eebaf591869b5f7f75a0f7d49f155841984a49d`: 5 commits unique to local history,
128 unique to main. Commit counts describe ancestry, not missing features.

| Local commit | Finding against GitHub main | Disposition |
| --- | --- | --- |
| `8075b89` | Colour-accessibility ratchet reached main as `0c260de` (PR #619). All nine touched files exactly match at the squash commit. Later main changes are retained. | Do not replay. |
| `8600620` | Synthetic offline evaluation exporter and its tests are absent from main; README section is also absent. | Preserve on recovery branch for a separate feature review. |
| `ea02a08` | Merge of the preceding branch; `git show --remerge-diff` has no conflict-resolution changes. | Preserve history; no independent feature to replay. |
| `be10671` | Capture status workflow, save-next-step UI, starters, persistent launcher, preview helper and accompanying tests are absent from main. Main already contains the earlier capture accessibility repair (#677). | Preserve on recovery branch; do not replace current main's shell wholesale. |
| `aa11e96` | Merge of capture prototype; no conflict-resolution changes in the remerge diff. | Preserve history; no independent feature to replay. |

The full original history is saved at GitHub branch
[`rescue/unpushed-local-main-2026-09-22`](https://github.com/jmoss333/psychiatry-clerkship/tree/rescue/unpushed-local-main-2026-09-22),
verified at `aa11e96`. Local `main` was renamed to
`rescue/local-main-before-sync-2026-09-22`, then a new tracking `main` was checked
out from `origin/main`. No hard reset or clean was used. All 16 pre-existing
untracked files retained identical SHA-256 checksums after synchronization.

The collision sentinel reported **OCCUPIED** for the capture shell (including
uncommitted work in other checkouts) and **COORDINATE** for the exporter. These
features remain preserved, not newly released or validated on current main.
Next feature-recovery step: coordinate those paths, apply only the exporter and
capture changes onto fresh main in separate review branches, and run their
focused tests and the repository gate. Do not replay the already-shipped colour
ratchet or overwrite newer shell changes with the old file.

This is a dated comparison, not a continuing claim that main stays at this SHA.
Use the report for current state.
