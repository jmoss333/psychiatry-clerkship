# Validate & test — the gates

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). What CI runs, how `bin/verify.sh` relates to it, the citation gate, the ratchets, and the traps (bash 3.2, per-step `TMPDIR`, visual baselines, live governance state, test-only flags) that have each cost a cycle here.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

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
# (span audit, qbank coherence). Several minutes — background it to a log and poll. The pre-push
# hook runs `--push` (everything except the two site builds, which CI runs on the PR — decision
# prepush-builds-to-ci), so a red verify.sh blocks every push from the Mac.
bash bin/verify.sh            # --quick for the fast subset

# Playwright smoke suite (nav crawl · LFS integrity · visual regression)
cd tests/smoke && npm ci && npx playwright test
```

### Heavy local runs go through `~/bin/heavy-test` — [judgment]
- **Run the Playwright smoke suite, `bin/verify-smoke.sh` and a full `bin/verify.sh` as
  `~/bin/heavy-test -- <command>`** — e.g. `cd tests/smoke && ~/bin/heavy-test -- npx playwright
  test --project=prototypes`. This Mac also hosts both self-hosted runners (`mac-jm-clerkship`,
  `mac-jm-rps`); on 2026-10-25 local agent suites pushed load past 30 and CI browser jobs timed
  out and flaked. The wrapper (host-side, not in this repo) takes a machine-wide `lockf` lock so
  one heavy run goes at a time across Claude and Codex, waits while a CI job is running (a
  `Runner.Worker` process exists; no tokens read), and caps Playwright workers — it exports
  `PW_WORKERS`, which `tests/smoke/playwright.config.js` honours, and appends `--workers` to a
  direct `playwright test`. `--no-wait` fails fast (exit 75); `heavy-test --status` prints load,
  runner and lock state. If detection fails it still runs, at one worker. `node --test` on a
  single file and `verify.sh --quick` don't need it. Never edit, restart or re-register a runner
  to get around it.

### What CI runs on every PR — [gate: .github/workflows/ci.yml]
- CI (`.github/workflows/ci.yml`) runs on every PR: path-lint → governance/policy separation →
  citation attribution → media/topic_meta/longitudinal validators → build+QA gate (ms3 & res) →
  smoke tests. It mirrors Netlify, so breakage turns a PR red instead of only failing at deploy.

### A citation must carry a DOI or PMID that resolves to the paper claimed — [gate: bin/check_citation_attribution.py]
- **A citation must carry a DOI or PMID, and it must resolve to the paper claimed.**
  `bin/check_citation_attribution.py` runs in both `verify.sh` and `ci.yml`.
  `--require-identifier` is **on by default** — that is the ruling, and it is what #672 needed,
  because not one of its 85 citations carried an identifier at all and the liveness check in
  `surveillance/` therefore had nothing to look at. Scope is numbered lines under a
  `## References` heading in curriculum markdown (270 today, 267 with an identifier). The three
  that have none are grandfathered by name in `bin/citation_identifier_allowlist.json`, **capped
  at 3 by `ALLOWLIST_CAP` in the script**; the list may only shrink, and an entry whose citation
  no longer reproduces is reported as **stale** (WARN, exit 0 — since 2026-10-07, the #982
  deadlock fix: those entries name content pages, and L1 keeps `bin/` out of a content PR) on
  every run until a follow-up governance PR deletes it. Comparison runs against the committed
  cache `bin/data/citation_attribution_cache.json` and **touches no network** — refresh it
  deliberately with `bin/refresh_citation_attribution_cache.py`, never from CI. Option B
  (search-and-judge) is `bin/audit_citation_allowlist.py`, a weekly sweep in
  `surveillance-citations.yml` that proposes identifiers and **blocks nothing**; keep it out of
  the merge path. Ruling and measurements:
  `docs/superpowers/specs/2026-09-27-citation-attribution-gate-ruling.md`.

### `bin/verify.sh` is a superset of CI, and the ratchet gates — [gate: bin/check-verify-coverage.py; bin/verify_spans.py; bin/check_qbank_coherence.py]
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

### A local gate failing while CI is green usually means bash 3.2 — [judgment]
- **A local gate failing while CI is green usually means bash 3.2**, not your change: the Mac's
  `/bin/bash` is 3.2.57 and CI's is >= 4.4. Under `set -u`, bash < 4.4 treats `"${ARR[@]}"` on an
  empty array as unbound and aborts with an empty message (PR #469). Write
  `${ARR[@]+"${ARR[@]}"}`. Prove whose fault it is by running the failing gate on clean `main`
  before reaching for `--no-verify` (which is never the answer).

### Every `verify.sh` step runs with its own `TMPDIR` — [gate: bin/tmp_leak_report.sh; tests/verify-tmp-sandbox.test.mjs]
- **Every `verify.sh` step runs with its own `TMPDIR`** — a `verify-step.*` directory removed
  when the step ends. Anything still in it prints as `LEAK <step> N entries left … (removed):
  <prefix>* (count), …` and fails the run; the prefix greps to the test that made the fixture.
  Fix the test (`t.after(() => fs.rmSync(dir, { recursive: true, force: true }))`, Python
  `addCleanup`/`TemporaryDirectory`), never the report. Why: on 2026-09-24 the Mac's shared
  `$TMPDIR` held ~122,700 entries, ~103k of them fixtures from three test files that never
  cleaned up; `python3` importing from that directory took ~20 s and `preview-site.test.mjs`
  blocked pushes while no test failed. A bare `node --test` outside verify.sh is not sandboxed.
  `bin/tmp_leak_report.sh`, pinned by `tests/verify-tmp-sandbox.test.mjs`.

### Visual baselines are generated on Ubuntu/Chromium — [judgment]
- **Visual baselines must be generated on Ubuntu/Chromium** (the CI runner), not a macOS laptop —
  regenerate via the "Refresh visual baselines" workflow_dispatch, not locally.

### No hard-coded machine paths in tracked `.py` — [gate: .github/workflows/ci.yml; .claude/hooks/pre_edit_guard.py]
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.

### A test may not depend on live governance state — [gate: tests/live-governance-state.test.mjs]
- **A test may not depend on live governance state.** An assertion that reads the real
  `reviewed.json` — "some page is pending", "the pending count is nonzero", "this dot is
  visible" — is a test of the faculty's queue, not of the code, and **faculty draining that
  queue turns it red**. That is exactly what happened on 2026-09-21: Josh attested 101 pages in
  #725, the learner UI correctly stopped showing pending notices, and four `front-door.spec.js`
  assertions failed for being right. #729 fixed them by pinning each branch with a **controlled
  governance fixture** and leaving the deterministic pending-dot coverage to the unit and
  governance suites. Write the fixture; never assert a live count. The inverse also holds — a
  test that passes only while a backlog exists retires itself silently when the backlog clears.

### An optional flag every test passes and production never passes is an untested production path — [judgment]
- **An optional flag every test passes and production never passes is an untested production
  path.** `sync_findings.py --out-dir` was documented "used by tests", had no default, and #711
  then added an unconditional `os.makedirs(args.out_dir)`. Every test in
  `tests/maintenance/test_surveillance_maintenance.py` passes `--out-dir`; all four scheduled
  surveillance workflows pass none. So the suite stayed green while every scheduled run of the
  citation, link, guideline and resource-intake jobs died with `TypeError: expected str, bytes
  or os.PathLike object, not NoneType` — after creating issues and before writing `STATUS.md`,
  so the monitors looked like they were reporting and the offline `issue_snapshot.json` the
  cadence guard reads was never produced at all. A test-only flag therefore takes the
  **production value as its `default=`** (`build_status.py` is the pattern), and the pin is two
  assertions, not one: the default is what production uses, **and** production still takes the
  default. This is §D of `docs/SILENT_SHRINK_CHECKLIST.md` in its cheapest disguise — the check
  never ran the path it claims to cover.

### Adding a step to `ci.yml` trips three separate contracts — [gate: bin/check-verify-coverage.py; 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py; 13_Faculty_Resources/_automation/test_validate_registry_schemas.py]
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
