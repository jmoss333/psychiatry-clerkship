# Pipeline Safety Symmetry, QA-Gate Coverage & Frontend Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the resident build fail closed (missing sources, unverified rebrands, crisis-block asymmetry), extend the QA gate to the SPA shell and to dark-mode/light-token regressions, fix the remaining shell accessibility gaps, make the build byte-reproducible, and finally move nav from Python literals into `site_manifest.json`.

**Architecture:** All build logic lives in `13_Faculty_Resources/_automation/site_build/` — `build_deploy.py` (MS3 assembler), `resident_section.py` (derived-twin resident build), shared machinery in `common.py` (post-#264), static QA in `check-static-site.mjs`, crisis rendering in `crisis_block.py`. New fail-closed helpers and reproducibility fixes go into `common.py` with unit tests in `test_common.py`; gate extensions go into `check-static-site.mjs`; shell fixes edit `spa_index.html` guarded by a new root static-regression test.

**Tech Stack:** Python 3 (stdlib only, `unittest`), Node 18+ (`node:test`, no deps), single-file HTML tools, Netlify build via `build_and_check.sh`, GitHub Actions CI (`build-test-validate` + `smoke`).

**Verified against:** origin/main tip `817ef90` (2026-08-01). All file:line anchors below were re-verified at this commit. Executors MUST re-grep each anchor before editing — especially in `question-bank-practice.html`, which open PR #284 rewrites.

## Global Constraints

- main is branch-protected (GH006 on direct push): every change lands via feature branch + `gh pr create`; required checks: build-test-validate + smoke.
- Editing CLAUDE.md requires `cp CLAUDE.md AGENTS.md` in the same commit (CI byte-parity gate).
- localStorage keys MUST be cw_* (shared) or rp_* (resident) — QA gate hard-fails others.
- Crisis contacts (988 etc.) ONLY via crisis_resources.json + `<!-- crisis-block -->` markers; never hard-code numbers. Scope rule for adding a required surface: the learner must plausibly be *doing* risk work there (assessing, rehearsing, or planning disposition) — not merely reading a page that mentions suicide.
- Visual baselines regenerate ONLY via the "Refresh visual baselines" workflow_dispatch (Ubuntu/Chromium) — never on macOS.
- Playwright hangs locally on this macOS — verify smoke via CI, not locally.
- Build gate: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` must pass (this IS the Netlify build command). Root tests: `node --test tests/*.test.mjs`.
- New/renamed pages must be registered in site_manifest.json AND nav or the orphan check hard-fails (Batch 6 moves nav INTO site_manifest.json; until it lands, nav lives in build_deploy.py / resident_section.py).
- No PHI anywhere. Dose literals banned in rp-*/-trainer tools (relevant: the crisis block HTML contains no dose literals, so injecting it into rp-agitation.html is safe for the hard dose gate).
- Since #264, shared build logic lives in 13_Faculty_Resources/_automation/site_build/common.py (apply_full_page_pass, build_search_index, assert_page_contract) — put new shared transforms THERE, not in both callers. common.py rule: audience-neutral machinery only; every HTML mutation needs a matching postcondition.
- Do not edit `_prototypes/sp-interview/sp-interview.html` or its pack in this workstream (none of these tasks touch them; if a future rebase pulls them in, `node _prototypes/sp-interview/generate-preview.mjs --write` is mandatory).

## Sequencing around open PRs

- **#284 (qbank drafts labeled)** rewrites `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`. Batches 3 and 5 edit that file → **land #284 first**, then re-anchor.
- **#280/#281** (clozapine/MAOI content + fixture): zero file overlap with this plan; no ordering constraint.
- **#263 (draft, risk-aware publishing)** touches `build_deploy.py`/`resident_section.py`. Batches 1–2 are small targeted edits to those files; land them promptly — #263 must rebase onto current main anyway. Batch 6 (nav refactor) goes **last**, ideally after #263's disposition, because both rewrite the nav region.
- The unpushed local branch `codex/faculty-attestation-streamline` touches only faculty-console files — no overlap.

---

## Batch 1 — Resident build fails closed + byte-reproducible build

### Task 1: `common.copy_required_sources()` — collect-and-abort for required source files

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` (imports at :28-31; append function after `apply_contrast_fix`, currently ending :362)
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py`

**Interfaces:**
- Produces: `common.copy_required_sources(pairs, lib_root, dest_dir, label="") -> int` — copies `(src_rel, dst_name)` pairs from `lib_root` into `dest_dir`; if ANY source is missing, prints `BUILD ABORTED — N required source file(s) missing (<label>):` with the full list and raises `SystemExit(1)`. Returns the number of files copied.
- Consumed by: Task 3 (`resident_section.py` RES_EXTRA loop).

**Steps:**

- [ ] Create branch: `git checkout -b fix/ws4-resident-fail-closed origin/main`
- [ ] Write the failing test. Append to `13_Faculty_Resources/_automation/site_build/test_common.py` (before the final `if __name__ == "__main__":` block; the file already imports `os, shutil, sys, tempfile, unittest` and `common`):

```python
class TestCopyRequiredSources(unittest.TestCase):
    def test_copies_all_pairs(self):
        lib = tempfile.mkdtemp()
        dest = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(lib, "14_Tracks"))
            with open(os.path.join(lib, "14_Tracks", "a.md"), "w", encoding="utf-8") as fh:
                fh.write("# resident welcome")
            n = common.copy_required_sources([("14_Tracks/a.md", "welcome.md")], lib, dest)
            self.assertEqual(n, 1)
            with open(os.path.join(dest, "welcome.md"), encoding="utf-8") as fh:
                self.assertEqual(fh.read(), "# resident welcome")
        finally:
            shutil.rmtree(lib)
            shutil.rmtree(dest)

    def test_missing_source_aborts_with_exit_1(self):
        """Audit repro 2026-08-01: renaming resident_welcome.md produced a GREEN
        resident build that shipped MS3 welcome content under the resident nav
        title. A missing required source must abort the build."""
        lib = tempfile.mkdtemp()
        dest = tempfile.mkdtemp()
        try:
            with self.assertRaises(SystemExit) as ctx:
                common.copy_required_sources(
                    [("14_Tracks/RENAMED.md", "welcome.md"),
                     ("14_Tracks/also_gone.md", "rotation.md")],
                    lib, dest, label="resident content",
                )
            self.assertEqual(ctx.exception.code, 1)
        finally:
            shutil.rmtree(lib)
            shutil.rmtree(dest)
```

- [ ] Run it and confirm the expected failure: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → expect `AttributeError: module 'common' has no attribute 'copy_required_sources'` (2 errors).
- [ ] Implement. In `common.py`, add `import shutil` to the import block at :28-31 (alphabetical: after `re` → `glob, json, os, re, shutil`), and append after `apply_contrast_fix` (before the `apply_page_chrome` section):

```python
def copy_required_sources(pairs, lib_root, dest_dir, label=""):
    """Copy (source_rel, dest_name) pairs into dest_dir, aborting on ANY missing source.

    The resident derived-twin build starts as a copytree of the finished MS3
    build, so a bare `if os.path.exists(...)` skip means a renamed resident-only
    source silently ships the inherited MS3 file under the resident nav title
    with every gate green (2026-08-01 audit, reproduced). Collect every missing
    source and abort, mirroring build_deploy.py's _abort_missing convention.
    """
    missing = [src for src, _ in pairs if not os.path.exists(os.path.join(lib_root, src))]
    if missing:
        print(
            "BUILD ABORTED — %d required source file(s) missing%s:"
            % (len(missing), " (" + label + ")" if label else "")
        )
        for src in missing:
            print("   -", src)
        raise SystemExit(1)
    for src, dst in pairs:
        shutil.copyfile(os.path.join(lib_root, src), os.path.join(dest_dir, dst))
    return len(pairs)
```

- [ ] Run to pass: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → expect `OK` (all tests, including the pre-existing ones).
- [ ] Commit: `git add -A && git commit -m "feat(build): common.copy_required_sources — collect-and-abort for required sources"`

### Task 2: `common.apply_verified_replacements()` — rebrand needles must match or abort

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` (append after `copy_required_sources`)
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py`

**Interfaces:**
- Produces: `common.apply_verified_replacements(text, substitutions, label="") -> str` — applies `(needle, replacement)` pairs sequentially; collects every needle absent at its application time and raises `SystemExit(1)` listing them all. Order-sensitive by design (the resident rebrand relies on the `<div class="by">…` needle running before the bare `MS3 Clerkship` needle).
- Consumed by: Task 3 (index + learning-path rebrand in `resident_section.py`).

**Steps:**

- [ ] Write the failing test (append to `test_common.py`):

```python
class TestApplyVerifiedReplacements(unittest.TestCase):
    def test_applies_substitutions_in_order(self):
        out = common.apply_verified_replacements(
            "MS3 Clerkship hub",
            [("MS3 Clerkship", "Resident Rotation"), ("hub", "library")],
        )
        self.assertEqual(out, "Resident Rotation library")

    def test_stale_needle_aborts(self):
        """A reworded spa_index header must FAIL the resident build, not
        silently revert resident branding to MS3 text (audit finding: six
        unverified ix.replace() calls)."""
        with self.assertRaises(SystemExit) as ctx:
            common.apply_verified_replacements(
                "the header was reworded",
                [("old header copy", "resident copy")],
                label="resident index rebrand",
            )
        self.assertEqual(ctx.exception.code, 1)
```

- [ ] Run: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → expect `AttributeError: ... 'apply_verified_replacements'` (2 errors).
- [ ] Implement in `common.py`:

```python
def apply_verified_replacements(text, substitutions, label=""):
    """Apply (needle, replacement) pairs in order; abort if ANY needle is absent.

    The resident rebrand previously used bare str.replace() chains, so a reword
    of the MS3 shell copy silently shipped MS3 branding and the MS3 audience
    disclaimer on the resident site. Every needle is checked at its application
    point (order matters: earlier replacements may legitimately consume later
    needles' context) and all failures are reported together.
    """
    stale = []
    for needle, replacement in substitutions:
        if needle in text:
            text = text.replace(needle, replacement)
        else:
            stale.append(needle)
    if stale:
        print(
            "BUILD ABORTED — %d rebrand needle(s) failed to match%s:"
            % (len(stale), " (" + label + ")" if label else "")
        )
        for needle in stale:
            print("   - %r" % (needle[:100],))
        raise SystemExit(1)
    return text
```

- [ ] Run to pass: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → expect `OK`.
- [ ] Commit: `git add -A && git commit -m "feat(build): common.apply_verified_replacements — rebrand needles must match or abort"`

### Task 3: Wire fail-closed behavior into `resident_section.py` (RES_EXTRA, rebrand, reasoning cases)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py` — RES_EXTRA loop :61-64, source-map conditional :110-111, index rebrand :115-124, learning-path rebrand :127-132, reasoning cases :134-139

**Interfaces:**
- Consumes: `common.copy_required_sources`, `common.apply_verified_replacements` (Tasks 1–2).
- Produces: a resident build that hard-fails on (a) any missing RES_EXTRA source, (b) any stale rebrand needle, (c) missing `reasoning_cases_resident.json`. `PROTO_TOOLS` keeps its WARN — a missing rp-* tool is already caught downstream by the QA gate's `nav → missing tool file` hard check (no MS3 twin exists to mask it).

**Steps:**

- [ ] Replace the RES_EXTRA loop. Old (resident_section.py:61-64):

```python
for src,dst in RES_EXTRA:
    p=os.path.join(LIB,src)
    if os.path.exists(p):
        shutil.copyfile(p, OUT+"/content/"+dst)
```

New:

```python
# Fail closed (2026-08-01 audit): the copytree base means a missing resident-only
# source would silently ship the inherited MS3 file under the resident nav title.
common.copy_required_sources(RES_EXTRA, LIB, OUT+"/content", label="resident content")
```

- [ ] Make the source-map entry unconditional. Old (:110-111):

```python
if os.path.exists(os.path.join(LIB,"reasoning_cases_resident.json")):
    _srcs.add("reasoning_cases_resident.json")
```

New:

```python
_srcs.add("reasoning_cases_resident.json")   # required — build aborts below if missing
```

- [ ] Replace the index rebrand chain. Old (:115-124, the six `ix.replace(...)` lines between `ix=open(OUT+"/index.html",...)` and `open(OUT+"/index.html","w",...)`):

```python
ix=open(OUT+"/index.html",encoding="utf-8").read()
ix=ix.replace('<div class="by">MS3 Clerkship · Joshua Moss, MD</div>','<div class="by">Resident Rotation · Sanford BHU · Joshua Moss, MD</div>')
ix=ix.replace('<h1>Inpatient Psychiatry</h1>','<h1>MMC Psychiatry</h1>')
ix=ix.replace('MS3 Psychiatry Clerkship','MMC Psychiatry Residency')
ix=ix.replace('MS3 Clerkship','Resident Rotation')
ix=ix.replace('Private teaching site for the MS3 inpatient psychiatry rotation. Educational use; fictional composites only, no PHI. Some pages are pending faculty review.',
              'Private teaching site for the MMC general-psychiatry resident inpatient rotation at the Sanford Behavioral Health Unit. Educational use; fictional composites only, no PHI. Pending faculty attestation.')
ix=ix.replace('A private learning hub for the third-year inpatient psychiatry clerkship.',
              'A private learning hub for the MMC general-psychiatry resident inpatient rotation (Sanford BHU).')
open(OUT+"/index.html","w",encoding="utf-8").write(ix)
```

New (identical needles/replacements, now a verified table — ORDER PRESERVED):

```python
# Data-driven, verified rebrand: every needle must match spa_index's current copy
# or the build aborts (previously six bare replace() calls that silently no-oped
# after any shell reword, reverting resident branding to MS3 text).
RESIDENT_REBRAND=[
 ('<div class="by">MS3 Clerkship · Joshua Moss, MD</div>','<div class="by">Resident Rotation · Sanford BHU · Joshua Moss, MD</div>'),
 ('<h1>Inpatient Psychiatry</h1>','<h1>MMC Psychiatry</h1>'),
 ('MS3 Psychiatry Clerkship','MMC Psychiatry Residency'),
 ('MS3 Clerkship','Resident Rotation'),
 ('Private teaching site for the MS3 inpatient psychiatry rotation. Educational use; fictional composites only, no PHI. Some pages are pending faculty review.',
  'Private teaching site for the MMC general-psychiatry resident inpatient rotation at the Sanford Behavioral Health Unit. Educational use; fictional composites only, no PHI. Pending faculty attestation.'),
 ('A private learning hub for the third-year inpatient psychiatry clerkship.',
  'A private learning hub for the MMC general-psychiatry resident inpatient rotation (Sanford BHU).'),
]
ix=open(OUT+"/index.html",encoding="utf-8").read()
ix=common.apply_verified_replacements(ix, RESIDENT_REBRAND, label="resident index rebrand")
open(OUT+"/index.html","w",encoding="utf-8").write(ix)
```

- [ ] Replace the learning-path rebrand. Old (:127-132):

```python
lp=OUT+"/tools/learning-path.html"
if os.path.exists(lp):
    s=open(lp,encoding="utf-8").read()
    s=s.replace("Inpatient Psychiatry — Learning Path","MMC Psychiatry — Learning Path")
    s=s.replace("MS3 Clerkship · Joshua Moss, MD","Resident Rotation · Joshua Moss, MD")
    open(lp,"w",encoding="utf-8").write(s)
```

New:

```python
lp=OUT+"/tools/learning-path.html"
if not os.path.exists(lp):
    print("BUILD ABORTED — resident rebrand target missing:",lp)
    raise SystemExit(1)
s=open(lp,encoding="utf-8").read()
s=common.apply_verified_replacements(s,[
 ("Inpatient Psychiatry — Learning Path","MMC Psychiatry — Learning Path"),
 ("MS3 Clerkship · Joshua Moss, MD","Resident Rotation · Joshua Moss, MD"),
],label="resident learning-path rebrand")
open(lp,"w",encoding="utf-8").write(s)
```

- [ ] Make the missing resident reasoning payload a hard failure. Old (:134-139):

```python
_resident_reasoning=os.path.join(LIB,"reasoning_cases_resident.json")
if os.path.exists(_resident_reasoning):
    shutil.copy2(_resident_reasoning, OUT+"/reasoning_cases.json")
else:
    print("  WARN: resident reasoning cases missing from source:",_resident_reasoning)
```

New:

```python
_resident_reasoning=os.path.join(LIB,"reasoning_cases_resident.json")
if not os.path.exists(_resident_reasoning):
    # Silent MS3 downgrade guard: the copytree base means a missing resident payload
    # ships MS3-level cases under the resident site with every gate green.
    print("BUILD ABORTED — resident reasoning cases missing from source:",_resident_reasoning)
    raise SystemExit(1)
shutil.copy2(_resident_reasoning, OUT+"/reasoning_cases.json")
```

- [ ] Green-path build: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → expect `✓ PASS` (hard:0).
- [ ] Encode the audit's exact repro as the red-path check (this is the empirical proof the finding is closed):

```bash
git mv 14_Tracks/Resident/resident_welcome.md 14_Tracks/Resident/resident_welcome_RENAMED.md
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res; echo "exit=$?"
# EXPECT: 'BUILD ABORTED — 1 required source file(s) missing (resident content):'
#         '   - 14_Tracks/Resident/resident_welcome.md'  and exit=1  (audit got ✓ PASS here)
git mv 14_Tracks/Resident/resident_welcome_RENAMED.md 14_Tracks/Resident/resident_welcome.md
```

- [ ] Rebrand red path: temporarily change `<h1>Inpatient Psychiatry</h1>` to `<h1>Inpatient Psychiatry!</h1>` in `13_Faculty_Resources/_automation/site_build/spa_index.html`, run `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → expect `BUILD ABORTED — 1 rebrand needle(s) failed to match (resident index rebrand)` and exit 1. Revert with `git checkout -- 13_Faculty_Resources/_automation/site_build/spa_index.html`.
- [ ] Run root tests untouched by this change: `node --test tests/*.test.mjs` → expect all pass (379+).
- [ ] Commit: `git add -A && git commit -m "fix(build): resident derivation fails closed — missing sources, stale rebrand needles, and missing reasoning payload abort the build"`

### Task 4: Byte-reproducible build — content-hash cache-bust + sorted synonym keys

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` (`build_synonyms` return :146; add `quiz_cache_bust` + `import hashlib`)
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (`_QV=str(int(_time.time()))` at :342; `import time as _time` at :340)
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py`

**Interfaces:**
- Produces: `common.quiz_cache_bust(quizzes_path) -> str` — 12-hex-char sha256 prefix of the file's bytes. `build_synonyms` now returns keys in sorted order.
- Effect: back-to-back builds of identical source are byte-identical (`diff -rq` clean) without `PYTHONHASHSEED=0` or frozen time; learner caches of quizzes.json bust only on real change.

**Steps:**

- [ ] Write the failing tests (append to `test_common.py`; also add `import json` to its import block if not present — it currently imports `os, shutil, sys, tempfile, unittest`):

```python
class TestReproducibility(unittest.TestCase):
    def test_quiz_cache_bust_stable_for_identical_content(self):
        d = tempfile.mkdtemp()
        try:
            qp = os.path.join(d, "quizzes.json")
            with open(qp, "w", encoding="utf-8") as fh:
                fh.write('{"decks":[]}')
            first = common.quiz_cache_bust(qp)
            second = common.quiz_cache_bust(qp)
            self.assertEqual(first, second)
            self.assertEqual(len(first), 12)
        finally:
            shutil.rmtree(d)

    def test_quiz_cache_bust_changes_when_content_changes(self):
        d = tempfile.mkdtemp()
        try:
            qp = os.path.join(d, "quizzes.json")
            with open(qp, "w", encoding="utf-8") as fh:
                fh.write('{"decks":[]}')
            first = common.quiz_cache_bust(qp)
            with open(qp, "w", encoding="utf-8") as fh:
                fh.write('{"decks":[{"t":"new"}]}')
            self.assertNotEqual(first, common.quiz_cache_bust(qp))
        finally:
            shutil.rmtree(d)

    def test_synonym_keys_sorted_for_reproducible_index(self):
        """The synonyms dict was populated by iterating Python sets, so JSON key
        order varied with hash randomization — one of the two sources that made
        identical builds byte-differ."""
        syn = common.build_synonyms()
        self.assertEqual(list(syn.keys()), sorted(syn.keys()))
```

- [ ] Run: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → expect 2 errors (`quiz_cache_bust` missing) + 1 failure (keys unsorted) — note the sorted test may pass by luck on a given seed; run with `PYTHONHASHSEED=random` if it does: `PYTHONHASHSEED=random python3 13_Faculty_Resources/_automation/site_build/test_common.py`.
- [ ] Implement in `common.py`: add `import hashlib` to the import block; change `build_synonyms`'s return (currently :146 `return {k: sorted(v) for k, v in syn.items()}`) to:

```python
    return {k: sorted(syn[k]) for k in sorted(syn)}
```

and append:

```python
def quiz_cache_bust(quizzes_path):
    """Content-hash cache-bust for quizzes.json.

    Replaces the int(time.time()) value that made every deploy byte-differ in
    review.html/shelf-mode.html and busted learner caches even when quizzes.json
    was unchanged. Same content -> same URL -> reproducible builds + honest caching.
    """
    with open(quizzes_path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:12]
```

- [ ] In `build_deploy.py`, replace (currently :342, directly above `common.apply_full_page_pass(OUT, cache_bust=_QV)`):

```python
_QV=str(int(_time.time()))          # cache-bust for quizzes.json
```

with:

```python
_QV=common.quiz_cache_bust(OUT+"/tools/quizzes.json")   # content-hash cache-bust (reproducible)
```

Then confirm `_time` has no other uses (`grep -n '_time' 13_Faculty_Resources/_automation/site_build/build_deploy.py` → only the import) and delete `import time as _time` (:340).
- [ ] Run to pass: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → `OK`.
- [ ] End-to-end reproducibility proof (the audit's own diff method — it found exactly 3 differing files):

```bash
SCRATCH="${SCRATCHPAD:-/tmp}"   # use the session scratchpad dir
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
cp -R _build/ms3 "$SCRATCH/repro-a"
sleep 2
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
diff -rq "$SCRATCH/repro-a" _build/ms3; echo "exit=$?"
# EXPECT: no output, exit=0 (previously: search-index.json, tools/review.html, tools/shelf-mode.html differed)
```

- [ ] Run root tests: `node --test tests/*.test.mjs` → all pass.
- [ ] Commit: `git add -A && git commit -m "fix(build): byte-reproducible output — sha256 quizzes cache-bust + sorted synonym keys"`

**PR boundary:** branch `fix/ws4-resident-fail-closed`, PR title **"Resident build fails closed + byte-reproducible output (audit WS4, findings 1/3/11)"**. Push, `gh pr create --title ... --body ...`, require **build-test-validate + smoke** green in CI (do not run Playwright locally). PR body must note the two red-path repros and the double-build diff evidence.

---

## Batch 2 — Crisis-block (988) pipeline symmetry

**Design note (both options assessed, per audit):** Option A — run `crisis_block.inject_markdown/inject_html` over resident-written files in `resident_section.py` plus a resident-scoped required-surface hard-fail — creates the missing *injection path*, so a future resident-only source CAN carry a marker; it mirrors `build_deploy.py`'s existing pattern exactly. Option B — verify rendered blocks per-site in `check-static-site.mjs` — gates from one place but leaves markers in resident-only sources shipping as inert comments (the exact silent-loss failure #269 was built to prevent). **Option A is chosen.** Inherited MS3 pages arrive via the copytree already injected and are untouched (inject is marker-driven and no-ops without one).

### Task 5: Failing contract test — resident pipeline must inject and assert

**Files:**
- Test: `tests/crisis-block.test.mjs` (append; file style: `node:test` + textual source assertions, see its existing header)

**Interfaces:**
- Produces: a root-suite test that permanently pins the resident injection path and required-surface sets, failing `node --test tests/*.test.mjs` if anyone removes them.

**Steps:**

- [ ] Create branch (stack on Batch 1 if it hasn't merged yet; otherwise from origin/main): `git checkout -b fix/ws4-resident-crisis-symmetry`
- [ ] Append to `tests/crisis-block.test.mjs`:

```js
test('resident derivation has a crisis injection path and required-surface assertion (pipeline symmetry)', () => {
  const residentSrc = fs.readFileSync(
    path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'resident_section.py'),
    'utf8',
  );
  assert.match(residentSrc, /import crisis_block/, 'resident_section.py must import crisis_block');
  assert.match(residentSrc, /inject_markdown/, 'resident-written markdown must pass through inject_markdown');
  assert.match(residentSrc, /inject_html/, 'resident-written tools must pass through inject_html');
  assert.match(residentSrc, /_RES_CRISIS_REQUIRED_MD/, 'resident build must declare a required-surface md set');
  assert.match(residentSrc, /_RES_CRISIS_REQUIRED_TOOLS/, 'resident build must declare a required-surface tool set');
  assert.match(
    residentSrc,
    /BUILD ABORTED — crisis-contact block missing/,
    'a required resident surface losing its crisis block must hard-fail the build',
  );
});
```

- [ ] Run: `node --test tests/crisis-block.test.mjs` → expect 1 failing test (`resident_section.py must import crisis_block`).
- [ ] Commit: `git add tests/crisis-block.test.mjs && git commit -m "test(crisis): resident pipeline must inject crisis blocks and assert required surfaces (red)"`

### Task 6: Implement resident crisis injection + required-surface hard-fail

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py` — insert one block after the PROTO_TOOLS pack-copy loop (currently ends :87, immediately before the `# Apply the full shared page pass` comment at :89)

**Interfaces:**
- Consumes: `crisis_block.load/inject_markdown/inject_html` (existing, marker-driven, idempotent-safe), `RES_EXTRA`, `PROTO_TOOLS`.
- Produces: `_RES_CRISIS_REQUIRED_MD` / `_RES_CRISIS_REQUIRED_TOOLS` sets (initially empty — populated by Task 8 after Josh's decision) with the same `BUILD ABORTED` semantics as `build_deploy.py:285-291`.

**Steps:**

- [ ] Insert after the PROTO_TOOLS loop (after the `shutil.copyfile(pack_src, ...)` line, before the `# Apply the full shared page pass` comment):

```python
# ---- crisis-contact symmetry (2026-08-01 audit) ----
# Resident-written files never passed through crisis_block: a marker in a
# resident-only source shipped as an inert HTML comment with zero build failure —
# the exact silent-loss mode PR #269 was built to prevent, just on the other
# pipeline. Mirror build_deploy.py's inject + required-surface hard-fail here.
# Pages inherited via the MS3 copytree arrive already injected and are untouched
# (inject_* no-ops without a marker).
import crisis_block as _crisis
_crisis_data=_crisis.load(LIB)
# Required resident-only surfaces = where a resident is plausibly DOING risk work
# (assessing, rehearsing, or planning disposition) — same scope rule as
# build_deploy.py's _CRISIS_REQUIRED sets. Populated per faculty decision;
# empty sets still keep the assertion and injection path wired.
_RES_CRISIS_REQUIRED_MD=set()
_RES_CRISIS_REQUIRED_TOOLS=set()
_crisis_md_done=set()
for _src,_dst in RES_EXTRA:
    _cp=OUT+"/content/"+_dst
    _t=open(_cp,encoding="utf-8").read()
    _t,_did=_crisis.inject_markdown(_t,_crisis_data)
    if _did:
        open(_cp,"w",encoding="utf-8").write(_t)
        _crisis_md_done.add(_dst)
_crisis_tools_done=set()
for _src,_dst in PROTO_TOOLS:
    _tp=OUT+"/tools/"+_dst
    if not os.path.exists(_tp): continue   # missing rp-* is caught by the nav→missing-tool hard check
    _t=open(_tp,encoding="utf-8").read()
    _t,_did=_crisis.inject_html(_t,_crisis_data)
    if _did:
        open(_tp,"w",encoding="utf-8").write(_t)
        _crisis_tools_done.add(_dst)
_crisis_gap=sorted((_RES_CRISIS_REQUIRED_MD-_crisis_md_done)|(_RES_CRISIS_REQUIRED_TOOLS-_crisis_tools_done))
if _crisis_gap:
    print("BUILD ABORTED — crisis-contact block missing from required safety surface(s):")
    for _g in _crisis_gap: print("   -",_g,"(expected the crisis-block marker in its source)")
    raise SystemExit(1)
print("crisis block injected (resident):",len(_crisis_md_done),"content page(s) +",len(_crisis_tools_done),"tool(s)")
```

- [ ] Run the contract test to pass: `node --test tests/crisis-block.test.mjs` → all pass.
- [ ] Full builds: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → both `✓ PASS`; resident log shows `crisis block injected (resident): 0 content page(s) + 0 tool(s)` (no resident-only source carries a marker yet — expected).
- [ ] Injection-path smoke proof: temporarily append `<!-- crisis-block -->` to `14_Tracks/Resident/cl_reference.md`, rebuild res, and verify: `grep -c '988' _build/res/content/cl_reference.md` → ≥1 and the log shows `1 content page(s)`. Revert: `git checkout -- 14_Tracks/Resident/cl_reference.md`.
- [ ] Run full root suite: `node --test tests/*.test.mjs` → all pass.
- [ ] Commit: `git add -A && git commit -m "fix(build): resident pipeline injects crisis blocks + required-surface hard-fail (symmetry with build_deploy)"`

**PR boundary:** branch `fix/ws4-resident-crisis-symmetry`, PR title **"Crisis-block enforcement symmetry: resident pipeline gains injection path + hard-fail (audit WS4 finding 2)"**. CI: build-test-validate + smoke green. Note in the body: required sets ship empty pending the faculty scope decision (Task 7).

### Task 7: **[JOSH]** Decide which resident-only surfaces are required crisis surfaces

Per the CLAUDE.md scope rule (learner plausibly *doing* risk work), two resident-only surfaces qualify on the audit's analysis:

1. **`rp-agitation.html`** (Agitation Ladder — PRN Trainer): rehearsing restraint/de-escalation decisions — violence-risk work. Recommendation: **yes**.
2. **`cl_reference.md`** ("C-L: Emergencies, Tox & Capacity"): acute emergency reference used during risk assessment. Recommendation: **yes** (weaker than #1 — it is closer to reference material; your call under the "not merely reading" clause).

Exact steps for Josh:
- [ ] Review the two candidates above (open `https://mmc-psychiatry-residents-sanford.netlify.app/?tool=rp-agitation.html` and `...?page=cl_reference.md`).
- [ ] Reply in the tracking issue/PR with one of: "both", "rp-agitation only", or "neither" — Task 8 executes accordingly. No GitHub settings or console work needed.

### Task 8: (conditional on Task 7) Add markers + populate the resident required sets

**Files:**
- Modify: `_prototypes/agitation-trainer/rp-agitation.html` (if approved), `14_Tracks/Resident/cl_reference.md` (if approved), `13_Faculty_Resources/_automation/site_build/resident_section.py` (the two set literals from Task 6)

**Steps (for "both"; drop the unapproved item otherwise):**

- [ ] In `_prototypes/agitation-trainer/rp-agitation.html`, insert `<!-- crisis-block-html -->` on its own line immediately before `</body>` (the rendered block is self-contained HTML; contains no dose literals, so the rp-* hard dose gate is unaffected).
- [ ] In `14_Tracks/Resident/cl_reference.md`, append `<!-- crisis-block -->` on its own line at the end of the file.
- [ ] In `resident_section.py`, change the two set literals from Task 6 to:

```python
_RES_CRISIS_REQUIRED_MD={"cl_reference.md"}
_RES_CRISIS_REQUIRED_TOOLS={"rp-agitation.html"}
```

- [ ] Rebuild res: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → `✓ PASS`, log shows `crisis block injected (resident): 1 content page(s) + 1 tool(s)`; `grep -c 988 _build/res/tools/rp-agitation.html` → ≥1.
- [ ] Red path: temporarily delete the marker from `cl_reference.md`, rebuild → expect `BUILD ABORTED — crisis-contact block missing from required safety surface(s): - cl_reference.md`; restore.
- [ ] `node --test tests/*.test.mjs` → pass. Commit: `git add -A && git commit -m "feat(safety): designate resident crisis surfaces (rp-agitation, cl_reference) per faculty decision"` — same branch/PR as Tasks 5–6 if still open, else a follow-up PR `feat/ws4-resident-crisis-surfaces`.

---

## Batch 3 — QA-gate shell coverage + dark-mode literal fixes *(land after PR #284 merges)*

### Task 9: Replace the 8 light-hex literals with tokens; give qbank its `<main>` landmark

**Files:**
- Modify: `02_Clinical_Skills/Communication_Practice/communication-practice.html` (:50, :67)
- Modify: `01_Six_Week_Curriculum/learning-path.html` (:74)
- Modify: `02_Clinical_Skills/Screeners/screeners.html` (:47)
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (:55, :143 — **re-grep after #284's rewrite; line numbers WILL have moved**)

**Interfaces:**
- Produces: zero `background:#<light-hex>` literals in warm-linked tools (precondition for Task 10's gate); `<main id="root">` in the built qbank page (the build's `apply_page_chrome` exact-match rewrite misses it because the root div has a loading child — verified at tip).

**Steps:**

- [ ] Confirm #284 is merged and rebase: `gh pr view 284 --json state` → `MERGED`; `git checkout -b fix/ws4-dark-mode-and-qa-gate origin/main`.
- [ ] Re-anchor every line: `grep -n '#fff7f2\|#fffaf0\|#f1ece6\|#f3e7df\|#eaf0f6\|id="root"' 02_Clinical_Skills/Communication_Practice/communication-practice.html 01_Six_Week_Curriculum/learning-path.html 02_Clinical_Skills/Screeners/screeners.html 13_Faculty_Resources/_automation/site_build/question-bank-practice.html`
- [ ] `communication-practice.html:50` — old: `.randomdrill:hover{background:#fff7f2;border-color:var(--primary-dark)}` → new: `.randomdrill:hover{background:var(--primary-light);border-color:var(--primary-dark)}` (page :root defines `--primary-light:#f3ebe5`; dark resolves to the clinical-warm rgba tint).
- [ ] `communication-practice.html:67` — old: `.drill{border:1px solid #ccb78a;background:#fffaf0;` → new: `.drill{border:1px solid var(--warning);background:var(--warning-light);` (rest of the rule unchanged; page defines `--warning:#7a6234`/`--warning-light:#f5efe2`; in dark mode the `.drilllabel` `var(--warning)` text now sits on the warning tint — audit's 2.29:1 failure resolves).
- [ ] `learning-path.html:74` — old: `.dx{width:28px;height:28px;border-radius:8px;border:1px solid #e4d8c9;background:#f1ece6;color:var(--text-mid);cursor:pointer;font-size:16px}` → new: `.dx{width:28px;height:28px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text-mid);cursor:pointer;font-size:16px}` (page defines `--border:#ddd3c6`, `--surface2:#faf6f0`).
- [ ] `screeners.html:47` — old fragment: `.b3{background:#f3e7df;color:var(--primary-dark)}` → new: `.b3{background:var(--primary-light);color:var(--primary-dark)}` (edit only the `.b3` rule on the shared line; `--primary-light:#f3ebe5` defined).
- [ ] `question-bank-practice.html` `.chip-rel` — old: `.chip-rel{color:var(--info,#41618a);background:#eaf0f6;border-color:#eaf0f6}` → new: `.chip-rel{color:var(--info,#41618a);background:var(--info-light,#eaf0f6);border-color:var(--info-light,#eaf0f6)}` (light keeps #eaf0f6 via fallback; dark resolves to clinical-warm's `--info-light` rgba tint).
- [ ] `question-bank-practice.html` root div (audit finding 9) — old: `<div id="root"><div class="loading">Loading question bank&hellip;</div></div>` → new: `<main id="root"><div class="loading">Loading question bank&hellip;</div></main>`. Then confirm no tag-qualified selector breaks: `grep -n 'div#root' 13_Faculty_Resources/_automation/site_build/question-bank-practice.html` → 0 hits.
- [ ] Build + verify: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` → `✓ PASS`; then `grep -c '<main' _build/ms3/tools/question-bank-practice.html` → 1, and `grep -n 'background:#f\|background:#e' _build/ms3/tools/communication-practice.html _build/ms3/tools/learning-path.html _build/ms3/tools/screeners.html _build/ms3/tools/question-bank-practice.html` → 0 hits.
- [ ] `node --test tests/*.test.mjs` → pass (includes #284's new qbank tests — confirms no functional regression from the `<main>` swap).
- [ ] Commit: `git add -A && git commit -m "fix(a11y): dark-mode light-hex literals -> tokens in 4 tools; <main> landmark for question bank (audit WS4 findings 5/9)"`

### Task 10: QA gate — scan the SPA shell; hard-fail new light literals; soft-flag computed storage keys

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` — per-tool loop starts :220 (verified at tip); storage regex :273; bare-`--primary` check ends ~:285; `legacyMetadataPaths` block ~:286-288

**Interfaces:**
- Produces: (a) HARD CDN + storage-namespace checks over `index.html`; (b) SOFT computed-key flag in shell and tools (STRICT is deliberately NOT set in `build_and_check.sh`, so SOFT warns without blocking — the shell's 2 known `localStorage.getItem(k` computed reads will warn by design); (c) HARD light-background-literal check for warm-linked tools (depends on Task 9 having zeroed existing literals).

**Steps:**

- [ ] Inside the per-tool loop (immediately after the existing bare-`color:var(--primary)` hard check), add:

```js
  // Computed keys bypass the literal-only namespace regex above; surface the
  // indirection so it gets a human look (SOFT: build_and_check.sh runs non-STRICT).
  const computedKeys = [...html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(?!['"])/g)];
  if (computedKeys.length) S(`computed localStorage key(s) in ${f} (${computedKeys.length}) — namespace rule cannot verify indirection; prefer literal cw_*/rp_* keys`);
  // Dark-mode regression gate (audit WS4): a hard-coded light background in a page
  // that takes its dark tokens from clinical-warm.css renders light-on-light in dark
  // mode (WCAG 1.4.3 — measured 2.05-2.43:1). Pages shipping their own
  // [data-theme="dark"] block manage their own backgrounds and are exempt.
  if (html.includes('clinical-warm.css') && !html.includes('[data-theme="dark"]')) {
    for (const m of html.matchAll(/background(?:-color)?\s*:\s*(#[ef][0-9a-fA-F]{2}(?:[0-9a-fA-F]{3})?)\b/g)) {
      H(`light background literal ${m[1]} in ${f} — renders light-on-light in dark mode; use a token (var(--surface)/var(--*-light)) with a light fallback`);
    }
  }
```

- [ ] After the per-tool loop's closing `}` and the `legacyMetadataPaths` summary block, add the shell scan:

```js
/* ---------- 5c. SPA shell (index.html) — CDN + storage-namespace scans ---------- */
// The shell is the single largest JS surface shipped (all quiz/SRS/pretest logic,
// 38 localStorage references) but was exempt from every per-page check: an
// un-namespaced key or a CDN script added to spa_index.html shipped ungated.
// Tool-specific checks (metadata markers, dose literals, viewport) stay tools-only.
const shellPath = p('index.html');
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, 'utf8');
  if (CDN_HOST.test(shell)) H('external CDN dependency in index.html — vendor the script locally so bedside/offline use does not blank the shell');
  const shellKeys = [...shell.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  for (const k of shellKeys) if (!k.startsWith('cw_') && !k.startsWith('rp_')) H(`non-namespaced storage key in index.html: "${k}" (use cw_* or rp_*)`);
  const shellComputed = [...shell.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(?!['"])/g)];
  if (shellComputed.length) S(`computed localStorage key(s) in index.html (${shellComputed.length}) — namespace rule cannot verify indirection; prefer literal cw_*/rp_* keys`);
} else {
  H('index.html missing from built site');
}
```

- [ ] Green path: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` → both `✓ PASS` with the shell computed-key SOFT warning visible (expected count 2 for ms3).
- [ ] Red-path proofs against the BUILT output (no rebuild needed between checks):

```bash
# (a) light literal → HARD
sed -i '' 's/background:var(--surface)/background:#fffaf0/' _build/ms3/tools/communication-practice.html
node 13_Faculty_Resources/_automation/site_build/check-static-site.mjs _build/ms3; echo "exit=$?"
# EXPECT: 'light background literal #fffaf0 in communication-practice.html' and exit=1
# (b) shell storage key → HARD
sed -i '' "s/localStorage.getItem('cw_theme')/localStorage.getItem('bad_theme')/" _build/ms3/index.html
node 13_Faculty_Resources/_automation/site_build/check-static-site.mjs _build/ms3; echo "exit=$?"
# EXPECT: non-namespaced storage key in index.html: "bad_theme" and exit=1
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3   # rebuild clean, expect ✓ PASS
```

- [ ] `node --test tests/*.test.mjs` → pass.
- [ ] Commit: `git add -A && git commit -m "feat(qa): gate the SPA shell (CDN + storage namespace) and hard-fail light background literals in warm-linked tools (audit WS4 findings 4/5)"`

**PR boundary:** branch `fix/ws4-dark-mode-and-qa-gate`, PR title **"Dark-mode literal fixes + QA-gate shell coverage (audit WS4 findings 4/5/9)"**. Depends on **#284 merged**. CI: build-test-validate + smoke. Contingency: if the smoke visual spec flags the token swaps (loose 0.20 threshold makes this unlikely), run the "Refresh visual baselines" workflow_dispatch on GitHub Actions — never regenerate locally.

---

## Batch 4 — SPA shell: desktop route announcements + toggle ARIA state

### Task 11: Failing static-regression test for the shell a11y contract

**Files:**
- Create: `tests/spa-shell-a11y.test.mjs`

**Interfaces:**
- Produces: root-suite textual assertions pinning (a) a desktop live region outside `.mobile-chrome`, (b) `announceRoute` definition + ≥5 occurrences (definition + special/tool/md/path call sites), (c) focus management on `#content`, (d) `aria-pressed` wiring on `mPath`/`mLib`.

**Steps:**

- [ ] `git checkout -b fix/ws4-spa-route-announcement origin/main`
- [ ] Create `tests/spa-shell-a11y.test.mjs`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'spa_index.html'),
  'utf8',
);

// Audit WS4 finding 6: the only route-change live region (#mobileTitle) sits inside
// .mobile-chrome, which is display:none on desktop — removed from the accessibility
// tree, so desktop screen-reader users get NO announcement and focus never moves.
test('a desktop route live region exists outside the mobile chrome', () => {
  assert.match(shell, /id="routeStatus"[^>]*aria-live="polite"/);
  assert.ok(
    shell.indexOf('id="routeStatus"') > shell.indexOf('id="mobileTitle"'),
    'routeStatus must sit outside .mobile-chrome (after #mobileTitle in the markup)',
  );
});

test('route renders announce the page and move focus to #content', () => {
  assert.match(shell, /function announceRoute\(/);
  const calls = (shell.match(/announceRoute\(/g) || []).length;
  assert.ok(calls >= 5, `special, tool, md, and path branches must all announce (found ${calls})`);
  assert.match(shell, /contentEl\.focus\(\{preventScroll:true\}\)/);
});

// Audit WS4 finding 8: the Path/Library segmented toggle is the last stateful shell
// control without ARIA state (mc-mode, wd-mode, markrev, themeBtn all carry aria-pressed).
test('Path/Library segmented toggle exposes aria-pressed state', () => {
  assert.match(shell, /<button id="mPath" aria-pressed="false">/);
  assert.match(shell, /<button id="mLib" aria-pressed="true">/);
  assert.match(shell, /mPath\.setAttribute\('aria-pressed','true'\)/);
  assert.match(shell, /mLib\.setAttribute\('aria-pressed','true'\)/);
});
```

- [ ] Run: `node --test tests/spa-shell-a11y.test.mjs` → expect 3 failing tests.
- [ ] Commit: `git add tests/spa-shell-a11y.test.mjs && git commit -m "test(a11y): shell route-announcement + toggle ARIA contract (red)"`

### Task 12: Implement in `spa_index.html`

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` — CSS near :271, markup :440 and :456, `setMobileTitle` :779-784, `reflectLibrary`/`showPath` :766-767, `show()` branches :834-870

**Steps:**

- [ ] CSS: after the line `.mobile-chrome{display:none}` (:271), add on its own line:

```css
  .vh-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
```

- [ ] Markup (:456): immediately BEFORE `<div id="content" class="md-body" tabindex="-1">`, insert:

```html
    <span id="routeStatus" class="vh-live" aria-live="polite"></span>
```

- [ ] Toggle markup (:440) — old:

```html
    <div class="modetoggle" id="modetoggle"><span class="knob"></span><button id="mPath">&#9678; Path</button><button id="mLib">Library</button></div>
```

new:

```html
    <div class="modetoggle" id="modetoggle" role="group" aria-label="Content mode"><span class="knob"></span><button id="mPath" aria-pressed="false">&#9678; Path</button><button id="mLib" aria-pressed="true">Library</button></div>
```

- [ ] `reflectLibrary` (:766) — old body fragment `if(mLib) mLib.classList.add('on'); if(mPath) mPath.classList.remove('on');` → new: `if(mLib){ mLib.classList.add('on'); mLib.setAttribute('aria-pressed','true'); } if(mPath){ mPath.classList.remove('on'); mPath.setAttribute('aria-pressed','false'); }` (rest of the line unchanged).
- [ ] `showPath` (:767) — old fragment `if(mPath) mPath.classList.add('on'); if(mLib) mLib.classList.remove('on');` → new: `if(mPath){ mPath.classList.add('on'); mPath.setAttribute('aria-pressed','true'); } if(mLib){ mLib.classList.remove('on'); mLib.setAttribute('aria-pressed','false'); }`. Also append `announceRoute({t:'Learning Path',f:'__path__'});` immediately after the existing `setMobileTitle({t:'Learning Path',f:'__path__'});` call at the end of `showPath`.
- [ ] Add the helper directly after the `setMobileTitle` function (:784):

```js
  var routeAnnounced=false;
  function announceRoute(item){
    var rs=document.getElementById('routeStatus');
    if(rs){ rs.textContent=!item?'':((item.f==='__home__'?'Today / Progress':(item.f==='__start__'?'Start here':(item.f==='__path__'?'Learning Path':item.t)))+' loaded'); }
    // Skip the focus move on the very first render so initial keyboard position
    // (nav/search) is not stolen; announce-only is correct for page load.
    if(routeAnnounced){ try{ contentEl.focus({preventScroll:true}); }catch(_){ try{ contentEl.focus(); }catch(__){ } } }
    routeAnnounced=true;
  }
```

- [ ] Wire the three `show()` branches:
  - special branch: change `window.scrollTo(0,0); return;` (the one after `__afterSpecial`) → `announceRoute(item); window.scrollTo(0,0); return;`
  - tool branch: change its `window.scrollTo(0,0); return;` (after the iframe innerHTML assignment) → `announceRoute(item); window.scrollTo(0,0); return;`
  - md `.then` handler: change `window.scrollTo(0,_sy); postFacultyPreviewStatus('ready','page');` → `window.scrollTo(0,_sy); announceRoute(item); postFacultyPreviewStatus('ready','page');`
- [ ] Run to pass: `node --test tests/spa-shell-a11y.test.mjs` → 3 pass. Full suite: `node --test tests/*.test.mjs` → all pass.
- [ ] Build both sites (`bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && ... res`) → `✓ PASS` (the resident rebrand needles do not overlap any edited line; the fail-closed check from Batch 1 proves it).
- [ ] Commit: `git add -A && git commit -m "fix(a11y): desktop route announcements + #content focus + Path/Library aria-pressed (audit WS4 findings 6/8)"`

**PR boundary:** branch `fix/ws4-spa-route-announcement`, PR title **"SPA shell: desktop screen-reader route announcements + segmented-toggle ARIA (audit WS4 findings 6/8)"**. CI: build-test-validate + smoke.

---

## Batch 5 — Issue #100 second half: light tokens single-sourced *(land after PR #284; after Batch 3)*

**Design note:** canonical values = the per-token MAJORITY from the audit census (`--text:#3b332c` ×14, `--text-mid:#64574b`, `--text-light:#665a4f` built). The minority palette (`--text:#2f2924`/`--text-mid:#51473d`) lives in exactly 5 tools (diagnostic-reasoning, communication-practice, review, feedback, question-bank-practice) **and the shell** — flipping canonical the other way is a two-line table+CSS change later (see master decision D9, canonical light text palette — NOT master D2, which is the unrelated streamline-branch push). The shell must be harmonized in the same commit as the clinical-warm `:root` addition because the build injects the stylesheet link after inline styles, so the linked values win the cascade. Stripping per-page `:root` duplicates is deliberately deferred — the drift gate makes divergence impossible, and regex-stripping 40 hand-authored blocks is the riskier half for zero rendering benefit.

### Task 13: Harmonize the 6 drifted files + the shell to canonical values

**Files:**
- Modify: `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html`, `02_Clinical_Skills/Communication_Practice/communication-practice.html`, `07_Evidence_and_Reading/Landmark_Trials/review.html`, `13_Faculty_Resources/Feedback/feedback.html`, `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (all: `--text:#2f2924`→`#3b332c`, `--text-mid:#51473d`→`#64574b` in the `:root` block)
- Modify: `04_Acute_and_Safety/Catatonia/bfcrs.html` (`--text-light:#6b5d4f`→`#665a4f`)
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (same `--text`/`--text-mid` swap in its `:root`)

**Steps:**

- [ ] `git checkout -b chore/ws4-light-tokens-single-source origin/main`
- [ ] Pre-census (baseline evidence): `for f in 02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html 02_Clinical_Skills/Communication_Practice/communication-practice.html 07_Evidence_and_Reading/Landmark_Trials/review.html 13_Faculty_Resources/Feedback/feedback.html 13_Faculty_Resources/_automation/site_build/question-bank-practice.html 04_Acute_and_Safety/Catatonia/bfcrs.html 13_Faculty_Resources/_automation/site_build/spa_index.html; do echo "== $f"; grep -o '\-\-text:[^;]*\|--text-mid:[^;]*\|--text-light:[^;]*' "$f" | head -3; done` → confirms the drifted values before editing.
- [ ] In each of the 5 tools + spa_index: replace `--text:#2f2924` with `--text:#3b332c` and `--text-mid:#51473d` with `--text-mid:#64574b` **only inside the `:root{` block** (each value appears once there; if a file uses the hex elsewhere as a non-token literal, leave those).
- [ ] In `bfcrs.html`: replace `--text-light:#6b5d4f` with `--text-light:#665a4f`.
- [ ] Re-run the census → all seven files report `--text:#3b332c`, `--text-mid:#64574b`, and `--text-light` ∈ {#665a4f, #87786a} (the #87786a legacy value is rewritten to #665a4f at build by `apply_contrast_fix` — do not touch it in sources).
- [ ] `node --test tests/*.test.mjs` → pass. Commit: `git add -A && git commit -m "chore(design): harmonize drifted light :root tokens to canonical values (issue #100 census)"`

### Task 14: Move the canonical light `:root` into `clinical-warm.css`

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/clinical-warm.css` (header comment :8-10 + new `:root` block above the `[data-theme="dark"]` block)

**Steps:**

- [ ] Replace the header comment's lines (currently: `* Light-mode :root tokens still live inline per page (palette is consistent, but` / `* centralizing them is the next increment of #100 — do it once cross-tool light values` / `* are confirmed identical, to avoid shifting any tool's colors).`) with:

```
 * Light-mode :root tokens are canonical HERE as of the 2026-08 #100 completion.
 * Per-page inline :root blocks may still exist but must agree byte-for-byte on
 * shared tokens — check-static-site.mjs hard-fails any drift against this block.
```

- [ ] Insert the canonical block on its own line ABOVE the `[data-theme="dark"]{...}` line:

```css
:root{--bg:#f6f3ee;--bg-alt:#faf6f0;--surface:#ffffff;--surface2:#faf6f0;--border:#ddd3c6;--primary:#c25a3c;--primary-dark:#a84830;--primary-light:#f3ebe5;--accent:#2a6b5e;--accent-dark:#1e5248;--accent-light:#edf4f2;--text:#3b332c;--text-mid:#64574b;--text-light:#665a4f;--success:#357160;--success-light:#e7f1ed;--danger:#a34132;--danger-light:#fbece9;--warning:#7a6234;--warning-light:#f5efe2;--warn:#7a6234;--warn-bg:#f5efe2;--info:#41618a;--info-light:#eaf0f6;--focus:#155eef;}
```

- [ ] Build both sites → `✓ PASS`. Spot-check the cascade is a no-op: `grep -o '\-\-text:#3b332c' _build/ms3/index.html | head -1` (shell inline agrees with linked canonical).
- [ ] Commit: `git add -A && git commit -m "feat(design): canonical light :root block in clinical-warm.css (issue #100 second half)"`

### Task 15: Drift gate in `check-static-site.mjs`

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` (insert a new section after the shell-scan block added in Task 10; if Batch 3 has not merged yet, insert after the `legacyMetadataPaths` summary block instead)

**Interfaces:**
- Produces: HARD check — for every built tool page AND `index.html`, any token in the page's first `:root{…}` block that also appears in `clinical-warm.css`'s `:root` must have the identical value. Tokens a page omits are fine (linked stylesheet supplies them); token names not in the canonical block are ignored (tools with bespoke palettes like family-systems' `--ink`/`--teal` are untouched).

**Steps:**

- [ ] Add:

```js
/* ---------- 5d. light-token drift gate (issue #100 second half) ---------- */
// Canonical light palette single source: clinical-warm.css :root. A page may omit
// a token (the linked stylesheet supplies it) but may not redefine it differently —
// that is exactly how three different --text values came to ship simultaneously.
const canonCssPath = p('clinical-warm.css');
if (existsSync(canonCssPath)) {
  const canonRoot = (readFileSync(canonCssPath, 'utf8').match(/:root\{([^}]*)\}/) || [, ''])[1];
  const CANON_LIGHT = Object.fromEntries(
    [...canonRoot.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)].map(m => [m[1], m[2].toLowerCase()]),
  );
  const driftPages = [...toolFiles.map(f => [`tools/${f}`, p('tools', f)]), ['index.html', p('index.html')]];
  for (const [label, fp] of driftPages) {
    if (!existsSync(fp)) continue;
    const rootBlock = readFileSync(fp, 'utf8').match(/:root\{([^}]*)\}/);
    if (!rootBlock) continue;
    for (const m of rootBlock[1].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
      const canon = CANON_LIGHT[m[1]];
      if (canon && m[2].toLowerCase() !== canon) {
        H(`light-token drift in ${label}: ${m[1]}:${m[2]} (canonical ${canon} in clinical-warm.css) — issue #100`);
      }
    }
  }
}
```

- [ ] Build + gate both sites: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`. If the gate surfaces residual drifted tokens beyond the census six (possible in rp-*/preview pages for `--text-mid`-class tokens), harmonize each flagged SOURCE file to the canonical value exactly as in Task 13 and rebuild until both sites report `✓ PASS (hard:0 ...)`.
- [ ] Red path: `sed -i '' 's/--text:#3b332c/--text:#111111/' _build/ms3/tools/mse.html && node 13_Faculty_Resources/_automation/site_build/check-static-site.mjs _build/ms3; echo "exit=$?"` → expect `light-token drift in tools/mse.html: --text:#111111 (canonical #3b332c ...)` and exit=1; then rebuild clean.
- [ ] `node --test tests/*.test.mjs` → pass.
- [ ] Commit: `git add -A && git commit -m "feat(qa): hard-fail light-token drift against the canonical clinical-warm :root (issue #100)"`

**PR boundary:** branch `chore/ws4-light-tokens-single-source`, PR title **"Issue #100 second half: canonical light tokens in clinical-warm.css + drift gate (audit WS4 finding 10)"**. Depends on **#284 merged** (question-bank-practice.html edit) and preferably Batch 3 (shared checker region). CI: build-test-validate + smoke. Contingency: if the visual smoke spec fails on the subtle text-color shift in the 5 harmonized tools, trigger the "Refresh visual baselines" workflow_dispatch (Ubuntu/Chromium) — never regenerate on macOS. Close issue #100 from the PR body (`Closes #100`) — its first half (dark tokens) shipped earlier.

---

## Batch 6 — Nav is data: generate both navs from `site_manifest.json` *(land LAST)*

**Design note:** rather than inventing a merged single-list schema with per-audience overrides (the two navs differ structurally: sections, ordering, resident-only items, `_HIDDEN_INHERITED`, intentional per-audience retitles like `welcome.md`), the manifest gains the two nav trees as data — `"nav": {"ms3": [...], "res": [...]}` plus a shared `"navOrder"`. This makes page addition/retitling a JSON-only, faculty-reviewable change, keeps the orphan gates untouched, and is verifiable byte-for-byte because Batch 1 made builds reproducible. The Case of the Week section stays registry-driven: the builders append per-week items from `cotw_registry.json` at build time. TOOLKW search keywords intentionally stay in `common.py` (its own header notes their real home is `tool_registry.json.searchKeywords` — a separate follow-on).

### Task 16: Capture the current navs into `site_manifest.json` (byte-faithful)

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/site_manifest.json` (adds `navOrder` + `nav` keys; update `_note`)

**Steps:**

- [ ] Confirm Batch 1 merged (reproducibility is this batch's verification instrument) and `gh pr view 263 --json state` — if #263 merged since, re-verify the nav literal line anchors first. `git checkout -b refactor/ws4-nav-as-data origin/main`.
- [ ] Build both sites on the CLEAN branch tip and save the baseline: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res && SCRATCH="${SCRATCHPAD:-/tmp}" && cp -R _build/ms3 "$SCRATCH/nav-base-ms3" && cp -R _build/res "$SCRATCH/nav-base-res"`
- [ ] Lift the live nav.json trees into the manifest with this one-off (byte-faithful by construction — it captures exactly what the Python literals emit today, minus the registry-driven CotW items):

```bash
python3 - <<'EOF'
import json
reg = json.load(open("08_Cases_and_Simulation/case-of-the-week/cotw_registry.json"))["weeks"]
def slug(w, lvl): return "cotw_%s_%s_%s.md" % (w["date"].replace("-", ""), w["topic"], lvl)
def strip_cotw(nav, lvl):
    dyn = {slug(w, lvl) for w in reg}
    for sec in nav:
        if sec["section"] == "Case of the Week":
            sec["items"] = [it for it in sec["items"] if it["f"] not in dyn]
    return nav
ms3 = strip_cotw(json.load(open("_build/ms3/nav.json")), "ms3")
res = strip_cotw(json.load(open("_build/res/nav.json")), "res")
mpath = "13_Faculty_Resources/_automation/site_build/site_manifest.json"
m = json.load(open(mpath, encoding="utf-8"))
m["navOrder"] = ["Welcome and Orientation","Start the Encounter","Understand the Problem","Assess Safety and Acuity","Make a Plan","Communicate with Patients","Work with Family and Systems","Present and Work with the Team","Practice and Exam Prep","Case of the Week","Evidence and Reference","Feedback"]
m["nav"] = {"ms3": ms3, "res": res}
m["_note"] = m["_note"].replace(
    "(and in nav, inside build_deploy.py)",
    "(and in the nav trees below — nav is data as of 2026-08; build_deploy.py/resident_section.py only append registry-driven Case of the Week items)",
)
open(mpath, "w", encoding="utf-8").write(json.dumps(m, indent=1, ensure_ascii=False) + "\n")
print("captured: ms3 sections", len(ms3), "| res sections", len(res))
EOF
```

Expected output: `captured: ms3 sections 12 | res sections 12`.
- [ ] Sanity-diff the manifest: `git diff --stat 13_Faculty_Resources/_automation/site_build/site_manifest.json` (large addition, no deletions beyond `_note`). Verify JSON: `python3 -c "import json; json.load(open('13_Faculty_Resources/_automation/site_build/site_manifest.json'))" && echo ok`.
- [ ] Commit: `git add -A && git commit -m "refactor(build): capture ms3+res nav trees as data in site_manifest.json"`

### Task 17: `common.nav_from_manifest()` + tests

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py` (needs `import json` in its import block)

**Interfaces:**
- Produces: `common.nav_from_manifest(manifest, site, cotw_items) -> list` — deep-copies `manifest["nav"][site]`, appends `cotw_items` (list of `{"t","f","k"}` dicts) to the "Case of the Week" section, sorts sections by `manifest["navOrder"]` (unknown sections last — preserving pre-refactor behavior). Never mutates the manifest.
- Consumed by: Task 18 (both builders).

**Steps:**

- [ ] Failing tests (append to `test_common.py`):

```python
class TestNavFromManifest(unittest.TestCase):
    MANIFEST = {
        "navOrder": ["A", "Case of the Week", "B"],
        "nav": {
            "ms3": [
                {"section": "B", "items": [{"t": "Beta", "f": "b.md", "k": "md"}]},
                {"section": "Case of the Week",
                 "items": [{"t": "Index", "f": "cotw_index.md", "k": "md"}]},
                {"section": "A",
                 "items": [{"t": "Alpha", "f": "a.html", "k": "tool", "hidden": True}]},
            ]
        },
    }

    def test_orders_sections_and_appends_registry_cotw_items(self):
        nav = common.nav_from_manifest(
            self.MANIFEST, "ms3", [{"t": "Week", "f": "cotw_20260801_x_ms3.md", "k": "md"}]
        )
        self.assertEqual([s["section"] for s in nav], ["A", "Case of the Week", "B"])
        self.assertEqual(
            [it["f"] for it in nav[1]["items"]],
            ["cotw_index.md", "cotw_20260801_x_ms3.md"],
        )
        self.assertTrue(nav[0]["items"][0].get("hidden"))

    def test_does_not_mutate_the_manifest(self):
        before = json.dumps(self.MANIFEST, sort_keys=True)
        common.nav_from_manifest(self.MANIFEST, "ms3", [{"t": "W", "f": "w.md", "k": "md"}])
        self.assertEqual(json.dumps(self.MANIFEST, sort_keys=True), before)
```

- [ ] Run: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → 2 errors (`nav_from_manifest` missing).
- [ ] Implement in `common.py` (add `import copy` to the import block):

```python
def nav_from_manifest(manifest, site, cotw_items):
    """Assemble a site's nav from site_manifest.json data.

    manifest["nav"][site] holds the static sections (nav is data, not code —
    2026-08 audit). Registry-driven Case of the Week items, built by the caller
    from cotw_registry.json, are appended to that section so the weekly
    automation still only touches the registry. Sections sort by
    manifest["navOrder"]; unknown sections sort last (pre-refactor behavior).
    """
    nav = copy.deepcopy(manifest["nav"][site])
    for sec in nav:
        if sec["section"] == "Case of the Week":
            sec["items"] = sec["items"] + list(cotw_items)
    order = manifest.get("navOrder", [])
    return sorted(nav, key=lambda s: order.index(s["section"]) if s["section"] in order else 999)
```

- [ ] Run to pass: `python3 13_Faculty_Resources/_automation/site_build/test_common.py` → `OK`.
- [ ] Commit: `git add -A && git commit -m "feat(build): common.nav_from_manifest — both navs assembled from manifest data"`

### Task 18: Rewire both builders; update gate messages, docs, and verify byte-identical output

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (nav literal block :307-321, helper defs `_md`/`_tool`/`_week_items`/`_tool_titles` :301-306, `HIDDEN_TOOLS` definition — re-grep, plus `_navorder`/`sorted` lines :322-324)
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py` (`_HIDDEN_INHERITED` :145-169, nav literal :170-188, `_navorder`/`sorted` :189-190)
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` (orphan messages :104-105)
- Modify: `CLAUDE.md` + `cp CLAUDE.md AGENTS.md` (the "registered here **and** in nav inside `build_deploy.py`" convention line)

**Steps:**

- [ ] In `build_deploy.py`: replace the entire `_tool_titles=...` through `nav=sorted(...)` region (helpers `_md`/`_tool`/`_week_items`, the 12-section `nav=[...]` literal, `_navorder`, and the `sorted` line — currently :301-324) with:

```python
nav=common.nav_from_manifest(_manifest,"ms3",[{"t":w["label"],"f":_cotw_slug(w,"ms3"),"k":"md"} for w in _cotw_weeks])
```

Then `grep -n 'HIDDEN_TOOLS\|_tool_titles\|_week_items\|def _md\|def _tool' 13_Faculty_Resources/_automation/site_build/build_deploy.py` — delete the now-dead `HIDDEN_TOOLS` set and any other orphaned helper if nothing else references them (0 remaining hits required).
- [ ] In `resident_section.py`: replace `_HIDDEN_INHERITED=[...]` + `nav=[...]` + `_navorder=[...]` + `nav=sorted(...)` (:145-190) with:

```python
_res_manifest=json.load(open(os.path.join(HERE,"site_manifest.json"),encoding="utf-8"))
nav=common.nav_from_manifest(_res_manifest,"res",[{"t":w["label"],"f":_cotw_slug(w,"res"),"k":"md"} for w in _cotw_weeks])
```

(keep the following `open(OUT+"/nav.json","w").write(json.dumps(nav))` line unchanged).
- [ ] In `check-static-site.mjs` :104-105, change both orphan messages from `— add to nav in build_deploy.py or resident_section.py` to `— register it in the nav trees in site_build/site_manifest.json`.
- [ ] **Byte-identical verification** (the load-bearing check): rebuild both sites and diff against the Task 16 baseline:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
diff -rq "$SCRATCH/nav-base-ms3" _build/ms3; echo "ms3=$?"
diff -rq "$SCRATCH/nav-base-res" _build/res; echo "res=$?"
# EXPECT: no output, ms3=0, res=0 — the refactor must be a pure representation change.
```

Any diff = a translation error in Task 16's capture or a helper-semantics mismatch; fix before proceeding (do NOT accept diffs).
- [ ] Update `CLAUDE.md`: change the "Where things live" bullet sentence `A new page must be registered here **and** in nav inside `build_deploy.py`, or the QA gate's orphaned-source check hard-fails the build.` to `A new page must be registered here — including the per-site nav trees now stored in this same file (nav is data; build_deploy.py/resident_section.py only append registry-driven Case of the Week items) — or the QA gate's orphaned-source check hard-fails the build.` Then run `cp CLAUDE.md AGENTS.md` (CI byte-parity gate).
- [ ] `node --test tests/*.test.mjs && python3 13_Faculty_Resources/_automation/site_build/test_common.py` → all pass.
- [ ] Commit: `git add -A && git commit -m "refactor(build): generate both navs from site_manifest.json — page addition is now a JSON-only change"`

**PR boundary:** branch `refactor/ws4-nav-as-data`, PR title **"Nav is data: both site navs generated from site_manifest.json (audit WS4 finding 12)"**. Sequence LAST in this workstream; if PR #263 is still open when this is ready, coordinate — both rewrite `build_deploy.py`/`resident_section.py`, and #263 (a failing draft mid-rebase) should rebase onto this, not the reverse, per the audit's sequencing analysis. CI: build-test-validate + smoke. PR body must include the byte-identical `diff -rq` evidence for both sites.
