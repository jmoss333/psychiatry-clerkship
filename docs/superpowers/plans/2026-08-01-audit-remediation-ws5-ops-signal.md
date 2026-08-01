# Ops Signal Restoration & Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the repo's operational signal — surveillance dedup, issue board, CI/publish-gate test coverage, Playwright baseline alignment — and clear verified working-tree/branch cruft.

**Architecture:** This workstream touches only automation and hygiene surfaces: the surveillance pipeline (`13_Faculty_Resources/_automation/surveillance/`), the two CI workflows, the Netlify publish gate (`build_and_check.sh`), the sp-interview test roster, and file/branch layout. No learner-facing page content changes; the one build-pipeline edit (OE audio source path) is a path flip plus a fail-closed guard.

**Tech Stack:** Python 3.11 (unittest, stdlib `tomllib`), Node 20 (`node:test`), bash, GitHub Actions, Playwright 1.61.1 (CI-only), Git LFS, `gh` CLI.

## Global Constraints

- **main is branch-protected (GH006 on direct push):** every change lands via feature branch + `gh pr create`; required checks: **build-test-validate + smoke**.
- **Playwright hangs locally on this macOS** — verify smoke via CI, not locally.
- **Visual baselines regenerate ONLY via the "Refresh visual baselines" workflow_dispatch** (Ubuntu/Chromium) — never on macOS.
- **Build gate:** `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` must pass (this IS the Netlify build command). Root tests: `node --test tests/*.test.mjs`.
- **Git LFS:** `*.mp3 *.m4a *.wav *.mp4` are LFS-tracked. Never commit LFS pointer stubs in place of real media. Batches 6–7 move/convert LFS content — run them from an **LFS-enabled environment** (local Claude Code / Desktop Commander; NOT a sandbox where the ~100 `.m4a` show as false "modified"). Preflight `git lfs version` before those batches.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.
- **New/renamed pages must be registered in site_manifest.json AND nav** or the orphan check hard-fails — none of this plan's moves touch shipped pages, but every batch runs the build gate to prove it.
- **Since #264, shared build logic lives in `13_Faculty_Resources/_automation/site_build/common.py`** — the OE-audio copy block, however, still lives in `build_deploy.py:120-142` (re-verified at tip 817ef90); edit it there.
- **Editing CLAUDE.md requires `cp CLAUDE.md AGENTS.md` in the same commit** — this plan does not edit CLAUDE.md; if any executor deviates and does, obey the parity rule.
- **No PHI anywhere.** All content touched here is automation/planning material.
- Work from a fresh worktree off current `origin/main` (`superpowers:using-git-worktrees`); one branch per PR boundary below. All paths are repo-relative unless absolute.

**Sequencing overview:** Batch 1 must merge **before Sunday 2026-08-03** (next weekly link-monitor run) to stop the duplicate-issue treadmill. Batch 8 (issue close-out) runs after Batch 1 merges. Batch 9 (branch sweep) is gated on WS1's `codex/faculty-attestation-streamline` push decision. Batches 2–3 edit `.github/workflows/ci.yml` — land them before draft PR #263 leaves draft (it must rebase last per the audit; do not wait for it). Batches 2 and 3 both touch ci.yml/adjacent files: land 2 then 3. Everything else is order-independent.

---

## Batch 1 — Surveillance dedup + self-crawl fix

### Task 1: Fix FP_RE dotted-fingerprint truncation (with regression tests)

The dedup read-back regex `FP_RE` omits `.` from its character class, so `link:www.samhsa.gov::broken-link::<sha16>` read back from an existing issue body truncates to `link:www`, never matches the full fingerprint, and the same finding re-files weekly (#211→#246→#265; #247/#248→#266/#267). Re-verified at tip: `lib_surveillance.py:118` unchanged.

**Files:**
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py:118`
- Test: `tests/maintenance/test_surveillance_maintenance.py` (existing CI-wired unittest file; it already does `import lib_surveillance as L` and `import sync_findings`)

**Interfaces:**
- Consumes: `L.FP_MARKER` / `L.FP_RE` (module constants), `sync_findings.normalize_issue_snapshot(items)`.
- Produces: `FP_RE` that round-trips any fingerprint containing dots; regression tests other tasks must keep green.

**Steps:**

- [ ] Add `import tomllib` to the imports of `tests/maintenance/test_surveillance_maintenance.py` (needed by Task 2's test; add both tests' imports once). Edit the import block at the top of the file:

```python
import importlib.util
import json
import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest import mock
```

- [ ] Insert the two regression tests into `tests/maintenance/test_surveillance_maintenance.py`, immediately BEFORE the line `    def test_issue_snapshot_normalization_excludes_pull_requests(self):` (currently line 342):

```python
    def test_fingerprint_marker_roundtrips_dotted_link_fingerprints(self):
        # Link-monitor fingerprints embed URL domains ('link:www.samhsa.gov::...').
        # A character class missing '.' truncated read-back to 'link:www', so the
        # same finding re-filed as a new issue every weekly run (#211/#246/#265).
        fingerprint = "link:www.samhsa.gov::broken-link::6bae3107ce29193b"
        body = L.FP_MARKER.format(fp=fingerprint)
        match = L.FP_RE.search(body)
        self.assertIsNotNone(match)
        self.assertEqual(match.group(1), fingerprint)

    def test_issue_snapshot_preserves_dotted_domain_fingerprints(self):
        raw = [
            {
                "number": 265,
                "html_url": "https://github.com/owner/repo/issues/265",
                "state": "open",
                "closed_at": None,
                "body": "<!-- surveillance:fp=link:www.samhsa.gov::broken-link::6bae3107ce29193b -->",
                "labels": [{"name": "surveillance"}],
            },
        ]
        snapshot = sync_findings.normalize_issue_snapshot(raw)
        self.assertEqual(
            [item["fingerprint"] for item in snapshot],
            ["link:www.samhsa.gov::broken-link::6bae3107ce29193b"],
        )
```

- [ ] Run the failing tests: `python3 -m unittest discover -s tests/maintenance -p 'test_surveillance_maintenance.py' -v 2>&1 | tail -15` — expect **2 FAILs**: `AssertionError: 'link:www' != 'link:www.samhsa.gov::broken-link::6bae3107ce29193b'` (both new tests).
- [ ] Fix the regex. In `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py:118` replace:

```python
FP_RE = re.compile(r"surveillance:fp=([A-Za-z0-9:_\-]+)")
```

with:

```python
FP_RE = re.compile(r"surveillance:fp=([A-Za-z0-9:._\-]+)")
```

- [ ] Re-run: `python3 -m unittest discover -s tests/maintenance -p 'test_surveillance_maintenance.py' 2>&1 | tail -3` — expect `OK` (the file's full suite; the Task 2 lychee test will still be absent at this point).
- [ ] Commit: `git add -A && git commit -m "fix(surveillance): FP_RE must not truncate dotted-domain fingerprints at read-back"`

### Task 2: Exclude the surveillance tree from its own link crawl

lychee crawls `./**/*.md` and finds broken URLs quoted inside surveillance's own committed reports (`STATUS.md`, `history/digest_2026-07.md`) — phantom findings-about-findings. Re-verified: `13_Faculty_Resources/_automation/surveillance/lychee.toml` `exclude_path` (lines 7–13) lacks the surveillance dir; the samhsa URL appears nowhere in curriculum.

**Files:**
- Modify: `13_Faculty_Resources/_automation/surveillance/lychee.toml:7-13`
- Test: `tests/maintenance/test_surveillance_maintenance.py` (same file as Task 1)

**Interfaces:**
- Consumes: `SURV` path constant already defined in the test file; stdlib `tomllib`.
- Produces: `exclude_path` containing `"13_Faculty_Resources/_automation/surveillance"` — consumed by the Link Monitor workflow's `--config` invocation.

**Steps:**

- [ ] Add the failing test, immediately after `test_issue_snapshot_preserves_dotted_domain_fingerprints` (added in Task 1):

```python
    def test_lychee_excludes_surveillance_generated_tree(self):
        config = tomllib.loads((SURV / "lychee.toml").read_text(encoding="utf-8"))
        self.assertIn(
            "13_Faculty_Resources/_automation/surveillance",
            config.get("exclude_path", []),
            "link monitor must not crawl its own committed reports "
            "(STATUS.md / history/) — that files phantom findings",
        )
```

- [ ] Run: `python3 -m unittest discover -s tests/maintenance -p 'test_surveillance_maintenance.py' -k lychee -v` — expect **FAIL**: `'13_Faculty_Resources/_automation/surveillance' not found in [...]`.
- [ ] Edit `13_Faculty_Resources/_automation/surveillance/lychee.toml`, replacing the exclude_path block:

```toml
exclude_path = [
  "00_START_HERE",
  "OPENEVIDENCE RAW FILES TO REVIEW",
  "_prototypes",
  "_build",
  "99_Archive",
]
```

with:

```toml
exclude_path = [
  "00_START_HERE",
  "OPENEVIDENCE RAW FILES TO REVIEW",
  "_prototypes",
  "_build",
  "99_Archive",
  # Never crawl the monitor's own committed reports (STATUS.md, history/) —
  # broken URLs quoted there are findings-about-findings, not curriculum defects.
  "13_Faculty_Resources/_automation/surveillance",
]
```

- [ ] Run: `python3 -m unittest discover -s tests/maintenance -p 'test_*.py' 2>&1 | tail -3` — expect `OK` (full maintenance suite, matching the CI step).
- [ ] Run the build gate to prove no collateral: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` — expect final line `── build_and_check: ms3 OK`.
- [ ] Commit: `git add -A && git commit -m "fix(surveillance): stop lychee crawling the surveillance tree's own committed reports"`

**PR boundary:** branch `fix/surveillance-dedup-selfcrawl`, PR title **"surveillance: fix dedup fingerprint truncation; stop crawling own reports"**. Required green: build-test-validate + smoke. **Merge before 2026-08-03** (next scheduled link-monitor run).

---

## Batch 2 — Publish-gate node suites + SP suite roster guard

### Task 3: Run the dependency-free node suites in the Netlify publish gate

Re-verified: `build_and_check.sh` (74 lines) runs six python validators + build + LFS preflight + static QA + search quality, but zero node suites. Measured at tip: `node --test tests/*.test.mjs` = 379 tests / 1.65 s; `node tests/contrast-check.mjs` = 0.02 s. Both are dependency-free (no npm install) and both currently pass.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh` (insert between the last validator, line ~38, and `case "$SITE" in`, line ~40)
- Test: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` (it already reads `BUILD_GATE` and asserts governance-before-`case` ordering at its "build and CI run governance validation before site builds" test — the new assertions follow that pattern)

**Interfaces:**
- Consumes: `BUILD_GATE` path constant (ci-build-contract.test.mjs:26-29), `$LIB` repo-root var in build_and_check.sh.
- Produces: publish gate that fails the deploy if any root node contract test or contrast token regresses — independent of GitHub Actions availability.

**Steps:**

- [ ] Add the failing contract test to `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`, immediately after the existing `test('run-all.sh keeps the review-filter suite wired', ...)` block (its closing `});` is currently at line 1003):

```js
// 2026-08 audit WS5: the publish gate must run the dependency-free node suites
// so a deploy performed during a GitHub Actions outage still runs contract tests
// (July 2026 billing-outage precedent). Heavier npm-dependent suites stay CI-only.
test('publish gate runs the dependency-free node suites before building', () => {
  const buildGate = fs.readFileSync(BUILD_GATE, 'utf8');
  assert.match(
    buildGate,
    /node --test "\$LIB"\/tests\/\*\.test\.mjs/,
    'build_and_check.sh must run the root node contract suite',
  );
  assert.match(
    buildGate,
    /node "\$LIB\/tests\/contrast-check\.mjs"/,
    'build_and_check.sh must run the WCAG contrast token check',
  );
  assert.ok(
    buildGate.indexOf('node --test') < buildGate.indexOf('case "$SITE" in'),
    'node suites must run before both build targets',
  );
});
```

- [ ] Run: `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | grep -A2 "publish gate runs"` — expect **FAIL**: `build_and_check.sh must run the root node contract suite`.
- [ ] Edit `13_Faculty_Resources/_automation/site_build/build_and_check.sh`, replacing:

```bash
python3 "$LIB/13_Faculty_Resources/_automation/validate_tool_governance.py"

case "$SITE" in
```

with:

```bash
python3 "$LIB/13_Faculty_Resources/_automation/validate_tool_governance.py"

# Node contract suites — the light half of an intentional heavy/light split.
# Dependency-free (no npm install) and fast (~2 s combined), so they run inside
# the Netlify publish gate as well as CI: deploy correctness must not depend on
# GitHub Actions availability (July 2026 billing-outage precedent). The heavier
# npm-dependent suites (sp-proxy, sp-interview run-all.sh, Playwright smoke)
# stay CI-only — see .github/workflows/ci.yml.
echo "── Node contract tests: tests/*.test.mjs"
node --test "$LIB"/tests/*.test.mjs
echo "── WCAG contrast tokens: tests/contrast-check.mjs"
node "$LIB/tests/contrast-check.mjs"

case "$SITE" in
```

- [ ] Run: `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | tail -5` — expect all tests pass (`# fail 0`).
- [ ] Full gate proof: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` — expect a passing QA report (0 hard failures; pass count grows as batches land) and final line `── build_and_check: ms3 OK`. Then `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` — expect `── build_and_check: res OK`.
- [ ] Commit: `git add -A && git commit -m "test(gate): run dependency-free node suites in the Netlify publish gate"`

### Task 4: Guard the full run-all.sh suite roster

Re-verified: `run-all.sh` hand-enumerates exactly 15 suites (equal to directory contents); the guard at ci-build-contract.test.mjs:992-1003 pins only `review-filter.test.mjs`. Deleting any other roster line, or adding a 16th test file without wiring it, stays green today.

**Files:**
- Modify/Test: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs` (append after Task 3's new test)

**Interfaces:**
- Consumes: `ROOT` constant (line 9), `fs.readdirSync`, `_prototypes/sp-interview/tests/run-all.sh` roster lines of the forms `node <file>` and `node --test <file>`.
- Produces: completeness invariant — every `*.test.mjs`/`*.test.js` in the tests dir must appear in run-all.sh.

**Steps:**

- [ ] Append after Task 3's test block:

```js
// 2026-08 audit WS5: run-all.sh is a hand-enumerated roster; this closes the
// other half of F26 — a suite file that exists but is not wired (or a deleted
// roster line) must fail CI for every suite, not just review-filter.
test('run-all.sh enumerates every SP Interview test suite', () => {
  const testsDir = path.join(ROOT, '_prototypes/sp-interview/tests');
  const runAll = fs.readFileSync(path.join(testsDir, 'run-all.sh'), 'utf8');
  const suites = fs
    .readdirSync(testsDir)
    .filter((name) => /\.test\.(mjs|js)$/.test(name))
    .sort();
  assert.ok(suites.length >= 15, 'suite census lost known suites — check testsDir');
  for (const suite of suites) {
    assert.ok(
      runAll.includes(`node ${suite}`) || runAll.includes(`node --test ${suite}`),
      `${suite} exists but run-all.sh never invokes it — add a roster line`,
    );
  }
});
```

- [ ] Run: `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | tail -5` — expect pass (roster is currently complete; this test is a guard, so prove its teeth next).
- [ ] Teeth check (temporary mutation, then revert):

```bash
sed -i '' '/harness-exit.test.mjs/d' _prototypes/sp-interview/tests/run-all.sh
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | grep "harness-exit"
# expect: "harness-exit.test.mjs exists but run-all.sh never invokes it — add a roster line"
git checkout -- _prototypes/sp-interview/tests/run-all.sh
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | tail -3   # expect fail 0
```

- [ ] Commit: `git add -A && git commit -m "test(sp-interview): assert every suite file is wired into run-all.sh"`

**PR boundary:** branch `test/publish-gate-node-suites`, PR title **"test: run node contract suites in the publish gate; guard the SP suite roster"**. Required green: build-test-validate + smoke.

---

## Batch 3 — Governed Anki suite + faculty export tool suites into CI

### Task 5: Wire the governed Anki pytest suite into build-test-validate

Re-verified: zero `anki` matches across `.github/workflows/`; `tests/anki/` has 13 pytest files; `build_anki.sh` is fail-soft by design (`|| true` in the gate, committed `.apkg` fallback); the ready-to-paste YAML lives in `13_Faculty_Resources/_automation/anki/CI_INTEGRATION.md:20-38`; `requirements.lock` pins `pytest==9.1.1` (line 352), so the venv has its own runner. ci.yml already pins Python 3.11 (`setup-python`, line ~37-39), so `python3` is 3.11 in the job.

**Files:**
- Modify: `.github/workflows/ci.yml` (insert after the `Validate — tool governance` step, before `actions/setup-node`)
- Modify: `13_Faculty_Resources/_automation/anki/CI_INTEGRATION.md` (flip status from deferred to active)

**Interfaces:**
- Consumes: `13_Faculty_Resources/_automation/anki/requirements.lock` (hash-pinned), `tests/anki/` suite, gitignored `_build/` for the venv.
- Produces: CI steps named `Install — governed Anki environment` and `Unit — pcl_anki governed release tests (excludes anki-library tests)`. Placement before `actions/setup-node` keeps the sp-interview `MANAGED_GATE_ORDER` contract (ci-build-contract.test.mjs:303-312) intact.

**Steps:**

- [ ] Local pre-verification (proves the suite is green before wiring; run_python.sh auto-creates a CPython 3.11 venv keyed to requirements.lock):

```bash
cd 13_Faculty_Resources/_automation/anki
bash run_python.sh -m pytest ../../../tests/anki/ --ignore=../../../tests/anki/test_render.py --ignore=../../../tests/anki/test_migration.py --ignore=../../../tests/anki/test_identity.py -q
cd -
```

Expect: `passed` summary, exit 0. If this fails, STOP — fix the suite before wiring (do not wire a red suite).
- [ ] Edit `.github/workflows/ci.yml`, replacing:

```yaml
      - name: Validate — tool governance
        run: python3 13_Faculty_Resources/_automation/validate_tool_governance.py

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
```

with:

```yaml
      - name: Validate — tool governance
        run: python3 13_Faculty_Resources/_automation/validate_tool_governance.py

      - name: Install — governed Anki environment
        run: |
          python3 -m venv _build/anki-venv
          _build/anki-venv/bin/pip install \
            --disable-pip-version-check \
            --require-hashes \
            --requirement 13_Faculty_Resources/_automation/anki/requirements.lock

      - name: Unit — pcl_anki governed release tests (excludes anki-library tests)
        run: |
          _build/anki-venv/bin/python -m pytest tests/anki/ \
            --ignore=tests/anki/test_render.py \
            --ignore=tests/anki/test_migration.py \
            --ignore=tests/anki/test_identity.py \
            -q

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
```

- [ ] Contract-test the ci.yml edit locally: `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | tail -3` — expect `# fail 0` (managed-gate order preserved; no `|| true` introduced).
- [ ] Update `13_Faculty_Resources/_automation/anki/CI_INTEGRATION.md`: replace the heading line `## pcl_anki pytest suite (deferred — requires anki==26.5 + genanki)` with `## pcl_anki pytest suite (ACTIVE in CI since 2026-08 — requires anki==26.5 + genanki)` and replace the line `**To add when ready:**` with `**Wired into .github/workflows/ci.yml (build-test-validate job):**`.
- [ ] Commit: `git add -A && git commit -m "ci: run the governed Anki pytest suite (venv + require-hashes) in build-test-validate"`

### Task 6: Wire the three tools/ export test suites into CI

Re-verified: no workflow references the three suites; `tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py` is stdlib-only and passes locally today; the other two need `pypdf` + `reportlab` (absent from `requirements.txt`); all three are self-contained runners (`sys.exit(run_tests())`) and `package_data.py` self-inserts the repo root on sys.path. The pdf_library artifact ships (PDF handout library), so the CI step is the right choice over README-only documentation.

**Files:**
- Create: `requirements-dev.txt` (repo root)
- Modify: `.github/workflows/ci.yml` (insert after Task 5's Anki steps, before `actions/setup-node`)

**Interfaces:**
- Consumes: `tools/{adobe_packet_export,faculty_polish_export,pdf_library_export}/test_*.py` self-runners.
- Produces: `requirements-dev.txt` (name consumed by the ci.yml step and by future dev docs); CI step `Unit — faculty export tools (adobe packet, faculty polish, pdf library)`.

**Steps:**

- [ ] Create `requirements-dev.txt`:

```
# Dev/CI-only dependencies for the faculty export tool suites (tools/*).
# Not needed by the Netlify build or the runtime site — keep out of requirements.txt.
pypdf==6.14.2
reportlab==5.0.0
```

- [ ] Local verification in a scratch venv (proves the pins and the suites):

```bash
python3 -m venv /tmp/ws5-tools-venv
/tmp/ws5-tools-venv/bin/pip install --quiet --requirement requirements-dev.txt
/tmp/ws5-tools-venv/bin/python tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
/tmp/ws5-tools-venv/bin/python tools/faculty_polish_export/test_export_top10_faculty_polish.py
/tmp/ws5-tools-venv/bin/python tools/pdf_library_export/test_export_website_pdf_library.py
```

Expect: `PASS: ...` lines and exit 0 from each. If a pin is incompatible, adjust the version in `requirements-dev.txt` to the newest that passes and note it in the commit body.
- [ ] Edit `.github/workflows/ci.yml`, replacing (the tail of Task 5's insertion):

```yaml
            --ignore=tests/anki/test_identity.py \
            -q

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
```

with:

```yaml
            --ignore=tests/anki/test_identity.py \
            -q

      - name: Install — faculty export tool dependencies
        run: python3 -m pip install --requirement requirements-dev.txt

      - name: Unit — faculty export tools (adobe packet, faculty polish, pdf library)
        run: |
          python3 tools/adobe_packet_export/test_export_ms3_adobe_packet_data.py
          python3 tools/faculty_polish_export/test_export_top10_faculty_polish.py
          python3 tools/pdf_library_export/test_export_website_pdf_library.py

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
```

- [ ] Re-run the contract test: `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | tail -3` — expect `# fail 0`.
- [ ] Commit: `git add -A && git commit -m "ci: run the three faculty export tool suites with pinned dev deps"`

**PR boundary:** branch `ci/governed-python-suites`, PR title **"ci: wire governed Anki suite and faculty export tool suites into build-test-validate"**. Required green: build-test-validate + smoke (the PR's own CI run is the real proof for both new steps).

---

## Batch 4 — Playwright 1.61.1 alignment (baselines, cache keys, docs)

### Task 7: Derive browser-cache keys from the lockfile; update README container pins

Re-verified at tip: `@playwright/test` is `1.61.1` (bumped by #250, 2026-07-21); baselines last regenerated 2026-07-11 (commit 4db5b9e — before the bump); cache key `playwright-1.46.1-${{ runner.os }}` now at **ci.yml:157** (drifted from the audit's :154) and refresh-baselines.yml:50; README pins `v1.46.1-jammy` at tests/smoke/README.md:81, 87, 102.

**Files:**
- Modify: `.github/workflows/ci.yml:157`, `.github/workflows/refresh-baselines.yml:50`, `tests/smoke/README.md:81,87,102,122-126`

**Interfaces:**
- Consumes: `tests/smoke/package-lock.json` (exists; hash input).
- Produces: cache key expression `playwright-${{ hashFiles('tests/smoke/package-lock.json') }}-${{ runner.os }}` used identically in both workflows.

**Steps:**

- [ ] In `.github/workflows/ci.yml`, replace:

```yaml
          path: ~/.cache/ms-playwright
          key: playwright-1.46.1-${{ runner.os }}
```

with:

```yaml
          path: ~/.cache/ms-playwright
          # Key derives from the smoke lockfile so a Playwright bump rolls the
          # cache automatically (a hand-pinned version went permanently stale
          # after the 1.46.1→1.61.1 bump). Keep in sync with refresh-baselines.yml.
          key: playwright-${{ hashFiles('tests/smoke/package-lock.json') }}-${{ runner.os }}
```

- [ ] In `.github/workflows/refresh-baselines.yml`, replace:

```yaml
          path: ~/.cache/ms-playwright
          key: playwright-1.46.1-${{ runner.os }}
```

with:

```yaml
          path: ~/.cache/ms-playwright
          # Same derived key as ci.yml — a Playwright bump rolls both caches.
          key: playwright-${{ hashFiles('tests/smoke/package-lock.json') }}-${{ runner.os }}
```

- [ ] In `tests/smoke/README.md`, replace all three occurrences of `v1.46.1-jammy` with `v1.61.1-jammy` (`sed -i '' 's/v1\.46\.1-jammy/v1.61.1-jammy/g' tests/smoke/README.md`), then append this bullet to the "When to refresh baselines" list (after the existing `**Never** commit baselines generated on a laptop...` bullet):

```markdown
- The container tag above must match the `@playwright/test` version in `tests/smoke/package.json`; the CI browser-cache keys need no edit — they derive from `package-lock.json` via `hashFiles`.
```

- [ ] Verify no stale pin remains: `grep -rn "1\.46\.1" .github/workflows/ tests/smoke/ | grep -v package-lock` — expect **no output**.
- [ ] Run the workflow contract tests: `python3 -m unittest discover -s tests/maintenance -p 'test_*.py' 2>&1 | tail -3` — expect `OK`; and `node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs 2>&1 | tail -3` — expect `# fail 0`.
- [ ] Commit: `git add -A && git commit -m "chore(smoke): derive Playwright cache keys from lockfile; update container docs to 1.61.1"`
- [ ] Push the branch now (the refresh workflow must target it): `git push -u origin chore/playwright-161-alignment`

### Task 8: Regenerate visual baselines under Chromium 1.61 (workflow_dispatch)

The refresh workflow builds both sites, runs `--update-snapshots` on Ubuntu/Chromium, and **commits the PNGs back to the dispatched branch** (never dispatch against protected `main`). Baselines: `tests/smoke/baseline/{sidebar-desktop,sidebar-mobile,topic-desktop,topic-mobile}.png`.

**Files:**
- Modify (by the workflow, not by hand): `tests/smoke/baseline/*.png`

**Steps:**

- [ ] Dispatch on the feature branch:

```bash
gh workflow run "Refresh visual baselines" --ref chore/playwright-161-alignment
sleep 30
run_id=$(gh run list --workflow=refresh-baselines.yml --branch chore/playwright-161-alignment --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --exit-status
```

Expect: run concludes `success`.
- [ ] Pull the workflow's commit and inspect: `git pull origin chore/playwright-161-alignment && git log -1 --stat -- tests/smoke/baseline/` — expect a fresh commit touching up to 4 PNGs. (If the workflow committed nothing, Chromium 1.61 rendered pixel-identically within threshold — acceptable; note it in the PR body and proceed.)
- [ ] Open the PR; the smoke job's `--project=visual` run against the new baselines is the verification (do NOT run Playwright locally — it hangs on this macOS).

**PR boundary:** branch `chore/playwright-161-alignment`, PR title **"chore(smoke): align visual baselines, cache keys, and docs with Playwright 1.61.1"**. Required green: build-test-validate + smoke (visual project validates the regenerated baselines).

---

## Batch 5 — Root planning-doc relocation

### Task 9: Move 20 stale root docs to sanctioned homes; update inbound links

Re-verified at tip: 26 root `.md` files. **Premise correction:** the three `QUESTION_BANK_*` docs are NOT stale planning artifacts — they are live governance contracts referenced from `question_bank.json` `_note`, `question_bank.schema.json` description, `crosswalk_apply.py:27`, `13_Faculty_Resources/CROSSWALK_TAXONOMY.md:13,29`, and `09_Exam_Prep/shelf_comat_bank/03_ITEM_WRITING_REVIEW_RUBRIC.md:4,175` — they STAY at root beside the data files they govern. Move set is therefore 20 files. Inbound links needing updates (verified by grep): `README.md:11,13`, root `index.html:55`, `01_Six_Week_Curriculum/README.md:2`, `07_Evidence_and_Reading/Reading_Pathway_6wk/README.md:3`. The Handoffs ledger's `_QA_REPORT.md` mention (MASTER_attestation_ledger_2026-07-01.md:6) is historical narrative — update the path in place.

**Files:**
- Create: `99_Archive/root-planning-2026-07/README.md`
- Move (17 → `99_Archive/root-planning-2026-07/`): `CLERKSHIPOS_BACKLOG_2026-07.md`, `CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md`, `Design-Plan-Alignment-and-Video_2026-07-02.md`, `FABLE_PLATFORM_AUDIT_2026-07-15.md`, `FINALIZATION_PLAN.md`, `FIXES_APPLIED.md`, `MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md`, `MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md`, `MS3-Psychiatry-Site_Multidisciplinary-Audit_2026-06-28.md`, `QBANK_AUDIT_2026-07.md`, `_CODEX_AUDIT_INTEGRATION.md`, `_DEDUPE_REPORT.md`, `_DESIGN_HANDOFF_PROMPT.md`, `_FILL_MAP.md`, `_QA_REPORT.md`, `_REMEDIATION_LOG_2026-06-27.md`, `_SESSION_HANDOFF_2026-06-26.md`
- Move (1 → `docs/superpowers/plans/`): `_AUDIT_AND_ROADMAP.md`
- Move (2 → `docs/superpowers/specs/`): `_PLATFORM_ARCHITECTURE_ClerkshipOS.md`, `SP-Interview_LLM-Standardized-Patient_DESIGN_2026-07-12.md`
- Modify: `README.md:11,13`, `index.html:55`, `01_Six_Week_Curriculum/README.md:2`, `07_Evidence_and_Reading/Reading_Pathway_6wk/README.md:3`, `13_Faculty_Resources/Handoffs/MASTER_attestation_ledger_2026-07-01.md:6`
- Keep at root: `README.md`, `CLAUDE.md`, `AGENTS.md`, `QUESTION_BANK_BLUEPRINT.md`, `QUESTION_BANK_STANDARD.md`, `QUESTION_BANK_EXECUTION_BRIEF.md`

**Interfaces:**
- Produces: root holds exactly 6 `.md` files; archived docs indexed with supersession notes; filenames preserved for grep-ability.

**Steps:**

- [ ] Perform the moves:

```bash
mkdir -p 99_Archive/root-planning-2026-07
git mv CLERKSHIPOS_BACKLOG_2026-07.md CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md \
  Design-Plan-Alignment-and-Video_2026-07-02.md FABLE_PLATFORM_AUDIT_2026-07-15.md \
  FINALIZATION_PLAN.md FIXES_APPLIED.md \
  MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md \
  MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md \
  MS3-Psychiatry-Site_Multidisciplinary-Audit_2026-06-28.md \
  QBANK_AUDIT_2026-07.md _CODEX_AUDIT_INTEGRATION.md _DEDUPE_REPORT.md \
  _DESIGN_HANDOFF_PROMPT.md _FILL_MAP.md _QA_REPORT.md \
  _REMEDIATION_LOG_2026-06-27.md _SESSION_HANDOFF_2026-06-26.md \
  99_Archive/root-planning-2026-07/
git mv _AUDIT_AND_ROADMAP.md docs/superpowers/plans/_AUDIT_AND_ROADMAP.md
git mv _PLATFORM_ARCHITECTURE_ClerkshipOS.md docs/superpowers/specs/_PLATFORM_ARCHITECTURE_ClerkshipOS.md
git mv SP-Interview_LLM-Standardized-Patient_DESIGN_2026-07-12.md docs/superpowers/specs/SP-Interview_LLM-Standardized-Patient_DESIGN_2026-07-12.md
```

- [ ] Create `99_Archive/root-planning-2026-07/README.md`:

```markdown
# Archived root planning docs (moved 2026-08, WS5 audit remediation)

Dated planning/audit/QA/handoff artifacts that lived at repo root, June–July 2026.
All are superseded by merged PRs and kept verbatim for provenance (filenames
unchanged for grep-ability). Live design docs moved to `docs/superpowers/{plans,specs}/`;
live qbank governance (`QUESTION_BANK_*.md`) stayed at root beside `question_bank.json`.

| File | Was | Superseded by |
|---|---|---|
| CLERKSHIPOS_BACKLOG_2026-07.md | July platform backlog | items landed via the July PR train (#122–#279); residuals tracked in the 2026-08-01 audit remediation plans |
| CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md | July-02 audit backlog | same |
| Design-Plan-Alignment-and-Video_2026-07-02.md | design/video alignment note | orientation video shipped |
| FABLE_PLATFORM_AUDIT_2026-07-15.md | 10-part platform audit | items closed via #234/#256 et al.; remainder in 2026-08-01 audit |
| FINALIZATION_PLAN.md | launch finalization plan | launch complete; media manifest work tracked separately |
| FIXES_APPLIED.md | July-05 fix log | history |
| MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md | resident feature specs | resident site shipped |
| MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md | resident roadmap | resident site shipped |
| MS3-Psychiatry-Site_Multidisciplinary-Audit_2026-06-28.md | June MS3 audit | fixes landed July |
| QBANK_AUDIT_2026-07.md | qbank audit | attestation gate landed (#256/#284) |
| _CODEX_AUDIT_INTEGRATION.md | Codex audit merge log | history |
| _DEDUPE_REPORT.md | content dedupe report | history |
| _DESIGN_HANDOFF_PROMPT.md | design handoff prompt | history |
| _FILL_MAP.md | content fill map | curriculum complete |
| _QA_REPORT.md | June-26 QA table | superseded by 13_Faculty_Resources/Handoffs/MASTER_attestation_ledger_2026-07-01.md |
| _REMEDIATION_LOG_2026-06-27.md | June remediation log | history |
| _SESSION_HANDOFF_2026-06-26.md | June session handoff | history |
```

- [ ] Update the five inbound references (exact replacements):
  - `README.md:11`: replace `` - `_AUDIT_AND_ROADMAP.md` — `` with `` - `docs/superpowers/plans/_AUDIT_AND_ROADMAP.md` — `` (keep the rest of the line).
  - `README.md:13`: replace `` - `_CODEX_AUDIT_INTEGRATION.md` — `` with `` - `99_Archive/root-planning-2026-07/_CODEX_AUDIT_INTEGRATION.md` — `` (keep the rest of the line).
  - `index.html:55`: replace `href="_AUDIT_AND_ROADMAP.md"` with `href="docs/superpowers/plans/_AUDIT_AND_ROADMAP.md"`.
  - `01_Six_Week_Curriculum/README.md:2`: replace `` `_AUDIT_AND_ROADMAP.md §6` `` with `` `docs/superpowers/plans/_AUDIT_AND_ROADMAP.md §6` ``.
  - `07_Evidence_and_Reading/Reading_Pathway_6wk/README.md:3`: replace `` `_AUDIT_AND_ROADMAP.md` §6 `` with `` `docs/superpowers/plans/_AUDIT_AND_ROADMAP.md` §6 ``.
  - `13_Faculty_Resources/Handoffs/MASTER_attestation_ledger_2026-07-01.md:6`: replace `` `_QA_REPORT.md` (June 26 per-file table, still blank) `` with `` `_QA_REPORT.md` (June 26 per-file table, still blank; now archived at 99_Archive/root-planning-2026-07/) ``.
- [ ] Verify no dangling root-relative links remain: `grep -rn --include="*.md" --include="*.html" --exclude-dir=_build --exclude-dir=.git --exclude-dir=99_Archive --exclude-dir=docs -E '\]\(_AUDIT_AND_ROADMAP|\(_CODEX_AUDIT|href="_AUDIT' . ` — expect **no output**. Then `ls *.md` — expect exactly: `AGENTS.md CLAUDE.md QUESTION_BANK_BLUEPRINT.md QUESTION_BANK_EXECUTION_BRIEF.md QUESTION_BANK_STANDARD.md README.md`.
- [ ] Run gates: `node --test tests/*.test.mjs` (expect 0 failures; 379 pass at plan time) and `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` (expect `── build_and_check: ms3 OK`).
- [ ] Commit: `git add -A && git commit -m "chore: relocate stale root planning docs to docs/superpowers and 99_Archive"`

**PR boundary:** branch `chore/root-doc-relocation`, PR title **"chore: relocate 20 stale root planning docs (repo-hygiene half of #108)"** — include `Part of #108` in the body (the issue closes via Batch 8 after both hygiene PRs land). Required green: build-test-validate + smoke.

---

## Batch 6 — Working-tree cruft (orphans, .apkg tracking, surveillance history)

Run from an **LFS-enabled environment** (preflight: `git lfs version` prints a version).

### Task 10: Delete quick-wins/ and the notebooklm snapshot

Re-verified at tip: `quick-wins/` (3 files: `dark-mode.css`, `differential-decision-trees.html`, `vignettes.html`) has zero references from any `.py/.mjs/.json/.yml/.html` outside archived planning docs; its dark-mode.css is superseded by the shipped dark mode. `00_START_HERE/notebooklm_upload_2026-07-01/` (3.7 M, 22 tracked files) is a point-in-time curriculum duplicate; `run_citation_check.py:41` SKIPS the `00_START_HERE/notebooklm_upload_` prefix (deleting the dir cannot break surveillance — the skip-prefix matches nothing, harmlessly).

**Files:**
- Delete: `quick-wins/` (whole dir), `00_START_HERE/notebooklm_upload_2026-07-01/` (whole dir)

**Steps:**

- [ ] Re-verify zero live references (the audit's check, repeated at execution time):

```bash
grep -rn "quick-wins" --include="*.py" --include="*.mjs" --include="*.json" --include="*.yml" --include="*.html" --exclude-dir=_build --exclude-dir=.git . 
```

Expect **no output** (doc mentions live only in `.md` planning files already archived by Batch 5). If anything surfaces, STOP and re-scope.
- [ ] `git rm -r quick-wins 00_START_HERE/notebooklm_upload_2026-07-01`
- [ ] Run gates: `node --test tests/*.test.mjs` (0 failures) and `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` (`── build_and_check: ms3 OK`).
- [ ] Commit: `git add -A && git commit -m "chore: remove quick-wins orphans and the 2026-07-01 notebooklm snapshot"`

### Task 11: LFS-track the generated .apkg deck exports

**Premise correction (re-verified):** the committed `.apkg` files CANNOT be gitignored — `build_anki.sh` is fail-soft and Netlify (no genanki) stages the **committed** `.apkg` from `09_Exam_Prep/anki_export/` into `$OUT/anki/` for learner download. LFS-tracking is the correct option. This requires the Netlify LFS fetch-include to cover `*.apkg` — a [JOSH] dashboard step, done BEFORE merge.

**Files:**
- Modify: `.gitattributes`, `09_Exam_Prep/anki_export/*.apkg` (3 files, converted to LFS pointers in-index)

**Steps:**

- [ ] **[JOSH]** In the Netlify dashboard (per tool-routing memory: use the dashboard via Chrome, NOT the Cowork Netlify MCP — wrong account), for **both** sites `une-ms3-psychiatry` and `mmc-psychiatry-residents-sanford`: Site configuration → Environment variables → edit `GIT_LFS_FETCH_INCLUDE` from `*.m4a,*.mp4` to `*.m4a,*.mp4,*.apkg`. (Adding the pattern before the code lands is harmless.) Confirm done before proceeding.
- [ ] Append to `.gitattributes` (after the existing LFS block):

```
# Generated Anki decks: versioned binaries the Netlify build stages as the
# fail-soft fallback (build_anki.sh). LFS keeps regeneration churn out of git
# history. Netlify: GIT_LFS_FETCH_INCLUDE must include *.apkg on both sites.
*.apkg filter=lfs diff=lfs merge=lfs -text
```

- [ ] Convert the tracked files: `git add .gitattributes && git add --renormalize 09_Exam_Prep/anki_export`
- [ ] Verify the index holds pointers, not blobs: `git lfs ls-files | grep -c apkg` — expect `3`; and `git show :09_Exam_Prep/anki_export/psychiatry_clerkship_library.apkg | head -1` — expect `version https://git-lfs.github.com/spec/v1`.
- [ ] Run the build gate (proves the decks still stage): `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 2>&1 | grep anki` — expect `[anki] staged 3 deck(s) → .../anki/`.
- [ ] Commit: `git add -A && git commit -m "chore(lfs): track generated .apkg deck exports with Git LFS"`
- [ ] After the PR opens: verify the deploy preview serves real bytes, not stubs: `curl -sI "https://deploy-preview-<PR>--une-ms3-psychiatry.netlify.app/anki/psychiatry_clerkship_library.apkg" | grep -i content-length` — expect a value **> 100000**. If it is ~133, the Netlify fetch-include step was missed — fix before merge.

### Task 12: Prune legacy dated surveillance link audits from main

Re-verified: 8 dated `link_audit_2026-07-{03,06,08,13}.{json,csv}` files are tracked on main (~1.3 M with the rest of history/), but since the report-branch design the weekly workflow publishes dated reports to the `automation/surveillance-inbox` branch and uploads 90-day artifacts — nothing commits them to main anymore (last committed set: 07-13). **Do NOT add a .gitignore rule:** `report_branch.py:197` stages `history/` with plain `git add` (no `-f`), so an ignore rule would silently drop dated audits from the inbox branch. Plain `git rm` of the legacy files is the whole fix.

**Files:**
- Delete (from index and disk): `13_Faculty_Resources/_automation/surveillance/history/link_audit_2026-07-03.{json,csv}`, `...-06.{json,csv}`, `...-08.{json,csv}`, `...-13.{json,csv}`
- Create: `13_Faculty_Resources/_automation/surveillance/history/README.md`
- Keep tracked: `history/baselines/`, `history/digest_2026-07.md`, `history/guideline_delta_2026-07-04.json`, `history/last_run.json`

**Steps:**

- [ ] `git rm 13_Faculty_Resources/_automation/surveillance/history/link_audit_2026-07-0*.json 13_Faculty_Resources/_automation/surveillance/history/link_audit_2026-07-0*.csv 13_Faculty_Resources/_automation/surveillance/history/link_audit_2026-07-13.json 13_Faculty_Resources/_automation/surveillance/history/link_audit_2026-07-13.csv`
- [ ] Create `13_Faculty_Resources/_automation/surveillance/history/README.md`:

```markdown
# Surveillance history — retention policy

Committed on main: `baselines/` (guideline content hashes), the monthly
`digest_YYYY-MM.md`, `guideline_delta_*.json`, and `last_run.json`.

Dated per-run reports (`link_audit_YYYY-MM-DD.{json,csv}`) are NOT tracked on
main. Each weekly run writes them into this directory at runtime, publishes them
to the `automation/surveillance-inbox` branch (report_branch.py), and uploads
them as workflow artifacts (90-day retention). Do not re-commit them here, and
do not gitignore them either — report_branch.py stages this directory without
`-f`, so an ignore rule would silently drop them from the inbox branch.
```

- [ ] Run the surveillance test suite: `python3 -m unittest discover -s tests/maintenance -p 'test_*.py' 2>&1 | tail -3` — expect `OK`.
- [ ] Commit: `git add -A && git commit -m "chore(surveillance): stop tracking dated link audits on main; document retention"`

**PR boundary:** branch `chore/working-tree-cruft`, PR title **"chore: remove orphaned snapshots, LFS-track anki exports, prune surveillance history"** — include `Part of #108` in the body. Required green: build-test-validate + smoke, PLUS the Task 11 deploy-preview content-length check.

---

## Batch 7 — Relocate OE NotebookLM audio out of Handoffs/ (own PR: 163 MB LFS move)

### Task 13: Move the audio to 12_Media/audio_oe/ with a fail-closed build guard

Re-verified at tip: the build reference is `build_deploy.py:122` (`_oedir=...Handoffs/openevidence_notebooklm_brief_audio_2026-06-30`; block spans 120–142 — post-#264 it did NOT move to common.py). The dir holds 50 `.m4a` (163 M, LFS) + `MANIFEST.csv` + `README.md` + `HANDOFF_FOR_CLAUDE_COWORK.md`. The block is currently **fail-open** (`if os.path.isdir(_oedir)...` with no else): a wrong path would silently ship zero audio — exactly why the audit flagged the inbox-sounding "Handoffs" path as a deletion hazard. `media_manifest.json` references built `audio_oe/...` output paths only (unaffected). Doc references to update: `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md:92,104`. `.gitattributes` `*.m4a` is glob-wide, so LFS tracking survives the move.

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py:122` (+ new `else` after line 142), `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md:92,104`, `12_Media/README.md` (append)
- Move: `13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30/` → `12_Media/audio_oe/` (53 files)

**Interfaces:**
- Consumes: `_abort_missing(missing)` helper (build_deploy.py:28) — the repo's hard-fail convention for required assets.
- Produces: source path `12_Media/audio_oe/` with `MANIFEST.csv` contract unchanged; built output stays `$OUT/audio_oe/` (learner URLs unchanged).

**Steps:**

- [ ] Preflight LFS reality (NOT in a sandbox): `git lfs version && head -c 24 "13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30/OE-01_Anthony_s_Recovery_Model_Beyond_Symptom_Remission__Meaningful_recovery_beyond_the_clinical_checklist.m4a" | grep -c "version https" || echo REAL_BYTES` — expect `REAL_BYTES` (a pointer stub here means wrong environment; STOP).
- [ ] **Red first — make the block fail-closed at the NEW path before moving files.** In `build_deploy.py` replace:

```python
_oedir=LIB+"/13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30"
```

with:

```python
# OE NotebookLM brief audio is a hard deploy input (live /audio_oe/ media).
# Fail closed below: a moved or missing source dir must abort the build, not
# silently ship a site with no OE audio (the pre-2026-08 Handoffs/ path was
# nearly deleted as stale precisely because this block used to skip silently).
_oedir=LIB+"/12_Media/audio_oe"
```

and replace (the block's final line, currently 142):

```python
    print("OE audio: copied",len(_oemap),"files | deck-aligned",_na,"quiz decks")
```

with:

```python
    print("OE audio: copied",len(_oemap),"files | deck-aligned",_na,"quiz decks")
else:
    _abort_missing([_oedir+"/MANIFEST.csv"])
```

- [ ] Run the build — expect the guard to fire (files not moved yet): `OUT_DIR=_build/ms3 python3 13_Faculty_Resources/_automation/site_build/build_deploy.py 2>&1 | tail -3` — expect `BUILD ABORTED — 1 required source asset(s) missing:` with `12_Media/audio_oe/MANIFEST.csv`, exit 1.
- [ ] **Green — move the files:** `git mv "13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30" 12_Media/audio_oe`
- [ ] Re-run: `OUT_DIR=_build/ms3 python3 13_Faculty_Resources/_automation/site_build/build_deploy.py 2>&1 | grep "OE audio"` — expect `OE audio: copied 50 files | deck-aligned 50 quiz decks` (the copied count must be **50**; the deck-aligned count must match its pre-move value — capture it before the move if in doubt).
- [ ] Verify LFS pointers moved intact: `git lfs ls-files | grep -c "12_Media/audio_oe" ` — expect `50`; and `ls _build/ms3/audio_oe | wc -l` — expect `50`.
- [ ] Update `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`: at line 92 replace `` (`…/openevidence_notebooklm_brief_audio_2026-06-30/`) `` with `` (`12_Media/audio_oe/`) ``; at line 104 replace `        13_Faculty_Resources/Handoffs/openevidence_notebooklm_brief_audio_2026-06-30` with `        12_Media/audio_oe`.
- [ ] Append to `12_Media/README.md`:

```markdown

## audio_oe/

50 OpenEvidence NotebookLM landmark-trial brief recordings (`.m4a`, Git LFS) +
`MANIFEST.csv`. **Hard deploy input**: `site_build/build_deploy.py` copies these
to `/audio_oe/` on both sites and deck-aligns them into `quizzes.json`; a
missing dir or MANIFEST aborts the build. Moved here 2026-08 from
`13_Faculty_Resources/Handoffs/` (an inbox-sounding path for a deploy dependency).
```

- [ ] Full gates: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` — expect both `OK`; `node --test tests/*.test.mjs` — expect 0 failures.
- [ ] Commit: `git add -A && git commit -m "media: relocate OE NotebookLM audio to 12_Media/audio_oe with fail-closed build guard"`
- [ ] PR body must note: **Netlify will re-fetch the 50 LFS objects at the new paths on the next deploy.** After merge, verify live: `curl -sI "https://une-ms3-psychiatry.netlify.app/audio_oe/OE-01_Anthony_s_Recovery_Model_Beyond_Symptom_Remission__Meaningful_recovery_beyond_the_clinical_checklist.m4a" | grep -i content-length` — expect multi-MB. If a stub ships, **[JOSH]** trigger "Deploy without cache" from the Netlify dashboard for the affected site (the only UI that forces a fresh LFS re-fetch).

**PR boundary:** branch `media/relocate-oe-audio`, PR title **"media: relocate OE NotebookLM audio to 12_Media/audio_oe (LFS move, fail-closed guard)"**. Required green: build-test-validate + smoke (the LFS integrity smoke project covers the moved media). Land before or after #263 indifferently — the `build_deploy.py` hunk is 4 lines; whichever lands second rebases trivially.

---

## Batch 8 — Issue-board close-out (no PR; gh CLI batch)

### Task 14: **[JOSH]** Approve, then execute, the issue close-out batch

**Gate:** run only after (a) Josh approves this batch (it is his tracker) and (b) Batch 1 has merged (so closed dupes cannot re-file on 2026-08-03). All evidence below re-verified at tip 817ef90 on 2026-08-01. New since the audit: #282 (clozapine content-change — a **genuine** guideline finding, NOT a duplicate; leave open for faculty review) and #285 (monthly maintenance review; leave open). **Premise correction:** both FDA URLs (drug-safety-communications and the clozapine-REMS announcement) return HTTP 200 again as of 2026-08-01, and the clozapine URL no longer appears in any curriculum page (only `evidence_registry.json` + surveillance config) — so no re-citing edit is needed anywhere; `source_registry.yaml` stays as-is and STATUS.md regenerates itself on the next run.

**[JOSH] approval step:** review the command list below (5 min). Everything else in this task is agent-executable verbatim.

**Steps:**

- [ ] Re-verify the two URL claims immediately before running (they gate the #212 comment): `curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0" "https://www.fda.gov/drugs/drug-safety-communications/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine"` — expect `200`. If not 200, change the #212 comment to note the URL is still down and that re-citing belongs to the content workstream; still close it as a duplicate-of-#267 tracking-wise.
- [ ] Close the fixed July-04 audit issues (#98–#107), one evidence comment each:

```bash
gh issue close 98 --comment "Closing — fixed on main: CI lints every tracked .py for hard-coded /Users|/sessions paths (.github/workflows/ci.yml, step 'Lint — no hard-coded machine paths in tracked Python'). Only remaining /Users literals are test-assertion fixtures at tools/evidence_registry/test_registry.py:2161,2335, which the lint pattern intentionally does not match. Verified in the 2026-08-01 audit."
gh issue close 99 --comment "Closing — landed via PR #122: .github/workflows/ci.yml runs on every PR (path-lint → schema/contract validators → build_and_check.sh ms3+res → Playwright smoke), and branch protection requires build-test-validate + smoke. Verified in the 2026-08-01 audit."
gh issue close 100 --comment "Closing — dark-token centralization shipped: 13_Faculty_Resources/_automation/site_build/clinical-warm.css is build-injected into every shipped tool (common.py apply_full_page_pass since #264). The remaining light-mode :root duplication (this issue's documented 'next increment') is tracked in the 2026-08-01 audit remediation, frontend workstream. Verified 2026-08-01."
gh issue close 101 --comment "Closing — landed: CI steps 'Validate — topic_meta.json contract', 'Test — registry schema gate', and 'Validate — registry schemas' run on every PR (.github/workflows/ci.yml); surveillance findings validate against surveillance/config/finding.schema.json. Verified in the 2026-08-01 audit."
gh issue close 102 --comment "Closing — harmonized post-REMS wording shipped ('FDA eliminated the REMS in 2025; ANC per prescribing information') at 05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md:7,29; 05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md:15; 03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:32; lithium specifics present. PR #280 (open) refines the wording further under faculty attestation. Verified in the 2026-08-01 audit."
gh issue close 103 --comment "Closing — OSCE stations are scored checklists: 14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md scores /10 with 'Pass = ≥7/10 AND no critical-fail' plus entrustment-level mapping (line ~198). Verified in the 2026-08-01 audit."
gh issue close 104 --comment "Closing — the misleading 'Topics Reviewed 100% (1/1)' home metric is gone: zero matches for 'Topics Reviewed' in 13_Faculty_Resources/_automation/site_build/spa_index.html. Verified in the 2026-08-01 audit."
gh issue close 105 --comment "Closing — real SM-2 spaced retrieval shipped: cw_srs_v1 cards carry ease/ivl/reps/lapses/due (spa_index.html:555) with the Daily Review surface at 07_Evidence_and_Reading/Landmark_Trials/review.html. Scheduler-parity and QB#/FAM# serving-gap follow-ons are tracked in the 2026-08-01 audit remediation, learning-loop workstream. Verified 2026-08-01."
gh issue close 106 --comment "Closing — 09_Exam_Prep/shelf_comat_bank/ ships the blueprint crosswalk (01_BLUEPRINT_CROSSWALK.md) with NBME-vs-COMAT labeling and a data-quality gate in CI (engine/test_qbank.py). Verified in the 2026-08-01 audit."
gh issue close 107 --comment "Closing — aria-current on the active nav item (spa_index.html:831-832), aria-live route announcements landed via #234, icon-button label census clean. Two residuals (Path/Library toggle ARIA state; desktop route announcement) are tracked in the 2026-08-01 audit remediation, frontend workstream. Verified 2026-08-01."
```

- [ ] Rescope #108 to its remaining half. **Gate: WS1 Batch 4 (crawled-title sanitizer) must be MERGED first** — the pre-existing fence fix only partially closed the injection half; the sanitizer completes it, and this comment cites it. (This task is the single owner of the #108 rescope; WS1 Batch 4's PR body just points here.)

```bash
gh issue edit 108 --title "P2: Repo hygiene — relocate root planning docs; remove quick-wins/ and stale snapshots"
gh issue comment 108 --body "Rescoped: the injection-hardening half is now fully closed — issue-body code-fence neutralization + backtick-wrapped crawled URLs (13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py:140-150), model-output hardening (lib_ai_draft.py), and the crawled-title sanitizer with malicious-title fixture test (2026-08-01 audit remediation, governance workstream Batch 4 PR). Remaining scope is the repo-hygiene half, landing via the 2026-08-01 audit remediation PRs 'chore: relocate 20 stale root planning docs' and 'chore: remove orphaned snapshots…' — this issue closes when both merge."
```

- [ ] Retitle #232 to its true remainder (items 1–3 fixed by #233, item 4 declined with rationale):

```bash
gh issue edit 232 --title "sp-voice: deferred hardening remainder from #231 reviews (F24 · F6 · F2 · F21 · F4)"
gh issue comment 232 --body "Retitled: the headline blocker (reclaim unreachable when band ≠ ok) and items 2-3 were fixed in #233 (merged 2026-07-16); item 4 was reviewed and intentionally declined (see thread). This issue now tracks only the deferred remainder listed in the last status comment: F24 external <script src> hard-fail · F6 engineHash recompute-match · F2 record growth · F21 double-buffer · F4 dead redemption ledger."
```

- [ ] Close the duplicate link filings, keeping one canonical issue per URL (#265 samhsa · #266 fda-dsc · #267 fda-clozapine-on-STATUS):

```bash
gh issue close 211 --comment "Duplicate of #265 (identical fingerprint link:www.samhsa.gov::broken-link::6bae3107ce29193b). Weekly re-filing was the FP_RE dedup bug — fingerprints truncated at the first '.' on read-back; fixed on main (branch fix/surveillance-dedup-selfcrawl). Note: this URL appears only in surveillance's own committed reports, not in any curriculum page."
gh issue close 246 --comment "Duplicate of #265 (identical fingerprint; FP_RE dot-truncation dedup bug, fixed on main via fix/surveillance-dedup-selfcrawl)."
gh issue close 247 --comment "Duplicate of #266 (same URL https://www.fda.gov/drugs/drug-safety-and-availability/drug-safety-communications; FP_RE dot-truncation dedup bug, fixed on main via fix/surveillance-dedup-selfcrawl)."
gh issue close 248 --comment "Duplicate of #267 (same URL, same STATUS.md self-crawl origin; FP_RE dot-truncation dedup bug, fixed on main via fix/surveillance-dedup-selfcrawl)."
gh issue close 212 --comment "Closing — the FDA clozapine-REMS announcement URL returns HTTP 200 again (verified 2026-08-01) and no curriculum page cites it any longer (repo grep: only evidence_registry.json + surveillance config). The 2026-08-01 content-change review of this same source is tracked in #282; the residual STATUS.md self-crawl instance is #267."
```

- [ ] Annotate the three kept canonical issues so their disposition is self-documenting:

```bash
for n in 265 266 267; do gh issue comment "$n" --body "Kept as the canonical issue for this URL after the 2026-08-01 dedup cleanup. Note: the flagged 'affected page' is surveillance's own committed report (history/digest / STATUS.md), not curriculum — the monitor was crawling its own output. The surveillance tree is now excluded from lychee (fix/surveillance-dedup-selfcrawl), so this cannot re-fire; close after the 2026-08-03 run confirms a clean pass, unless the URL should be re-cited somewhere."; done
```

- [ ] Verify the end state: `gh issue list --state open --limit 50` — expect open set to be exactly: #108 (rescoped), #211-family survivors #265/#266/#267, #225, #232 (retitled), #282, #285, plus anything other workstreams filed.

---

## Batch 9 — Verified branch sweep (no PR; local git)

### Task 15: Sweep the 30 verified-safe local branches + 6 merged worktrees

**Gate:** run only after WS1 has pushed `codex/faculty-attestation-streamline` to origin (the sole at-risk branch): `git ls-remote --heads origin codex/faculty-attestation-streamline` must return a ref — if empty, STOP. Also requires Josh's approval (master decision D12). Re-verified 2026-08-01 via `gh pr list --head <branch> --state all` for every branch below; the 6fd8bc4 quartet's containment re-verified via `git merge-base --is-ancestor`. The nightly worktree sweep does NOT cover this repo (it sweeps reconnect-psychiatry-system and therapy-match only), so worktrees are removed manually here.

**Keep (do NOT delete):** `audit/qbank-2026-07`, `claude/skill-creator-brainstorm-43dbe0` (parked WIP); `codex/anki-batch-attestation`, `codex/anki-deck-redesign-spec`, `codex/anki-release-foundation-implementation`, `codex/evidence-registry-zotero-m1` (parked, have `backup/*-2026-07-17` remotes); `codex/faculty-attestation-streamline` (WS1); open-PR branches `codex/risk-aware-publishing-warnings` (#263), `content/clozapine-maoi-harmonization` (#280), `test/qbank-draft-count-fixture` (#281), `fix/qbank-serve-drafts-labeled` (#284); unverified strays `claude/automation-recommender-setup-1922c4`, `claude/pipeline-review-5f5ce6`, `fix/ms3-site-qa-2026-07-18`, `backup/ms3-qa-local-merge`, `claude/*` session branches, `claude/psychiatry-repo-coordination-d17162`, `claude/review-merge-open-prs-f5e567`, `claude/review-open-prs-01d34a`, `claude/codebase-audit-roadmap-0b735c` (flag the unverified strays to Josh rather than deleting).

**Steps:**

- [ ] All commands run against the primary checkout: `cd /Users/jm/Psychiatry-Clerkship-Library`. It is currently checked out on merged branch `fix/table-scroll-desktop-affordance-v2` — move it to main first: `git checkout main && git pull origin main`.
- [ ] Confirm the WS1 gate: `git ls-remote --heads origin codex/faculty-attestation-streamline` — non-empty output required.
- [ ] Re-verify the quartet's containment/supersession (audit evidence, re-run at execution time):

```bash
git merge-base --is-ancestor 6fd8bc4 origin/backup/anki-batch-attestation-2026-07-17 && echo quartet-contained
git ls-tree origin/main 09_Exam_Prep/shelf_comat_bank >/dev/null && echo engine-on-main
```

Expect both echo lines. If either fails, STOP and flag.
- [ ] Remove the six worktrees pinning merged branches — dirty worktrees are SKIPPED and flagged, never forced (a prior session left uncommitted sim work in an unknown worktree):

```bash
for wt in \
  "$HOME/Code/clerkship-crisis-988" \
  "$HOME/cotw-phase-b" \
  "$HOME/Psychiatry-Clerkship-Library/.worktrees/faculty-qbank-workbench" \
  "$HOME/Psychiatry-Clerkship-Library/.worktrees/scheduled-maintenance-steward" \
  "$HOME/Psychiatry-Clerkship-Library/.worktrees/rec-qa-rebase" \
  "$HOME/Psychiatry-Clerkship-Library/.claude/worktrees/psychiatry-platform-audit-089d2c"; do
  if [ ! -d "$wt" ]; then echo "GONE: $wt"; continue; fi
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    echo "SKIP dirty — review by hand: $wt"
  else
    git worktree remove "$wt" && echo "removed: $wt"
  fi
done
```

- [ ] Delete the verified branches. First pass — the 26 with merged/closed PRs, each re-verified inline (deletes only on MERGED or CLOSED):

```bash
for b in \
  claude/claude-md-management-improver-fcf6c4 claude/psychiatry-platform-audit-089d2c \
  claude/sp-interview-voiceover-audit-13c608 claude/sp-voice-232-residuals \
  claude/tools-content-improvements-6de0c3 claude/ward-mode-sidebar-button-00f98c \
  codex/ci-structural-server-contract codex/faculty-qbank-workbench \
  codex/platform-upgrade-foundation codex/scheduled-maintenance-steward \
  codex/scheduled-workflow-parser-fix codex/sp-health-canary-next-run \
  codex/sp-health-canary-runtime-env content/cotw-2026-07-23 \
  feat/anki-governance-shelf-m1 feat/case-of-the-week-section \
  feat/cotw-registry-driven feat/crisis-contacts-988 feat/evidence-registry-m1 \
  feat/governance-attribution-a11y fix/a11y-touch-targets fix/ms3-site-qa-main \
  fix/p0-nav-orphans-ci fix/rec-144-tool-fonts fix/table-scroll-desktop-affordance \
  fix/table-scroll-desktop-affordance-v2; do
  state=$(gh pr list --head "$b" --state all --json state --jq '.[0].state')
  case "$state" in
    MERGED|CLOSED) git branch -D "$b" && echo "deleted: $b ($state)";;
    *) echo "SKIP $b — PR state '$state', review by hand";;
  esac
done
```

(Notes: `fix/ms3-site-qa-main`'s local unpushed merge a7b5dba is audit-verified dead work — `-D` is intended. `fix/rec-144-tool-fonts` #241 and `fix/table-scroll-desktop-affordance` #251 are CLOSED-superseded, audit-verified.)
- [ ] Second pass — the four no-PR branches superseded via containment (quartet, verified above):

```bash
git branch -D claude/reverent-gauss-c472dc claude/tech-debt-cleanup-7361b3 \
  claude/handoff-prompt-m2-3cb253 jmoss333/rec-142-ms3-review-verb-disambiguation
```

- [ ] Report: `git branch | wc -l` and `git worktree list` — paste both into the session summary along with any SKIP lines for Josh.
- [ ] Session-memory follow-through (not a repo change): the audit's FIX asked that the auto-memory notes describing 6fd8bc4 and issue #232 as live risks be corrected. The 6fd8bc4/audio_oe/streamline notes were already corrected in-session on 2026-08-01; after this sweep and the #232 retitle land, also update the `worktree-branch-sprawl-2026-07-11` and `sp-voice-228-audit-2026-07-15` memory entries so future sessions don't re-triage resolved risks.

---

## Execution-order recap

| Batch | Branch / vehicle | Gate |
|---|---|---|
| 1 Surveillance dedup | `fix/surveillance-dedup-selfcrawl` | merge before 2026-08-03 |
| 2 Publish-gate + roster | `test/publish-gate-node-suites` | — |
| 3 Python suites in CI | `ci/governed-python-suites` | after Batch 2 (adjacent ci.yml edits) |
| 4 Playwright alignment | `chore/playwright-161-alignment` | — |
| 5 Root docs | `chore/root-doc-relocation` | — |
| 6 Cruft + apkg + history | `chore/working-tree-cruft` | [JOSH] Netlify env before merge; LFS-enabled env |
| 7 OE audio move | `media/relocate-oe-audio` | LFS-enabled env; own PR |
| 8 Issue close-out | gh CLI, no PR | [JOSH] approval + Batch 1 merged |
| 9 Branch sweep | local git, no PR | [JOSH] approval + WS1 streamline pushed |
