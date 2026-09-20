# Agent Guide — Psychiatry Clerkship Library

Single source of truth for a six-week adult inpatient psychiatry clerkship (Joshua Moss, MD).
This repo is a **static-site builder**: one source tree publishes **two Netlify sites** —
`une-ms3-psychiatry` (MS3 students) and `mmc-psychiatry-residents-sanford` (residents) — plus a
serverless SP-interview proxy. Numbered `NN_Category/` dirs are **content source**; the build
assembles them into `_build/ms3` and `_build/res`.

> **Codex parity:** this repo is used by both Claude Code and Codex. `CLAUDE.md` is canonical;
> `AGENTS.md` is a **byte-identical copy** of it (Claude reads `CLAUDE.md`, Codex reads `AGENTS.md`).
> After editing `CLAUDE.md`, run `cp CLAUDE.md AGENTS.md` — CI fails the PR if the two diverge.
> (No symlink: this repo has `core.symlinks=false`, so a link would check out as broken text.)

## Build & deploy
```bash
# Build one site + run the static-QA publish gate. This IS each site's Netlify build command.
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3   # → _build/ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res   # → _build/res
```
- **Two sites, one repo.** Build command and publish dir are set **per-site in the Netlify UI**, not
  in `netlify.toml` (kept intentionally minimal — one toml can't express two sites, and it's read
  *after* the clone). The legacy `GIT_LFS_ENABLED` / `GIT_LFS_FETCH_INCLUDE` env vars also live
  there and are being **retired** (next bullet but one). See `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`.
- Deploy-on-push to `main`. Deploy previews: `https://deploy-preview-{PR}--{slug}.netlify.app`.
- **Git LFS** tracks `*.mp3 *.m4a *.wav *.mp4`. Never commit LFS **pointer stubs** (~133 B) in place
  of real media — the build's LFS gate fails the deploy. In sandboxes without LFS installed, audio
  shows as false "modified"; don't commit those.
- **LFS bandwidth is metered per GitHub account (10 GB/mo).** If *every* production deploy of both
  sites fails the LFS gate while previews and CI stay green and nothing changed, it is the quota,
  not the code (2026-08-30 outage) — see `site_build/NETLIFY_LFS_RUNBOOK.md` "Incident pattern 2".
  `site_build/lfs_pull_cached.sh` pulls media inside the build from Netlify's persistent cache so
  a merge costs ~0 MB; it only takes effect once `GIT_LFS_ENABLED` is removed from the site's UI.
- **`CLERKSHIP_ANALYTICS=off|ms3|res|both`** gates the usage-analytics emitter (`common.py`'s
  `analytics_enabled_for()`), **default `off`**. Per the rollout in
  `docs/superpowers/specs/2026-09-04-usage-analytics-design.md`, enabling it is the repo owner's
  call, not a build default — set it in the Netlify UI per site when the owner decides to enable a
  site (`res` first, then `both`), never as a repo-wide default. Off ships neither `analytics.js`
  nor any `CW_SITE`/`CW_PAGE` tag; `check-static-site.mjs` §12 treats that as a clean, gated build,
  not a failure.

## Validate & test
```bash
# Python contract validators (also run first inside build_and_check.sh and in CI)
python3 -m pip install -r requirements.txt
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py

# Root static-regression tests (node:test). Scope to the *.test.mjs glob — tests/smoke/*.spec.js
# is a separate Playwright suite (own deps + CI job; not runnable from repo root).
node --test tests/*.test.mjs        # guarded in CI (build-test-validate)

# THE one-command local gate. Runs everything CI runs plus checks CI does not have
# (span audit, qbank coherence). ~90s+ — background it to a log and poll. This is what the
# pre-push hook runs, so a red verify.sh blocks every push from the Mac.
bash bin/verify.sh            # --quick for the fast subset

# Playwright smoke suite (nav crawl · LFS integrity · visual regression)
cd tests/smoke && npm ci && npx playwright test
```
- CI (`.github/workflows/ci.yml`) runs on every PR: path-lint → media/topic_meta/longitudinal
  validators → build+QA gate (ms3 & res) → smoke tests. It mirrors Netlify, so breakage turns a PR
  red instead of only failing at deploy.
- `bin/verify.sh` is a **superset** of `ci.yml`, not a mirror: `bin/check-verify-coverage.py`
  enforces that every CI step has a local equivalent (or a recorded `ALLOWED` exemption), but
  verify.sh may run more. `bin/verify_spans.py` and `bin/check_qbank_coherence.py` run there and
  not in CI, and both are **ratchet gates** (`docs/RATCHETS.md`): the finding counts each one
  reports (flagged rows, TRUNCATED and EDITED sentences, uncached rows; contradicting pairs)
  are pinned in a committed `bin/*_baseline.json` beside the tool, a rise exits 1, a fall
  prints a note, and "could not check" (no baseline, a baseline missing a key, nothing
  audited) exits 2
  — never 0. Since verify.sh's `step` treats any non-zero as FAIL and verify.sh is the pre-push
  hook, either one **blocks a push**. Until 2026-09-16 the span audit gated REWORDED sentences
  only, so the pott-2022 defect it was built for (a clause deleted MID-sentence classifies as
  EDITED) exited 0, and a wrong cache path printed "0 clean, 0 flagged, 49 uncached" and passed;
  both are red now (`sentences_edited` and `rows_uncached` are pinned). Read the flagged rows the
  tool prints — a PASS line means "at or below baseline", not "nothing found". Lower a pin only
  after a reviewed reduction: `python3 bin/<tool>.py --update-baseline`, JSON diff in the same PR.
- **A local gate failing while CI is green usually means bash 3.2**, not your change: the Mac's
  `/bin/bash` is 3.2.57 and CI's is >= 4.4. Under `set -u`, bash < 4.4 treats `"${ARR[@]}"` on an
  empty array as unbound and aborts with an empty message (PR #469). Write
  `${ARR[@]+"${ARR[@]}"}`. Prove whose fault it is by running the failing gate on clean `main`
  before reaching for `--no-verify` (which is never the answer).
- **Visual baselines must be generated on Ubuntu/Chromium** (the CI runner), not a macOS laptop —
  regenerate via the "Refresh visual baselines" workflow_dispatch, not locally.

## Where things live
- `13_Faculty_Resources/_automation/site_build/` — the build pipeline: `build_deploy.py` (assembler),
  `build_and_check.sh` (build + gate), `check-static-site.mjs` (static QA), `site_manifest.json` (source→slug map).
- `site_manifest.json` is the registry of **hand-registered** shipped pages (tools + content md). A
  new page must be registered here **and** in nav inside `build_deploy.py`, or the QA gate's
  orphaned-source check hard-fails the build. **It is not the only source of what ships** — it is
  one of five producers; Case-of-the-Week pages, for instance, are appended at build time from
  `08_Cases_and_Simulation/case-of-the-week/cotw_registry.json` (`cotw_slug()` in
  `site_build/cotw_slug.py`). Anything that needs "the set of shipped pages" must read the one
  derived listing, `site_build/shipped_pages.json` — `load_shipped_pages()` in `shipped_pages.py`
  (Python) or `deriveContentUniverse()` in `faculty-console/content-universe.mjs` (JS) — never the
  manifest alone. See the gotcha below.
- `NN_Category/` (00–14, 99) — curriculum **content source**, not build output. `14_Tracks/<audience>/`
  are link-only overlays; content never forks (see README).
- Root data + schemas: `question_bank.json`, `topic_meta.json`, `communication_cases.json`, etc. —
  each validates against its paired `*.schema.json`.
- `sp-proxy/` — serverless LLM patient for The Interview Room. **API key stays server-side; the browser
  holds only a passcode.** Run `sp-proxy/REDTEAM_CHECKLIST.md` after every deploy and every model/pack change.
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
- `.mcp.json` — the project MCP servers a Claude Code / Codex session picks up in this repo.
  Today that is **GitHub** (remote HTTP), which is what gives a session `mcp__github__*` — reading
  and opening PRs, reading CI, posting review replies. It reads
  `${GITHUB_PERSONAL_ACCESS_TOKEN}` from the environment and **no token is stored in the repo**;
  without that variable the server simply fails to connect and everything else still works.
  Nothing in the build, CI, or the nightly runner depends on it: the queue runner deliberately
  uses `secrets.GITHUB_TOKEN` inside Actions instead, because a scheduled session's MCP list is
  not something the repository controls — that is precisely how the first runner failed.
- `.claude/settings.json` + `.claude/hooks/` — session hooks that enforce the rules below at edit
  time: crisis contacts, dose literals, localStorage namespaces, machine paths (deny); PHI and
  instrument item text (ask); LFS phantoms on `git add` (deny); registry validators, workflow
  digest, and AGENTS.md sync after an edit; a quick gate at stop. `bin/install-hooks.sh` installs
  the matching **pre-commit** gate for hand edits. The tool hooks (PreToolUse/PostToolUse) also
  fire for a subagent's tool calls; SessionStart and Stop are session-level. A subagent's tool
  allowlist is still its primary enforcement. `tests/hooks.test.mjs` drives every hook.
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
- `docs/curriculum-review/findings/` — the review→remediation loop. `export_curriculum_review.py`
  produces the transcripts, a review pass writes `findings.json` (id · verbatim `quote` ·
  ready-to-paste `replacement` · `verification`), and remediation lands as small per-work-package
  PRs. **`rejected.json` is a do-not-apply list** — each entry records why the page was right.
  Findings point at transcripts; you fix **sources** (never hand-edit `docs/curriculum-review/`).
  Completion check for a claimed fix: grep its verbatim `quote` in the regenerated transcript —
  it must be gone. Still present = you edited the wrong audience's source.
- `docs/superpowers/{plans,specs}/` — dated design docs and implementation plans.
- `13_Faculty_Resources/_automation/export_curriculum_review.py` → `docs/curriculum-review/`
  — assembles a complete human-readable transcript of everything each site ships (one set per
  audience) for external clinical review. Reads the **builds**, not the source tree, so it
  reflects nav order and audience scoping. Report-only; regenerate after building both sites.

## Conventions & gotchas
- **localStorage keys must be namespaced `cw_*` (shared hub) or `rp_*` (resident).** The QA gate
  hard-fails any other prefix. Item-id collisions silently corrupt attestation (`cw_qbank_attest_v1`) and SRS state.
- **Usage analytics store integers, never events.** `metrics/` is a separate Netlify site whose
  one function accepts an allowlisted event key and increments a counter keyed by site + ISO week.
  It stores no IP, user agent, session id, or timestamp finer than the week, and it does not log
  requests. The allowlist is GENERATED from `shipped_pages.json` — regenerate with
  `analytics_events.py --write` after adding a page or a tool step, or the freshness gate fails.
  Cohorts here are 4-10 learners, so reported cells below n=5 are suppressed. Adding a metric is a
  registry edit, never a free-text string: `check-static-site.mjs` hard-fails a computed or
  unlisted `cwAnalytics.record()` argument.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.
- Clinical tools are **single-file HTML** (Clinical Warm palette — build-injected from
  `13_Faculty_Resources/_automation/site_build/clinical-warm.css`). Dose literals
  are banned in `rp-*` / `*-trainer` tools (QA gate).
- **A tool frame is content-height by default.** The shell sizes `<iframe class="toolframe">`
  to the tool document (`fdSizeToolFrame` in `spa_index.html`; `fdToolFrameMode` /
  `fdToolFrameHeight` in `fd_wire.js`) so the page is the only scroll surface. A tool that lays
  itself out against its own viewport — a fixed bottom bar, a sticky panel, a transcript with its
  own scroll — declares `<meta name="cw-frame" content="viewport">` in its `<head>` and keeps the
  viewport-height frame; `tests/tool-frame.test.mjs` pins the set of such tools and
  `tool-expand.spec.js` measures the live frame. Surveyed before the default flipped (2026-09-19):
  no shipped tool sets html/body height or overflow, so the html box is the content height.
- **Crisis contacts (988 etc.) live in `crisis_resources.json` only.** Never hard-code a crisis
  number in a content page or tool. A page opts in with a `<!-- crisis-block -->` marker
  (`<!-- crisis-block-html -->` in tools); `site_build/crisis_block.py` renders it and
  `build_deploy.py` injects at build time, so `res` inherits it via `resident_section.py`.
  Dropping the marker from a required safety surface **hard-fails the build**. Scope rule for
  adding a surface: the learner must plausibly be *doing* risk work there (assessing, rehearsing,
  or planning disposition) — not merely reading a page that mentions suicide. Data is derived
  from the ReConnect crisis dataset and independently re-verified — refresh with
  `_automation/sync_crisis_from_reconnect.py --reconnect <path>` (dev-only, report-only; never
  runs on Netlify).
  **Opting a surface in has two non-obvious consequences, each of which has cost a cycle.**
  (1) **The Reader stops collapsing that page.** `makeCollapsible()` in `spa_index.html` returns
  early on any body containing `.crisis-block-hook`, so the contacts can never be stranded inside
  a `display:none` section body — in the DOM, absent from what a learner reads, unreachable by
  in-page find or print. A markdown page therefore gains contacts and loses its `.sec-c` wrappers
  in the same commit. `bin/verify.sh` cannot see it (the smoke suite is a separate CI job), and it
  turned #562 red — `front-door.spec.js` pinned `pg_interview.md`'s collapsible table section.
  Tools never reach `makeCollapsible`, so `<!-- crisis-block-html -->` is exempt.
  (2) **It does NOT reopen attestation.** The block is build-injected from `crisis_resources.json`,
  centrally governed and byte-identical across every surface, so it is not authored content on the
  page it lands on. `cd1ae13` opted six surfaces in at once, author-approved, without touching
  `reviewed.json`, and nearly every crisis surface still carries a `reviewed` row dated before its
  block (27 of 32 on 2026-09-08). Move a ledger row to pending when you change **authored** clinical
  content instead — which is what WP-5m did to `sp-interview.html` (new intent, new gated reveal,
  rewritten feedback cards), and that contrast is the line. A review bot reads the badge and files
  this as a P1 (#571): it is convention, not an oversight. Changing it is a policy call over the
  whole set, and the author's to make.
- **No PHI.** Clinical content is synthetic / de-identified only; never commit patient identifiers to
  git-tracked files, memory, or scratch outputs.
- **Every claim the library makes about a paper needs that paper's own words.**
  `evidence_annotations.json` stores a verbatim `sourceSpan` per source and
  `_automation/validate_evidence_annotations.py` gates it (CI + `bin/verify.sh`). If you add or edit
  a sentence asserting what a source found, add or update its span in the same change. **Read the
  results section, not the title or the conclusion** — a 2026-08-21 pass found 54% of annotations
  needed amendment and 7 said close to the opposite of the paper, all written from titles. `C5`
  rejects a positively-voiced claim licensed by a null/negative span; the fix is to rewrite the
  claim to match the paper, never to trim the span. Note the gate verifies the *stored* claim, not
  page prose — keep the two saying the same thing yourself.
- **Every page that ships must be attestable, and "what ships" is ONE derived file.**
  `13_Faculty_Resources/_automation/site_build/shipped_pages.json` is generated by
  `site_build/shipped_pages.py` from every producer (`site_manifest.json`, `cotw_registry.json`,
  and the `site_extras.py` lists the two build scripts copy), and `build_and_check.sh` verifies it
  against the **real build output** on every build. **Read it — do not read the producers.**
  Python: `load_shipped_pages()` in `shipped_pages.py`. JS: `deriveContentUniverse()` in
  `faculty-console/content-universe.mjs`. See `site_build/ADR-002-shipped-pages-single-source.md`.
  Why: from 2026-07-09 to 2026-09-04 the faculty console (`clerkship-faculty-attest.netlify.app`)
  built its review queue from `site_manifest.json` alone while COTW pages shipped from
  `cotw_registry.json`; 22 pending case pages never appeared under "Needs review" and nobody
  noticed, because the console showed *something* (questions). #517 taught the console the second
  source; ADR-002 found there were five producers in total and replaced remembering them with a
  derivation the build checks. Rules that follow:
  (1) a new route that puts a page on a learner site is a new **producer** — add it to
  `site_extras.py` and to `shipped_pages.py`'s `derive()`, and regenerate with
  `python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --write`; until you do,
  `--check-build` fails the build and names the slug;
  (2) do not add a direct read of `site_manifest.json`/`cotw_registry.json` to new code —
  `tests/shipped-pages-readers.test.mjs` freezes the remaining direct readers and that list may
  only shrink;
  (3) never "fix" a red `check_pending_visible` by adding a slug to `NOT_REVIEWABLE_IN_CONSOLE` —
  that list is only for items **not deployed on any learner site**, and it is empty today: the two
  `_prototypes/` tools that used to sit on it turned out to ship on the resident site all along,
  which is what deriving the universe from the build surfaced;
  (4) if you edit a producer, regenerate — a stale `shipped_pages.json` fails `--check` in CI, in
  `bin/verify.sh`, in the build, and in the post-edit hook;
  (5) when a faculty-facing surface shows a partial list, treat "partial" as a bug signal, not a
  filter — compare its count against `reviewed.json` before assuming it is right (today: 128, and
  a drifted row counts as needs-review there).
- **An attestation names the text it attested, and the name has to still fit.** A reviewed row's
  `contentHash` in `13_Faculty_Resources/reviewed.json` is a **git blob SHA over a manifest** —
  one line per input, each line itself a blob SHA: the slug's shipped source file(s) (`source`
  plus any `extraSources` in `site_build/shipped_pages.json`, sorted by path) and its
  `topic_meta.json` record canonicalised with `facultyReview` removed, because governance state is
  not content and attesting a page must not depend on the block that records the attesting. The
  rule lives once in `13_Faculty_Resources/_automation/attestation_hash.py`;
  `python3 bin/check_attestation_hashes.py --explain SLUG [--rev REV]` prints the manifest so
  anyone can re-derive the value by hand with `git hash-object --stdin`, and
  `faculty-console/attestation-hash.mjs` is the JS twin that the console writes with
  (`tests/attestation-hash-parity.test.mjs` pins the two byte for byte). Why: on 2026-09-16 #640
  and #672 added 85 citations to already-attested pages, and **#672 alone** re-dated three of
  those attestations and flipped three pending pages to `reviewed` under the owner's name (#640's
  governance damage was a different one: it wrote the SafetyKit rule into CLAUDE.md/AGENTS.md from
  inside a content PR — the rule #672 then leaned on). Every one of those pages went on reading
  reviewed, by a named clinician, on a date — nothing in the repository bound an attestation to
  the text it attested, so rewriting the page afterwards cost nothing and showed nowhere.
  **Drift is a notice; unbound fails closed.** A content PR edits an attested page
  constantly, so a stale row exits 0 — `bin/verify.sh` reports it and `bin/what_needs_josh.py`
  lists the drifted pages as the owner's work — but a reviewed *shipped* row with no
  `contentHash`, a malformed one (not 40 hex), a missing attested source, or an unshipped row
  absent from `attestation_hash.py`'s `LEDGER_ONLY_LEGACY` is an **error** in
  `validate_attestation_consistency.py`, which `site_build/build_and_check.sh` runs **before**
  either build — so a hand-edited ledger fails the Netlify production deploy and the last good
  deploy stays live, which is the intended posture for a crisis-content site, not an outage.
  **Only the faculty console may write a hash** (`faculty-console/netlify/functions/attest.mjs`,
  on attest): it shows a drifted row as needs-review — status `unreviewed`, reason "Content
  changed since faculty review on <at>; awaiting re-attestation." — and re-attesting rebinds it.
  The 2026-09-18 truthful backfill was the one-time exception, binding each existing row to the
  text as of its own `at` date (the day ends 23:59:59 **UTC**, always); its provenance is
  `13_Faculty_Resources/Handoffs/CONTENTHASH_BACKFILL_2026-09-18.md`. **That exception is spent**
  — `--write-backfill` is never to be run against the live ledger again, and
  `--write-backfill --as-of-now` least of all: it would rebind every drifted row to today's text,
  silently re-attesting pages nobody reviewed.
  **A drifted row RENDERS as pending, on every surface, and never unplaces the page.** Both
  builds load the ledger through `surface_governance.load_effective_ledger()`, which projects a
  stale row to `status: pending`, `by: "Pending faculty review"` and the one
  `attestation_hash.STALE_REASON` string. A learner therefore sees the ordinary pending-high or
  pending-compact notice carrying that reason, the nav/search badge, and — for a tool — the
  direct-open block plus `needs-review` in `tool-governance.json`. The **built** `topic_meta.json`
  is demoted in the same pass (`project_topic_meta_faculty_review`, after `cotw_meta.inject` in
  both build scripts): `facultyReview.status` becomes `pending` while `reviewer` and
  `lastReviewed` are **kept** (D6 — the review did happen on that date, over the older text), so
  the Front Door's `✓ … faculty-attested` line disappears for a drifted page without erasing who
  reviewed it. The source `topic_meta.json` and `reviewed.json` are never written: only the
  console writes the faculty's record. The weekly digest reports `staleAttestations` and sits at
  `gate: review` while the count is above zero, which routes one maintenance issue naming the
  count and the first five slugs. The demotion **warns, it never unplaces** — a drifted page stays
  in nav and in the search index, because an unreachable protocol at 2am is worse than a warned
  one. What pins all of that is `tests/attestation-projection-build.test.mjs`, which reads
  `_build/<site>` and asserts that the two built registries AGREE: a `governance.json` item that
  is pending with the stale reason has a built `topic_meta.facultyReview` that is not `reviewed`
  and still carries `reviewer`/`lastReviewed`; a `governance.json` item that is `reviewed` and
  has a source-authored block has a built block reading `reviewed` (it skips with its reason
  while that set is empty, rather than passing over nothing); every drifted slug is still placed
  in `nav.json` and every drifted index row badges `pending`; and no tracked `contentHash`
  appears in any served JSON. It is a local-only contract — `node --test` runs before both
  builds, so CI never reaches it. **What it does not pin is ORDER.** `cotw_meta.py` writes
  `facultyReview.status: "pending"` unconditionally for every derived case and `inject()` leaves
  a hand-written entry alone, while `project_topic_meta_faculty_review` only rewrites blocks that
  already exist — so inject-then-demote and demote-then-inject produce identical bytes, and
  re-ordering them is undetectable *and harmless*. A later write that re-marked a drifted page
  `reviewed` is the real hazard, and that one IS caught, because the two built registries would
  then disagree. Placement is not pinned by `faculty-console/check_pending_visible.mjs` either:
  that reads the **source** ledger, where a drifted row still says `reviewed`, and never opens
  `nav.json` or `search-index.json`. The search index legitimately carries fewer slugs than nav
  (the week pages and two tools are never indexed) and that omission is governance-independent,
  so the test asserts nav placement and the embedded badge rather than search membership.
  One knock-on to expect: `check-static-site.mjs` §4a2 counts only pages the built
  `governance.json` calls `reviewed` toward crosswalk coverage, so drift surfaces there as
  **soft** `blueprint gap:` findings — the §9 ratchet was raised 0 → 6 per site for exactly
  that, and each re-attestation lowers it, so **lower the pin back** as the queue drains rather
  than leaving headroom.
  **And what it does not close on
  its own:** a content PR that edits an attested page AND rewrites that row's `contentHash` in the
  same diff passes every gate *this* bullet installs — diff-scoped `--strict` fails only a touched
  row that is stale at head, and the authorship check reads the signer string. The next bullet
  closes it: rewriting a reviewed row's `contentHash` **is a promotion**, so L2 fails that diff on
  any branch but `attest/pending` and L4 fails it for any author or committer but the console.
  What survives both is a promotion pushed to `attest/pending` under a forged
  `faculty@clerkship.local` identity — deliberate fraud rather than drift, and the owner-side
  close for it is named there too. Not the same field as `canonical_claims.json`'s
  `contentHashAtReview`, which is a sha256 of one cited file's whole text per **cited-file
  entry** (an `appliesTo` entry in `canonical_claims.schema.json`, narrowed by
  `scopeHashAtReview`).
- **A content PR may register and demote an attestation; only the console may promote one.**
  `bin/check_governance_separation.py` reads a PR's whole range — base rev, head rev, head branch
  — and sorts every changed path into two sets. **Governance is the machinery of attestation,
  not only the ledger and the rule files** — the first draft named those alone and a content PR
  could still rewrite its own judge, `bin/`, in the same diff as the pages being judged. It is:
  `13_Faculty_Resources/reviewed.json`, `CLAUDE.md`, `AGENTS.md`, `decisions.json`,
  `standards.json`, `instrument_rights.json`, `vocabulary.json`, `.gitattributes`,
  `reviewed.schema.json`, and `_automation/`'s `attestation_hash.py`, `surface_governance.py`,
  `validate_attestation_consistency.py`, `validate_curriculum.py`, `validate_topic_meta.py`;
  everything under `.claude/` (skills, hooks, subagents, settings), `.github/` **in full** — not
  only `workflows/`: an action, a template or CODEOWNERS decides how work is reviewed too —
  `bin/` (every gate and audit tool, this one and `verify.sh` included), `faculty-console/`
  (what writes an attestation), `_automation/maintenance/` and `tests/maintenance/` (what pin
  the workflows and this guard); and **any path ending `.schema.json`**, wherever it lives, a
  schema being the shape a registry must hold. Two directories are deliberately **not**
  governance, because a legitimate content PR has to touch them in the same diff as the page it
  ships: `_automation/site_build/` is **registration data** — `site_manifest.json`,
  `cotw_registry.json`, the regenerated `shipped_pages.json`, `build_deploy.py`'s nav — without
  which a new page hard-fails the orphaned-source check, i.e. making it governance would forbid
  shipping a page at all; and `tests/` outside `tests/maintenance/` carries panel snapshots and
  per-surface rows a new surface legitimately brings with it. (A `*.schema.json` under
  `site_build/` is still governance: the data may ride along, the contract it must satisfy may
  not.) Neither exclusion is a hole in L2/L3/L4 — nothing under either can promote anything.
  **Content** is any path `site_build/shipped_pages.json` lists as a `source` or `extraSources`
  at **BASE or HEAD** — head-only, and de-registering a page in the same commit that rewrites it
  makes it stop being content exactly when it is being changed; 10 of the 130 shipped sources
  (the six `_prototypes/` tools, `sp-interview.html` among them, and four under
  `13_Faculty_Resources/`) are content *only* because the listing says so — plus anything
  matching `^(0\d|1[0-4]|99)_[^/]+/` that is not under `13_Faculty_Resources/` — a directory
  segment is required, so a top-level `03_notes.md` is not content — the derived listing because
  a page can ship from a path the regex misses (`welcome.md`'s resident override), the regex
  because a path can be content before any site lists it. A **promotion** is a claim that a
  review happened: in `reviewed.json`, a row whose `status` becomes `reviewed`, a row born
  `reviewed`, or a row reviewed on BOTH sides whose `at`, `by`, `risk`, `note`, `contentHash`,
  `claimsHash`, `evidenceHash` or `evidenceThrough` changes — **a missing key is a value**,
  because #640 promoted a row by *adding* a note to it; in `topic_meta.json`, a `facultyReview`
  block that becomes `reviewed`/`attested`, or one reviewed on both sides whose `lastReviewed` or
  `reviewer` changes; in **`question_bank.json`** (items identified by their `id`; 144 of 192
  carry `status: "attested"`, and `bin/run_queue_task.py` names it beside the other two as a
  registry the nightly runner may never edit), an item whose `status` becomes `attested`, an item
  born `attested`, or an item attested on **both** sides **any** of whose fields changes — an
  attested item has no separately-attested field, the stem, options, rationale and evidence are
  all the text faculty signed, so the honest edit demotes to `draft` first (registration) and
  re-attests afterwards. Everything else a content PR does to the ledger — a new pending row, a
  pending row edited, `reviewed`→`pending`, a row deleted, a demotion that drops
  `lastReviewed`/`reviewer` — is **registration**, and is exactly what a content PR is supposed
  to do. The rule forbids the claim, not the bookkeeping. Four laws: **L1** a governance path
  other than `reviewed.json` in the same diff as content; **L2** a promotion on any branch but
  `attest/pending`; **L3** a promotion in a diff that also changes content; **L4** any non-merge
  commit introducing a `reviewed.json` promotion whose author **or** committer email is not
  `faculty@clerkship.local` — **L4 is `reviewed.json`-only** (D3/D8 as written: the console does
  not write `topic_meta.json` or `question_bank.json`, so no console-identity rule could be
  defined for them). Exit 0 clean, 1 a failure, **2 could-not-check** — no base, no git, an
  unparsable registry, a registry that parses to the **wrong shape** (a `reviewed.json` or
  `topic_meta.json` that is not an object, a `reviewed.json` whose rows lack `status`, a
  `question_bank.json` with no `items` list, a `shipped_pages.json` whose `pages` is not a list:
  `{"entries": {…}}` and a bare JSON list both used to read as "every row deleted", i.e.
  registration, over a diff that promoted every row), a HEAD with no `shipped_pages.json`, a
  `reviewed.json` absent at head, or a base you NAMED that resolves to the head (`--base HEAD`,
  or `CLERKSHIP_PR_BASE` pointing at your own tip after a push: an empty range shows no
  promotion). The **default** base equalling the head is the opposite finding and exits 0
  saying so — it means the branch owns no
  commits, which is why a clean `main` still passes. Since the tool is a `bin/verify.sh` step and
  verify.sh is the pre-push hook, **2 blocks a push exactly as 1 does**: a classifier that cannot
  tell content from not-content would clear every diff it was handed. Why: run it over #672
  (`8b8ccd9`) and it fails L2+L3+L4 — three pending pages flipped to `reviewed` under the owner's
  name and three attestations re-dated, in the same diff as six content files, authored by
  `jmoss333` and committed by `GitHub`. Run it over #640 (`0009ad6`): L1+L2+L3+L4 — a rule written
  into `CLAUDE.md`/`AGENTS.md` from inside a 926-line content PR, plus a `note added` to an
  already-reviewed row. Nothing stopped either; the rule catches both retroactively. **When it
  fires:** split the governance edit into its own PR, and take the attestation through the
  faculty console rather than the ledger — a `topic_meta` `facultyReview` parity edit rides
  `attest/pending` with the promotion it mirrors, never a content branch. `attest/pending` is the
  only branch that may carry a promotion and `faculty@clerkship.local` — author AND committer,
  because #672 was authored by one identity and committed by another — the only identity that may
  author one. L4 asks git, not the ledger's `by` field, which any writer can type; it is still
  forgeable with `git commit --author`, but that is deliberate fraud with a name on it, not the
  drift this gate exists to stop. **Sync `attest/pending` with a MERGE, never GitHub's "Update
  branch → Rebase branch".** A rebase rewrites the *committer* on every commit it replays, so
  every console attestation on the rolling PR comes back committed by `jmoss333`/`GitHub` and
  L4 reddens the one branch that is allowed to promote — with a diff that looks untouched. The
  plain "Update branch" (a merge) leaves the replayed commits' identities alone, and L4 skips
  the merge commit itself. The CI step ("Guard — governance/content separation",
  `build-test-validate`) is **pull-request-only** — `github.event.pull_request.base.sha` is the
  one base a push event does not carry — and on an `attest/pending` PR it also runs
  `bin/check_attestation_hashes.py --strict --base`, so the one branch that may promote is the
  one branch whose promotions must bind to the text they attest. Its body and its branch literal
  are pinned by `validate_scheduled_workflows.py`'s `CRITICAL_STEPS` and
  `tests/maintenance/test_governance_guard_pins.py`. **On a branch stacked on an unmerged PR**
  the default base is `merge-base origin/main HEAD`, which carries the PARENT's commits — so the
  gate judges work this branch never wrote and blocks every push off the stack until the parent
  merges. Push with `CLERKSHIP_PR_BASE=origin/<parent-branch> git push`: it moves the base, it
  silences no rule, and naming the branch's own tip is exit 2, not a pass. **A stale base looks
  exactly like a breach, so the report says which it probably is**: when L2 fires but L4 stays
  silent — every ledger promotion in range was committed by the console itself, which cannot
  happen on a branch an agent or the owner wrote — the L2 block appends `hint: every promotion
  here was committed by the faculty console — if these rows are already on main, your base is
  stale`. The fix is a fetch, not an edit: `git fetch origin main`, or push with
  `CLERKSHIP_PR_BASE=origin/<parent>`. A local `origin/main` behind a merged console PR and a
  re-run CI event carrying an older `base.sha` both produce it. **The limits, which
  are the honest part.** L4 covers `reviewed.json` only, so a `topic_meta`-only promotion on
  `attest/pending` passes — the console does not write `topic_meta`, so no console-identity rule
  could be defined for it. On a **fork** PR both `github.head_ref` and the commit emails are
  attacker-controlled, so the gate does not authenticate a fork's promotion and does not claim
  to. The close is owner-side, not agent-side: move the console's token to a GitHub App or
  machine user so `faculty@clerkship.local` is an identity nobody else holds, and add a ruleset
  restricting pushes to `attest/pending` to it. Until that lands, this gate raises the cost of a
  forged promotion; it does not make one impossible.
- **Adding a step to `ci.yml` trips three separate contracts.** `bin/check-verify-coverage.py`
  (mirror it in `bin/verify.sh` or justify an `ALLOWED` exemption);
  `_automation/maintenance/validate_scheduled_workflows.py`, which pins the workflow by **exact step
  inventory *and* a sha256 of the whole file** — recompute that digest by importing the validator's
  own `_load`/`_contract_digest` rather than reimplementing its canonicalisation; and
  `_automation/test_validate_registry_schemas.py`'s `PAIRS` tuple if you added a root registry.
  **A GATE step has two more, five surfaces in all**: `validate_scheduled_workflows.py`'s
  `CRITICAL_STEPS` pins that step's exact `run:` body and its `if:` (a whole-file digest alone
  reports only "does not match exact contract" — the error an agent clears by recomputing the
  digest, blessing a step that no longer runs anything), and
  `tests/maintenance/test_governance_guard_pins.py` pins what the text has to MEAN: both tools
  still invoked, `HEAD_BRANCH` still from `github.head_ref`, and the shell's branch literal
  equal to `check_governance_separation.ATTEST_BRANCH`. Note `bin/` and `tests/maintenance/`
  are themselves governance under the Gate B bullet above, so a CI edit may not ride in a
  content PR.
- **A red node test silently aborts the build.** `build_and_check.sh` is `set -euo pipefail` and runs
  `node --test tests/*.test.mjs` *before* `build_deploy.py`, so a failing contract test exits early
  and `_build/` keeps serving **stale output** while the script merely looks "failed". If a source
  edit isn't showing up in the built site, run the node suite first.
  The corollary for **build-output tests**: guard on freshness, not existence. A `_build/` older
  than the source under test fails such a test honestly — the page really is not built yet — and
  that red then aborts the only supported fix, so the staleness protects itself. Use
  `staleBuildReason()` from `tests/_build_freshness.mjs`: it skips with the rebuild command when a
  declared input outran the build, and still hard-fails when a *current* build did not produce the
  page (that is a real regression, not a stale tree). Declare every input the assertions depend on
  — a path that does not exist throws, because a typo would make the check vacuously "fresh" and
  retire the contract silently. Note such assertions never run on Netlify or in CI: `node --test`
  runs before **both** `build_and_check.sh` invocations and `_build/` starts absent, so a
  build-output test is a local-only contract — do not rely on CI to catch what it pins.
  The same rule binds the `bin/` checkers that read the built sites: `bin/_build_freshness.py`
  is the Python twin of `tests/_build_freshness.mjs`, and each caller declares only its own
  inputs. Both of its failure modes have shipped here. **Absent** made `check_design_drift.py`
  iterate an empty list and print "design system clean" — a vacuous pass. **Stale** is worse and
  cost two days: a `_build/` 13 days old produced 22 findings (10 C4, 12 C8) against pages the
  source no longer emitted, every one fabricated, and a comparison against clean `main`
  "confirmed" them because both sides read the same stale tree. A checker that reads `_build/`
  must therefore report which sites it could not read and must NOT summarise as clean what it
  never opened — `check_design_drift.py` prints `PARTIAL` and names the sites; guard on
  freshness, not existence, and rebuild before believing any finding against a built page.
  The sibling rule for a test that **spawns** a build (rather than reading `_build/`): guard it
  with `lfsStubReason()` from `tests/_lfs_media.mjs` (JS) or `worktree_stub_reason()` in
  `site_build/check_lfs_media.py` (Python). Without git-lfs installed there is no smudge filter,
  so every LFS-tracked file checks out AS its ~133-byte pointer and `build_deploy.py` aborts in
  `welcome_compass.require_real_files()` — "MS3 Compass required files are invalid: <an .mp4>",
  a red no source edit can clear, which is what made three `ci-build-contract.test.mjs` cases and
  one `evidence_registry` case fail in every sandbox. CI never saw it: `is_soft_context()` already
  exempts the `lfs:false` checkout and deploy previews, so the guard returns null there and the
  contracts still run. **The predicate is defined once**, next to the deploy gate that enforces it;
  do not re-derive "is a pointer stub" in a new place. It returns null — meaning RUN — for every
  answer except a confirmed stub in a hard context, including "cannot tell": a skip guard that
  errs permissive retires real contracts while the suite still reads green.
- **THE LIBRARY TEACHES ADMINISTRATION; IT DOES NOT REPRODUCE INSTRUMENTS.** Same standing as the
  dose-literal rule. Teach *how to give* an instrument — the elicitation, the confounds, what the
  score does and does not license, what a negative result fails to rule out — and link to the
  official form. Do **not** ship the instrument itself: no verbatim item stems, no verbatim anchor
  ladders, no reproduced field labels, and no tool that functions as a fillable copy of a
  copyrighted form. "Programming the form" counts as reproduction even when no text is copied —
  the Stanley-Brown Safety Plan's terms name it explicitly, which is why the safety-planning work
  (WP-06R-b) is a *rehearsal* tool and reproduces nothing.
  Scope is a governance decision, not an agent decision: if a WP asks you to add verbatim item or
  anchor text, **stop and ask** rather than inferring that a particular instrument is exempt.
  **Resolved 2026-08-23 — Option A: the rule covers copyrighted instruments only** (#391). C-SSRS
  retires (WP-06R-a); Stanley-Brown is never programmed (WP-06R-b); PHQ-9/GAD-7 provisionally stay
  pending a check of the current permission footer (WP-02c); **BFCRS is RESTRICTED** (URMC written
  consent required) and **CIWA-Ar RETIRES** (2026-08-28, author's call — rights unestablishable, so
  the descriptors came down; WP-20 is closed with it). **COWS alone remains open**: permission real,
  scope wrong, its 45 verbatim anchors in `withdrawal.html` published under a recorded interim
  waiver pending the Taylor & Francis letter — that waiver is the one thing still blocking Wave 4,
  and an agent must not narrow or lift it. An instrument is exempt only once its status is recorded
  in the audit's decision table — Option A settles scope, not individual cases.
  **A withdrawal must leave a route (INV-IR2, 2026-09-03).** Retiring an instrument may not leave
  a dead end: every removed or link-only instrument ships the custodian's official `formUrl` from
  `instrument_rights.json`, and `site_build/instrument-rights-gate.mjs` fails the build when a
  pinned page drops it or points at a copy hosted here. `bin/check_instrument_links.py` re-checks
  the far end by hand; it is not a gate.
  Audit and current disposition: `docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md`.
