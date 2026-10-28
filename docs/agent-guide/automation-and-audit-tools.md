# Automation, hooks and audit tools

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). Subagents, MCP servers, session hooks, the `bin/` audit family that finds what no schema can, the currency guards, the egress probe, the self-retiring queue, the silent-shrink checklist and the nightly runner.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### Project subagents — [gate: tests/agent-definitions.test.mjs]
- `.claude/agents/` — project subagents (`evidence-verifier`, `deploy-verifier`). The frontmatter
  tool allowlist is the enforcement; `tests/agent-definitions.test.mjs` pins each agent's scope.
  **`deploy-verifier` cannot reach `*.netlify.app` from a sandboxed web session** — the egress
  proxy answers `403` to the `CONNECT`, so its whole HTTP runbook is unrunnable there. It falls
  back to Netlify's deploy record (read-only, keyed by the `siteId` already in
  `maintenance_config.json`) and reports `DEPLOY VERIFIED · CONTENT UNVERIFIED`: a `ready`
  **production** deploy proves the build's Git-LFS gate passed, and proves nothing about served
  content. The inference does not carry to a preview — `check_lfs_media.py`'s `is_soft_context()`
  is true on `deploy-preview`, so a preview reaches `ready` with pointer stubs in it. Run it from a
  machine with real egress when you need the content half.

### `.mcp.json` — [judgment]
- `.mcp.json` — the project MCP servers a Claude Code / Codex session picks up in this repo.
  Today that is **GitHub** (remote HTTP), which is what gives a session `mcp__github__*` — reading
  and opening PRs, reading CI, posting review replies. It reads
  `${GITHUB_PERSONAL_ACCESS_TOKEN}` from the environment and **no token is stored in the repo**;
  without that variable the server simply fails to connect and everything else still works.
  Nothing in the build, CI, or the nightly runner depends on it: the queue runner deliberately
  uses `secrets.GITHUB_TOKEN` inside Actions instead, because a scheduled session's MCP list is
  not something the repository controls — that is precisely how the first runner failed.

### Session hooks — [gate: .claude/settings.json; tests/hooks.test.mjs]
- `.claude/settings.json` + `.claude/hooks/` — session hooks that enforce the rules below at edit
  time: crisis contacts, dose literals, localStorage namespaces, machine paths (deny); PHI and
  instrument item text (ask); LFS phantoms on `git add` (deny); registry validators, workflow
  digest, and AGENTS.md sync after an edit; a quick gate at stop. `bin/install-hooks.sh` installs
  the matching **pre-commit** gate for hand edits. The tool hooks (PreToolUse/PostToolUse) also
  fire for a subagent's tool calls; SessionStart and Stop are session-level. A subagent's tool
  allowlist is still its primary enforcement. `tests/hooks.test.mjs` drives every hook.

### The `bin/` audit family and the currency guards — [report: bin/sweep_unlicensed_claims.py; bin/check_source_integrity.py; bin/check_review_cadence.py; bin/check_icd_codes.py; bin/check_claim_direction.py]
- `bin/` — the audit tools that find the defect classes **no schema or gate can see**, because
  each item is individually valid and the corpus is jointly wrong. `sweep_unlicensed_claims.py`
  (specific assertion, no attribution in range — report-only; calibrate before quoting a count),
  `verify_spans.py` (every sentence of a stored `sourceSpan` must appear verbatim in the paper —
  the validators check claim-vs-span, this checks span-vs-paper), `check_qbank_coherence.py`
  (two question-bank items that teach different steps for the same scenario),
  `check_instrument_links.py` (dev-only; the recorded instrument routes still resolve —
  deliberately not in CI, external links are flaky and the build egress blocks those hosts).
  **Currency guards (2026-09-18)** — the world changing under a claim that is still internally
  perfect: `check_source_integrity.py` (PubMed `CommentsCorrections` + Crossref `updated-by` for
  every source with a PMID/DOI — retraction, erratum, expression of concern, newer version — but
  ONLY what `governance.correctionStatus` / `supersededBy` do not already record; P0 is a
  retraction of a source that licenses a claim; run it from a machine with real egress, a
  datacenter runner is bot-blocked by some hosts; it never edits the registry — recording a
  correction is faculty's), `check_review_cadence.py` (NAMES the sources `lastReviewed` +
  `reviewCadence` make due, overdue or due within 30/90 days — `monthly_review.py` only counts
  them; same month-end clamping, pinned by the self-test. **Policy 2026-09-19: a green
  guideline-surveillance examination counts as a surveilled source's review** — credit is
  DERIVED from `surveillance/history/baselines/<id>.json` at read time, never written to the
  registry, and withheld across a `modified` finding the faculty have not actioned), and `check_icd_codes.py` (every
  dotted F-code in shipped content exists in the ICD-10-CM set in force on the date it is read,
  from committed tables under `bin/data/`; `retiring` fires BEFORE the October 1 boundary).
  All three state what they examined beside the verdict, exit 2 rather than pass over a
  partial set, and only the self-tests (plus the offline ICD scan) run in `verify.sh`.
  `check_claim_direction.py` is the step after a supersession finding: given a source id
  and the newer DOI/PMID it fetches the newer abstract (Europe PMC) and reports, per stored
  claim, whether the span survives verbatim, whether the sentences carrying the claim's
  terms keep the stored direction (C5's own marker list, imported), and which quoted
  statistics vanished — `consistent` / `contradicts` / `unlocated` / `unclear`. Advisory:
  exit 0, the located sentences are the evidence; `--strict` for scripts. First case
  (2026-09-19): `williams-2022` pub3 → pub4 — span 2/2 verbatim, direction consistent, the
  update changed nothing taught.

### Egress is an allowlist — [report: bin/probe_egress.py]
- **Egress is an allowlist, and which side of it a host falls on decides which tasks are possible
  today.** `bin/probe_egress.py` reports that in the repo's own terms — not "itunes.apple.com is
  unreachable" but "the podcast canonical backfill cannot run here". The SessionStart hook prints
  a capped summary; run it directly for the full table, `--json` for a machine-readable one.
  Report-only, exits 0 always, deliberately not in CI and not in `verify.sh` (a report that fails
  a push is a report nobody keeps). Two traps it exists to prevent: a refused CONNECT tunnel and
  a host's own 403 are **not** the same thing — one means you cannot get there, the other that you
  need a credential — and reachability is a fact about the environment, never a content finding.
  Results cache outside the repo for 6h and invalidate when the proxy changes;
  `CLERKSHIP_SKIP_EGRESS_PROBE=1` turns it off.

### The queue that cannot rot — [report: bin/what_can_i_do_today.py; tests/what-can-i-do-today.test.mjs]
- **The queue that cannot rot.** `bin/what_can_i_do_today.py` joins the egress probe's capability
  map to a per-task measurement of how much work is left, and ranks what is actually possible
  *here, now*: ready / needs-a-key / blocked. Two rules make it trustworthy and both are pinned by
  `tests/what-can-i-do-today.test.mjs`: a task whose count reaches zero **retires itself** (nobody
  prunes a checklist), and a measurement that **fails reports `unknown`, never zero** — zero means
  done and would silently retire real work. A metric nobody can drive to zero does not belong in
  it: "topics with no book" and "unattributed claims" were both dropped for that, one a category
  mismatch, the other gameable by renaming a heading. **The mirror failure is worse**: a task
  whose predicate a DIFFERENT task's output can satisfy retires work that never happened —
  "isbn-verify" (confirm each edition against a catalogue) was measured by whether the line
  carried an ISBN-13, so the moment `isbn-derive` wrote them it reported 0 of 51 and retired,
  having queried nothing. A never-retiring task wastes runs; a falsely-retiring one loses the
  work silently. Confirmation needs its own persisted marker, so until something records one the
  task is not listed. Report-only, exits 0, not a gate.

### `docs/SILENT_SHRINK_CHECKLIST.md` — [gate: bin/check_vacuity.py]
- `docs/SILENT_SHRINK_CHECKLIST.md` — the failure mode every `bin/` tool exists for, as a
  checklist: **a check reporting success over a set smaller than the one it claims to check.**
  Thirteen entries, each earned by a defect that actually shipped here (#480, #517, #534, #539,
  #545, #548, #645, the 2026-08-21 annotation pass) and none of them caught by a schema or a
  type, because each item was individually valid and the corpus was jointly wrong. §D4 is the
  shape inverted — **no check at all rendering as coverage**: CI's unit is a pull-request head
  or a push tip, never every commit, so `61beb3b` (pushed to `main`, not the tip of its push)
  carries 0 check runs, turned `main` red, and read as the *next* commit's fault. Run it when you
  write or review a guard, and use §F to answer it by BREAKING the check rather than by
  reasoning about it — including the step people skip, reverting the fix to prove the fix is
  what made the difference. Only §D2 is mechanised (`bin/check_vacuity.py`); the rest is
  judgment, which is why it is written down.

### The nightly queue runner — [gate: bin/run_queue_task.py; tests/run-queue-task.test.mjs]
- **A nightly runner acts on that queue — as a workflow, not as a session.**
  `.github/workflows/maintenance-queue-runner.yml` (04:40 UTC daily, plus `workflow_dispatch`)
  runs `bin/run_queue_task.py`: one task from `--next-autonomous` or nothing, that task's own
  `run`, that task's own `verify`, then a **draft** PR. It never merges, never marks ready, and
  never edits `reviewed.json`. **It was a scheduled Claude session and that could not work**: the
  fired Routine had `sources: []`, so the repository was never cloned — the first firing reported
  SUCCEEDED and produced nothing, and even the runbook's degraded "push the branch anyway" path
  was unreachable. Autonomy is derived, not declared (`is_autonomous()` = a deterministic `run`
  **and** a `verify` that can fail), which is exactly why no model is needed to execute it;
  curation and attestation are excluded by construction rather than by a reviewer remembering.
  Four guards, each with its own exit code and each pinned by `tests/run-queue-task.test.mjs`:
  the run must change a file (3), the task's own count must **move** (4 — a task measured by a
  number the work cannot move reopens the same empty PR every night; it happened), no changed
  path may be the attestation ledger, a clinical registry or LFS media (5), and an edit to an
  attested page must be announced in the PR body. It also writes an **`outcome`** output on
  every exit path (`did-work` · `nothing-to-do` · `blocked` · `dry-run` · `no-commit`) —
  **three of the five are exit 0**, so a green run does not mean it did anything; the exit code
  says which guard refused, the outcome says what the night accomplished — the ledger stays byte-identical, and
  `post_edit_validate.py` catches that only for Edit/Write/MultiEdit while these scripts write
  through Bash. Read `_automation/AUTONOMOUS_QUEUE_RUNNER.md` before changing any of it; the
  workflow is enrolled in `validate_scheduled_workflows.py`, so editing it means recomputing its
  contract digest.
