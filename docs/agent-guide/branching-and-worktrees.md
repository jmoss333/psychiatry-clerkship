# Branching, worktrees & coordinating with other sessions

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). How concurrent Claude Code, Codex and cloud sessions share this repo without trampling each other: claims, branch names, main protection, the three worktree pools, and why anything that commits runs on the host.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

Claude Code, Codex and cloud sessions work this repo at once through ~100 linked worktrees, and
most wasted work here has been one session not seeing another.

### Look before you start — [report: bin/coordination_report.py]
- **Look before you start.** `python3 bin/coordination_report.py --prs` lists who else is
  active, which of your paths another worktree or open PR also changes, and work sitting
  uncommitted or unpushed; the SessionStart vitals print its short form. It derives all of it
  from git (no claims file to keep), is report-only, and says `PARTIAL` rather than clear when a
  budget cut the sweep. Without `--prs` it cannot tell a squash-merged branch landed once `main`
  has moved past it, so offline overlaps with an old branch are probably noise.

### Claim with a draft PR on your first push — [judgment]
- **Claim with a draft PR on your first push**, not a note — the one claim Codex, a cloud
  session and the owner can all see — and `git worktree lock --reason "<session>" .` so no
  cleanup pass removes your worktree under you (`remove`/`prune` refuse a locked tree).

### No work lives only on one disk past its session — [report: bin/coordination_report.py]
- **No work lives only on one disk past its session.** Commit and push (draft) before stopping;
  the report's "at risk" list is the alternative (#691 rescued commits that were on no remote).
  It never deletes anything: triaging that list is the owner's call.

### Order content merges around an open attestation sitting — [report: .github/workflows/pr-signoff-impact.yml; bin/signoff_impact.py]
- **Order content merges around an open attestation sitting.** While an `attest/pending` PR is
  open, a content PR that edits a page in it lands after it, or says in its body that it forces
  a re-sign — #813 and its siblings drifted 22 pages the owner had signed that same day.
  Every PR carries a **`Sign-offs (advisory)`** check (`pr-signoff-impact.yml`) naming the
  signatures merging it would reopen, from the base tip to GitHub's test merge; run
  `python3 bin/signoff_impact.py` before pushing to see the same list. Information, never a gate.

### A handoff records the SHA it was verified at — [judgment]
- **A handoff records the SHA it was verified at, and the receiver re-verifies against current
  `main` before acting** — the #626 handoff prescribed committing 35 MB past LFS and writing
  attestations. `13_Faculty_Resources/Handoffs/STATUS_LATEST.md` is a superseded July snapshot.

### Codex review runs before a PR goes on Josh's approval list — [judgment]
- **Run the Codex review before a PR is placed on Josh's approval list, not after.** Fold its
  findings in first, then list the PR. On 2026-10-28 #1115 and #1119 were approved, and only
  then did a Codex review prompt their authoring sessions to push new teaching logic and new
  suicide-intent patterns — the approved diff was no longer the diff on the PR. A review that
  can still change the content belongs before the approval, so the approval is the last word.

### After `josh-approved`, the owning session does not push content — [report: .github/workflows/approved-head-guard.yml; bin/approved_head_guard.py]
- **Once a PR carries `josh-approved`, its owning session must not push content to it.** A fix,
  a Codex follow-up or a second thought goes in a **follow-up PR**, or the session comments on
  the PR and asks Josh for re-approval. Any new commit, including a merge from `main`, requires
  a fresh approval receipt. Every
  session pushes as the same account and the ruleset keeps an approval through a new push, so
  GitHub alone never shows that the approved head moved (#1115, #1119, 2026-10-28).
- **The merging agent records the approval** with
  `python3 bin/approved_head_guard.py receipt --pr <n> --expect-head <full sha Josh reviewed> \
  --chat-approval-ref <chat://thread/<thread>#message/<message>> --approval-scope <owner/repo#n>`:
  it posts a receipt comment (head SHA, merge base, fingerprint, user-chat evidence pointer and
  scope), then adds the label. It requires the exact 40-character head SHA and exact PR scope.
  The chat pointer must identify the specific user approval message, but it is an honest-session
  record only: it does not independently prove human identity, authenticate a reviewer, or
  authorize a change. It must never be invented or reused as approval for a different PR/head.
- **`approved-head-guard.yml` establishes its status when a PR opens, then re-checks every push and when a draft is marked ready**
  (trusted copy from `main`, hosted runner).
  Only the exact approved head → pass. Any new commit, a label without a current receipt, or a
  prior revocation → it writes a durable bot-authored revocation marker, removes the label,
  returns the PR to draft, comments "head changed after approval — re-approval needed", and
  fails. It is **not**
  a required check (that is Josh's call), and it is a tripwire for honest sessions, not a lock:
  the shared account and a stored review URL do not authenticate a human reviewer.

### Push the branch the day you create it — [judgment]
- **Push the branch the day you create it, before the work is finished.** A branch that exists
  only locally is invisible to every gate, every reviewer and every automation here. The
  2026-09-17 review found two branches stranded on one machine — including the 8-commit branch
  carrying `automation_branch_prs.py`, *the stranded-branch detector itself*, which could not
  report its own condition because it had never been pushed. Open the PR as a draft if the work
  is not ready; do not hold the branch back.

### Branch names — [judgment]
- **Branch names are `<agent>/<topic>` or `<agent>/<topic>-<date>`** — e.g.
  `claude/citation-gate-land-2026-09-27`, `codex/rounds-prep-quick-guided`. Keep the agent
  prefix: it is what makes ownership legible in `git branch -a` and what
  `automation_branch_prs.py` matches on.

### Never merge to `main` locally and never force-push — [gate: bin/check_ruleset_drift.py]
- **Never merge to `main` locally and never force-push.** `main` is covered by the active
  ruleset *main protection* (verified 2026-09-27): **no bypass actors**, `deletion` and
  `non_fast_forward` blocked, **0 required approvals**, **strict mode OFF**, and **4 required
  checks** — `build-test-validate`, `Smoke tests (nav crawl · faculty console · LFS · visual)`,
  and both Netlify deploy previews. Strict mode being off is the operationally important half:
  a PR merges on green checks **without** re-syncing, so re-sync only a PR that conflicts or
  shares files with what just merged.

### Worktree pools — [judgment]
- **Worktrees live in one of three pools**, each registered in `.git/worktrees`:
  `.worktrees/<topic>/` (in-repo), `.claude/worktrees/<name>/`, or a loose sibling checkout
  `~/Psychiatry-Clerkship-Library-<purpose>/`. Remove with `git worktree remove <path>` once
  the PR merges — deleting the directory by hand leaves the registration behind.

### Remove your own worktree when its PR merges or closes — [judgment]
- **One worktree per task; the session that made it removes it.** Reuse your own for follow-ups,
  and check `git worktree list` first: with 40+ pool worktrees or 25+ loose siblings live, clean
  up before creating another. When the PR merges or closes (or the task ends with nothing to
  ship), in the same session: `git status --porcelain --untracked-files=all` is empty,
  `git rev-list --count HEAD --not --remotes` is `0` or your commits are in the PR, then
  `git worktree remove <path>` host-side — **never `--force`**; if git refuses, stop and say why.
  A lock is for work in flight: unlock when you finish. The host's nightly sweep honours a lock
  younger than 7 days and lifts an older one only when the tree is clean, pushed and its PR is
  merged or closed — re-lock with a fresh dated reason if a copy really must stay. Never delete
  `_build/`, `node_modules/`, or a worktree another session locked or a running watcher uses.

### Make a new worktree host-side with `lean_worktrees.py` — [judgment]
- **Make a new worktree host-side with `python3 bin/lean_worktrees.py new <name> [--base REF]`.**
  It always lands in `<main checkout>/.claude/worktrees/<name>` and fills the LFS media by
  copy-on-write clones of git's own store, so a copy costs ~60 MB of disk instead of ~500 MB and
  appears in 1–2 s (2026-09-30). **Never create a worktree inside another worktree** (a
  `.worktrees/` or `.claude/worktrees/` below your own copy): those folders are gitignored, so
  removing the outer copy silently deletes the inner one. A weekly Mac job
  (`bin/install_worktree_prune.sh`, Sundays 09:00) removes copies that are clean, merged and idle
  12 h+ (`bin/prune_worktrees.py`), then clones identical files in the rest
  (`bin/lean_worktrees.py share`). A copy you must keep: `git worktree lock --reason "<why>" .`

### Never run `git worktree prune` from an agent sandbox — [judgment]
- **Never run `git worktree prune` from an agent sandbox.** Worktrees are registered at host
  paths (`/Users/jm/...`) that do not resolve inside a sandbox mount, so **every** worktree
  reports `prunable` there regardless of its real state — 26 of 26 did on 2026-09-17. Pruning
  on that signal deregisters trees holding uncommitted work. The same mount gap means git
  itself does not run inside a sandboxed worktree (`fatal: not a git repository`), so
  `bin/check_vacuity.py` and anything else that shells out to git must run host-side.
  `git worktree list` is safe and read-only; act on it only from a host shell, and only after
  checking each tree for uncommitted changes.

### Anything that commits runs host-side — [gate: .claude/hooks/lfs_guard.py]
- **Anything that commits runs host-side, not in the Cowork sandbox.** Git-LFS is absent there,
  so the ~100 `.m4a` files under `07_Evidence_and_Reading/` show as falsely modified and a
  commit made there replaces real media with pointer stubs. Read and analyse in the sandbox;
  commit, push and build on the host. Confirm with `git status --porcelain | grep -c '\.m4a'`
  → expect `0`.

### `bin/verify.sh` is the pre-push hook — [gate: bin/verify.sh; bin/install-hooks.sh]
- **`bin/verify.sh` is the pre-push hook**, so a red gate blocks the push itself. The hook runs the
  `--push` tier — every check except the two site builds, which CI and the deploy previews run
  on every PR (decision `prepush-builds-to-ci`, 2026-10-18; measured first: the builds were 48 %
  of the hook). `bash bin/verify.sh` with no flag is the full battery, several minutes —
  background it to a log and poll rather than waiting on it interactively.
