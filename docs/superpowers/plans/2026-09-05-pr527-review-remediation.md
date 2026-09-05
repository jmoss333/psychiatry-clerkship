# PR #527 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 15 confirmed findings from the 2026-09-05 review of PR #527 (Six-Week Compass) so the PR's CI goes green, the Compass renders as designed, and the new gates stop fighting the repo's existing LFS, governance and stylesheet contracts.

**Architecture:** All changes stay inside the PR's own surface: `site_build/welcome_compass.py` (renderer + gates), the two build scripts, `frontdoor/frontdoor.css`, and the PR's tests. Nothing new is hard-coded that an existing single source already declares (`site_extras.py`, `check_lfs_media.py`, `curriculum.json`, `reviewed.json`). Audience-specific resident copy moves out of Python into a data file beside the resident Welcome source.

**Tech Stack:** Python 3.11 stdlib (unittest, html.parser), Node 20 `node:test`, Playwright smoke specs (not run here), plain CSS with container queries.

**Spec:** The review findings filed against PR #527 on 2026-09-05 (ReportFindings, 15 items). The PR's own design spec is `docs/superpowers/specs/2026-09-04-ms3-six-week-compass-design.md`; where this plan changes a contract the spec stated, the finding is the authority and the ruling is recorded in the SDD ledger.

## Global Constraints

- Work only in this worktree on branch `review-527`. Never `git push`; the controller pushes.
- Never commit `_build/`, `.superpowers/`, or any Git-LFS media file. `git status` must show only the files each task names.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `frontdoor.css` is shared byte-for-byte by both learner sites and must keep passing `assert.doesNotMatch(fd, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i)` — no audience word anywhere in it, including comments.
- Crisis contacts live only in `crisis_resources.json`; no dose literals; no instrument item text; no new `localStorage` keys; no `/Users` paths in tracked `.py`.
- Do not edit `docs/superpowers/specs/*` or the PR's plan; do not edit `CLAUDE.md`/`AGENTS.md`.
- Python must stay 3.11-compatible; `fd_*.js` stays ES5 (not touched by this plan).
- After any task, these must be green before committing: `python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py`, `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py`, `(cd 13_Faculty_Resources/_automation/site_build && python3 test_frontdoor_catalog.py)`, `node --test tests/*.test.mjs faculty-console/*.test.mjs`. Task 7 additionally requires `python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check`.
- Playwright smoke specs are edited for selector/expectation parity but are NOT run locally (they need a built site and a server); keep their structure intact.
- Paths below are relative to the worktree root. `SB` = `13_Faculty_Resources/_automation/site_build`.

---

### Task 1: Rename the Compass CSS hooks to `fd-compass`, fix list markers and cascade, make week headings self-describing, delete the CSS parser

Findings addressed: #4 (list markers), #5 (dead spacing), #9 (audience-named hooks), #10 (over-rejecting CSS guard), #15 (heading/link split).

**Files:**
- Modify: `SB/welcome_compass.py` (render_compass, forbidden-copy constants, assert_resident_output, delete `_assert_exact_resident_frontdoor_css`)
- Modify: `SB/frontdoor/frontdoor.css` (replace the Compass block at lines ~498-569; new block goes AFTER `.fd-article__body blockquote{...}` near line 619)
- Modify: `tests/fd-tokens.test.mjs` (restore to `origin/main`'s copy)
- Modify: `SB/test_welcome_compass.py`, `tests/welcome-compass-contract.test.mjs`, `tests/smoke/front-door.spec.js` (selectors + expected fragment)

**Interfaces:**
- Produces: `welcome_compass.COMPASS_ROOT_OPENER = '<div data-fd-compass-root>'`; the exact fragment below; CSS class names `fd-compass`, `fd-compass__title`, `fd-compass__weeks`, `fd-compass__week`, `fd-compass__heading`, `fd-compass__kicker`, `fd-compass__link`; data hooks `data-fd-compass-root|safety|scope|prompt|weeks|week|link|orientation` and `data-fd-compass` on the section; heading id `fd-compass-title`; container name `fd-compass`.

- [ ] **Step 1: Update the expected fragment in the Python test first (it must fail)**

In `SB/test_welcome_compass.py`, replace `EXPECTED_FRAGMENT` with exactly:

```python
EXPECTED_FRAGMENT = (
    '<div data-fd-compass-root>'
    '<aside data-fd-compass-safety role="note">'
    '<p>If you are worried about immediate safety, tell the resident or attending now. '
    'Do not wait for rounds. Do not carry it alone.</p>'
    '<a href="?page=orientation.md">Open the Orientation Packet</a></aside>'
    '<p data-fd-compass-scope>This map supports orientation, supervised practice, and reflection. '
    'It is not a checklist, clinical protocol, or measure of readiness. Using or viewing this map '
    'does not establish competence, entrustment, or permission to act independently.</p>'
    '<section class="fd-compass" data-fd-compass aria-labelledby="fd-compass-title">'
    '<h2 class="fd-compass__title" id="fd-compass-title">Six-Week Compass</h2>'
    '<ol class="fd-compass__weeks" data-fd-compass-weeks>'
    '<li class="fd-compass__week" data-fd-compass-week="1">'
    '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week 1</span> Foundations &amp; the MSE</h3>'
    '<a class="fd-compass__link" data-fd-compass-link href="?page=week1.md">Open Week 1</a></li>'
    '<li class="fd-compass__week" data-fd-compass-week="2">'
    '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week 2</span> Mood, Psychosis &amp; Pharm</h3>'
    '<a class="fd-compass__link" data-fd-compass-link href="?page=week2.md">Open Week 2</a></li>'
    '<li class="fd-compass__week" data-fd-compass-week="3">'
    '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week 3</span> Psychotherapy &amp; Personality</h3>'
    '<a class="fd-compass__link" data-fd-compass-link href="?page=week3.md">Open Week 3</a></li>'
    '<li class="fd-compass__week" data-fd-compass-week="4">'
    '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week 4</span> Family Systems &amp; EE</h3>'
    '<a class="fd-compass__link" data-fd-compass-link href="?page=week4.md">Open Week 4</a></li>'
    '<li class="fd-compass__week" data-fd-compass-week="5">'
    '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week 5</span> Acute &amp; Emergency</h3>'
    '<a class="fd-compass__link" data-fd-compass-link href="?page=week5.md">Open Week 5</a></li>'
    '<li class="fd-compass__week" data-fd-compass-week="6">'
    '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week 6</span> Integration &amp; Exam</h3>'
    '<a class="fd-compass__link" data-fd-compass-link href="?page=week6.md">Open Week 6</a></li>'
    '</ol></section>'
    '<p data-fd-compass-prompt>Choose the week or task you are preparing to discuss with your '
    'supervising team.</p>'
    '<a data-fd-compass-orientation href="?tool=orientation-video.html">Optional: watch the '
    'captioned orientation overview (transcript available)</a>'
    '</div>'
)
```

Then replace every remaining `ms3-compass` string in that test file with the matching `fd-compass` form (`data-ms3-compass-root` → `data-fd-compass-root`, etc.).

- [ ] **Step 2: Run the Python suite; the exact-shape test must fail**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -5`
Expected: FAIL on `test_renders_the_exact_semantic_compass_shape` (old markup still rendered).

- [ ] **Step 3: Update the renderer**

In `SB/welcome_compass.py`:

```python
COMPASS_ROOT_OPENER = '<div data-fd-compass-root>'
```

and make `render_compass` produce exactly the fragment above:

```python
def render_compass(cards, safety_text: str) -> str:
    items = "".join(
        (
            '<li class="fd-compass__week" data-fd-compass-week="%d">'
            '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week %d</span> %s</h3>'
            '<a class="fd-compass__link" data-fd-compass-link href="?page=%s">Open Week %d</a></li>'
            % (card.n, card.n, escape(card.title, quote=True), escape(card.landing_ref, quote=True), card.n)
        )
        for card in cards
    )
    return (
        COMPASS_ROOT_OPENER
        + '<aside data-fd-compass-safety role="note">'
        '<p>%s</p><a href="?page=orientation.md">%s</a></aside>'
        '<p data-fd-compass-scope>%s</p>'
        '<section class="fd-compass" data-fd-compass aria-labelledby="fd-compass-title">'
        '<h2 class="fd-compass__title" id="fd-compass-title">%s</h2>'
        '<ol class="fd-compass__weeks" data-fd-compass-weeks>%s</ol></section>'
        '<p data-fd-compass-prompt>%s</p>'
        '<a data-fd-compass-orientation href="?tool=orientation-video.html">%s</a>'
        '</div>'
        % (escape(safety_text, quote=True), SAFETY_ORIENTATION_LINK, SCOPE_COPY,
           COMPASS_HEADING, items, PROMPT_COPY, OPTIONAL_VIDEO_COPY)
    )
```

In `_CompassStructureParser.handle_starttag` and `assert_ms3_output`, replace the literal `"data-ms3-compass-root"` with `"data-fd-compass-root"`.

- [ ] **Step 4: Make the resident isolation scan attribute-agnostic and delete the stylesheet gate**

In `assert_resident_output`, delete the call to `_assert_exact_resident_frontdoor_css` and the whole `_assert_exact_resident_frontdoor_css` function. Replace the forbidden-copy loop with one that applies the same needles to every text output (no `frontdoor.css` carve-out):

```python
    forbidden_copy = (COMPASS_ROOT_OPENER, SCOPE_COPY, PROMPT_COPY, COMPASS_HEADING, OPTIONAL_VIDEO_COPY)
    for relative_path, text in text_outputs.items():
        for forbidden in forbidden_copy:
            if forbidden in text:
                raise CompassContractError(
                    "resident built output contains MS3 Compass copy: %s (%s)" % (forbidden, relative_path)
                )
```

(The stylesheet contains the selector text `[data-fd-compass-root]`, never the rendered opener `<div data-fd-compass-root>`, so it passes without a special case. Task 3 later converts this scan to bytes; keep the needle set.)

- [ ] **Step 5: Update the Python tests for the removed gate**

In `SB/test_welcome_compass.py`:
- Delete `test_resident_output_requires_an_exact_real_canonical_frontdoor_stylesheet` and `test_resident_output_rejects_scope_and_prompt_copy_even_in_the_exact_stylesheet`, the `CANONICAL_FRONTDOOR_CSS` constant, and the `Path(root, "frontdoor.css").write_bytes(CANONICAL_FRONTDOOR_CSS.read_bytes())` line in `write_complete_resident_output`.
- Replace `test_resident_output_rejects_a_compass_root_in_a_second_stylesheet` with:

```python
    def test_resident_output_allows_compass_selectors_but_rejects_the_rendered_root(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_resident_output(root)
            write_output_file(root, "frontdoor.css", b"[data-fd-compass-root]{display:grid}")
            self.assertIsNone(welcome_compass.assert_resident_output(root))
        with tempfile.TemporaryDirectory() as root:
            write_complete_resident_output(root)
            write_output_file(root, "assets/second.css", welcome_compass.COMPASS_ROOT_OPENER.encode("utf-8"))
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "second.css"):
                welcome_compass.assert_resident_output(root)
```

- In every remaining test that writes `b'<div data-ms3-compass-root>Compass</div>'`, use `welcome_compass.COMPASS_ROOT_OPENER.encode("utf-8") + b"Compass</div>"`.

- [ ] **Step 6: Run the Python suite until green**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -3`
Expected: `OK`.

- [ ] **Step 7: Replace the CSS block**

In `SB/frontdoor/frontdoor.css`, delete everything from the line `[data-ms3-compass-root]{` through the closing `}` of the `@media (pointer:coarse){...}` block that follows the two `@container ms3-compass` rules (the whole block the PR inserted before `.fd-reader{animation:...}`). Then insert this block immediately AFTER the `.fd-article__body blockquote{...}` rule (search for `.fd-article__body blockquote`):

```css
/* ═══ Six-Week Compass (build-injected into the six-week Welcome by welcome_compass.py) ═══
   Two-class selectors (0,2,x) deliberately outrank the `.fd-article__body h2/h3/ol/li` (0,1,1)
   reader rules above, which otherwise win the cascade and silently discard this spacing. */
[data-fd-compass-root]{display:grid;gap:18px;margin:0 0 24px}
[data-fd-compass-root] a{scroll-margin-block:6rem calc(6rem + env(safe-area-inset-bottom))}
[data-fd-compass-safety]{margin:0;padding:14px 16px;border:1px solid var(--fd-line-strong);border-left:4px solid var(--fd-danger);border-radius:10px;background:var(--fd-danger-wash);color:var(--fd-text)}
[data-fd-compass-safety] p,[data-fd-compass-scope],[data-fd-compass-prompt]{margin:0}
.fd-compass{container:fd-compass / inline-size}
.fd-compass .fd-compass__title{margin:0 0 12px}
.fd-compass .fd-compass__weeks{display:grid;grid-template-columns:minmax(0,1fr);gap:.75rem;margin:0;padding:0;list-style:none}
.fd-compass .fd-compass__week{min-width:0;margin:0;padding:14px;border:1px solid var(--fd-line);border-top:3px solid var(--fd-terracotta);border-radius:10px;background:var(--fd-surface-warm);box-shadow:var(--fd-shadow-sm)}
.fd-compass .fd-compass__heading{margin:0 0 10px;overflow-wrap:anywhere}
.fd-compass .fd-compass__kicker{display:block;margin:0 0 4px;color:var(--fd-terracotta-dark);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
[data-fd-compass-safety] a,[data-fd-compass-link],[data-fd-compass-orientation]{display:inline-flex;align-items:center}
@container fd-compass (min-width:22rem){.fd-compass .fd-compass__weeks{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container fd-compass (min-width:30rem){.fd-compass .fd-compass__weeks{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (pointer:coarse){[data-fd-compass-safety] a,[data-fd-compass-link],[data-fd-compass-orientation]{min-inline-size:44px;min-block-size:44px}}
```

Verify: `grep -c "ms3-compass" SB/frontdoor/frontdoor.css` prints `0`, and `grep -ciE "MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford" SB/frontdoor/frontdoor.css` prints `0`.

- [ ] **Step 8: Restore the one-line audience-token test**

Run: `git show origin/main:tests/fd-tokens.test.mjs > tests/fd-tokens.test.mjs`
Verify the restored file contains `test('frontdoor.css carries no audience token'` and no `lexCss`.

- [ ] **Step 9: Update the Node contract test and the smoke spec**

In `tests/welcome-compass-contract.test.mjs`, set `EXPECTED_COMPASS_FRAGMENT` to the same string as the Python `EXPECTED_FRAGMENT` above (JS string concatenation, identical bytes). Confirm `assertNoGovernanceLeaks` still passes on it (it forbids `/\b(?:data|name|id)-?(?:progress|score|streak|completion)\s*=/i` — the new attributes do not match).

In `tests/smoke/front-door.spec.js`, rename every selector: `[data-ms3-compass-root]` → `[data-fd-compass-root]`, `data-ms3-compass-safety` → `data-fd-compass-safety`, `data-ms3-compass-scope` → `data-fd-compass-scope`, `data-ms3-compass` (bare, on the section) → `data-fd-compass`, `data-ms3-compass-prompt` → `data-fd-compass-prompt`, `data-ms3-compass-orientation` → `data-fd-compass-orientation`, `[data-ms3-compass-link]` → `[data-fd-compass-link]`, `[data-ms3-compass-weeks] > li` → `[data-fd-compass-weeks] > li`, `data-ms3-compass-week` → `data-fd-compass-week`, `section[aria-labelledby="ms3-compass-title"]` → `section[aria-labelledby="fd-compass-title"]`, `.ms3-compass` → `.fd-compass`, `.ms3-compass__weeks` → `.fd-compass__weeks`. In the `expectedWeeks` table rename the `title` key to `heading` and use the full heading text, e.g. `{ n: '1', heading: 'Week 1 Foundations & the MSE', href: '?page=week1.md', label: 'Open Week 1' }` for all six weeks (heading = `Week N` + one space + title), and read it with `heading: row.querySelector('h3')?.textContent.replace(/\s+/g, ' ').trim()`. Verify: `grep -c "ms3-compass" tests/smoke/front-door.spec.js` prints `0`. Run `node --check tests/smoke/front-door.spec.js`.

- [ ] **Step 10: Run all gates for this task**

Run: `python3 SB/test_welcome_compass.py && node --test tests/*.test.mjs faculty-console/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: Python `OK`; Node `# fail 0`.

- [ ] **Step 11: Commit**

```bash
git add SB/welcome_compass.py SB/test_welcome_compass.py SB/frontdoor/frontdoor.css tests/fd-tokens.test.mjs tests/welcome-compass-contract.test.mjs tests/smoke/front-door.spec.js
git commit -m "fix(ui): audience-neutral fd-compass hooks; list markers, cascade, week headings

Rename the shared-stylesheet hooks to fd-compass so frontdoor.css carries no audience
token and the one-line guard returns; the hand-rolled CSS parser and the resident
stylesheet byte-equality gate go with it. Cards drop the UA list markers, Compass
spacing now outranks the reader rules, and each week heading names its number.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Remove the transient-state and byte-exact prose pins from the build-gating suites

Finding addressed: #3.

**Files:**
- Modify: `tests/welcome-compass-contract.test.mjs`
- Modify: `faculty-console/content-universe.test.mjs:320-325`

**Interfaces:** none produced; later tasks (5, 6, 7) rely on these pins being gone.

- [ ] **Step 1: Remove the Welcome prose and topic_meta pins**

In `tests/welcome-compass-contract.test.mjs` delete: the `EXPECTED_WELCOME` constant; the test `"Welcome matches the approved retained-content shape exactly"`; the `EXPECTED_WELCOME_SUMMARY` and `BASELINE_WELCOME_NEIGHBORS` constants; the test `"Welcome metadata uses the approved summary and preserves neighboring fields"`; the `topicMetaPath`/`topicMeta` reads if nothing else uses them.

- [ ] **Step 2: Remove the pending-ledger pin**

In the same file delete: the test `"Welcome governance is pending without claimed human approval"`, the `assertIsoCalendarDate` helper, the test `"pending review date guard rejects impossible calendar dates"`, and the `reviewedPath`/`reviewed` reads if now unused. (The ledger schema in `13_Faculty_Resources/reviewed.schema.json` already forces a pending record to carry `by: "Pending faculty review"` and a reason, and forbids that `by` on a reviewed record; `validate_registry_schemas.py` runs it in CI.)

Keep every other test: marker position/count, retired-intro removal, media manifest, Single Safety Rule extraction, governance-leak guards.

- [ ] **Step 3: Drop the incidental pending pin in the faculty-console test**

In `faculty-console/content-universe.test.mjs` replace:

```js
  // Task 3 made Welcome pending, but it is already visible to even the former reader.
  assert.equal(REVIEWED['welcome.md']?.status, 'pending');
  assert.ok(manifestOnly.has('welcome.md'));
```

with:

```js
  // Welcome ships from the shared manifest, so it is visible even to the former reader
  // whatever its review status is today.
  assert.ok(manifestOnly.has('welcome.md'));
```

- [ ] **Step 4: Run the gates**

Run: `node --test tests/*.test.mjs faculty-console/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add tests/welcome-compass-contract.test.mjs faculty-console/content-universe.test.mjs
git commit -m "test(ms3): stop pinning Welcome's pending ledger state and prose in the build gate

Attesting the page (the action the PR requests) or editing one word of Welcome copy
turned the pre-build node suite red and aborted both site builds. The schema already
guards the pending/reviewed record shape.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Honour the repo's soft LFS contexts, drop the LFS provenance unit test, scan the built tree as bytes, balance void elements

Findings addressed: #1, #2, #11, #14.

**Files:**
- Modify: `SB/welcome_compass.py` (`require_real_files`, `_CompassStructureParser`, replace `_inspect_completed_output`/`_assert_no_retired_intro`, `assert_ms3_output`, `assert_resident_output`; delete `KNOWN_BINARY_SUFFIXES`)
- Modify: `SB/test_welcome_compass.py`

**Interfaces:**
- Consumes: `check_lfs_media.LFS_HEADER`, `check_lfs_media.is_soft_context()`, `check_lfs_media.MEDIA_EXTS` (all in `SB/check_lfs_media.py`, importable without side effects).
- Produces: `_scan_completed_output(out_dir, forbidden: dict[bytes, str]) -> set[str]`; `VOID_ELEMENTS`.

- [ ] **Step 1: Write the failing tests**

Add to `SB/test_welcome_compass.py` (add `import io` and `import os` at the top):

```python
    def test_lfs_pointer_stubs_warn_instead_of_failing_in_soft_contexts(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, "stub.mp4").write_bytes(welcome_compass.LFS_HEADER + b" oid sha256:abc")
            Path(root, "real.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42")
            with patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "CONTEXT": ""}), \
                    patch("sys.stdout", new_callable=io.StringIO) as out:
                self.assertIsNone(welcome_compass.require_real_files(root, ["stub.mp4", "real.mp4"]))
            self.assertIn("stub.mp4", out.getvalue())
            with patch.dict(os.environ, {"GITHUB_ACTIONS": "", "CONTEXT": "deploy-preview"}), \
                    patch("sys.stdout", new_callable=io.StringIO):
                self.assertIsNone(welcome_compass.require_real_files(root, ["stub.mp4"]))
            with patch.dict(os.environ, {"GITHUB_ACTIONS": "", "CONTEXT": "production"}):
                with self.assertRaisesRegex(welcome_compass.CompassContractError, "stub.mp4"):
                    welcome_compass.require_real_files(root, ["stub.mp4", "real.mp4"])
            with patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}):
                with self.assertRaisesRegex(welcome_compass.CompassContractError, "missing.mp4"):
                    welcome_compass.require_real_files(root, ["missing.mp4"])

    def test_lfs_policy_is_imported_from_the_site_wide_gate(self):
        source = Path(welcome_compass.__file__).read_text(encoding="utf-8")
        self.assertIn("from check_lfs_media import", source)
        self.assertNotIn('b"version https://git-lfs"', source)

    def test_structure_parser_balances_void_elements(self):
        fragment = '<div data-fd-compass-root><p>a<br>b<img src="x"><hr/></p></div>'
        alone = welcome_compass._CompassStructureParser()
        embedded = welcome_compass._CompassStructureParser()
        alone.feed(fragment)
        alone.close()
        embedded.feed("<p>before</p>" + fragment + "<p>after</p><h2>x</h2>")
        embedded.close()
        self.assertEqual(alone.compasses, embedded.compasses)
        self.assertEqual(alone.depth, 0)

    def test_resident_output_accepts_binary_output_of_any_suffix_but_scans_it_for_needles(self):
        for relative_path in ("media/image.png", "assets/blob.unknown", "audio/.DS_Store"):
            with self.subTest(binary=relative_path), tempfile.TemporaryDirectory() as root:
                write_complete_resident_output(root)
                write_output_file(root, relative_path, b"\x00\x00\x00\x01Bud1\xff\xfe\x00\x80")
                self.assertIsNone(welcome_compass.assert_resident_output(root))
        with tempfile.TemporaryDirectory() as root:
            write_complete_resident_output(root)
            write_output_file(root, "assets/blob.unknown", b"\xff\xfe" + welcome_compass.COMPASS_ROOT_OPENER.encode("utf-8"))
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "blob.unknown"):
                welcome_compass.assert_resident_output(root)
```

Delete `test_retained_intro_provenance_files_remain_real_source_files`, the `RETIRED_INTRO_PATHS` constant, and `test_resident_output_skips_known_binaries_but_rejects_unknown_non_utf8_output`. In `test_completed_tree_walk_errors_fail_closed_with_the_unreadable_path` replace `welcome_compass._inspect_completed_output(root)` with `welcome_compass._scan_completed_output(root, {})`.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `python3 SB/test_welcome_compass.py 2>&1 | grep -E "^(FAIL|ERROR):" | head`
Expected: the four new tests fail/error (ImportError on `_scan_completed_output`, AssertionError on the LFS and parser tests).

- [ ] **Step 3: Implement the soft-context gate**

In `SB/welcome_compass.py` replace `LFS_HEADER = b"version https://git-lfs"` with the import and rewrite `require_real_files`:

```python
from check_lfs_media import LFS_HEADER, MEDIA_EXTS, is_soft_context
```

```python
def require_real_files(root, relative_paths) -> None:
    """Every path must be a real, non-empty, readable regular file.

    A Git-LFS pointer stub is an error in production and a printed warning in the soft
    contexts check_lfs_media.is_soft_context() names (GitHub Actions' lfs:false checkout,
    Netlify deploy previews): those contexts ship stubs on purpose and the site-wide LFS
    gate is already soft there. Missing, empty, directory, symlink and unreadable paths
    always fail.
    """
    invalid, stubs = [], []
    for relative_path in relative_paths:
        path = os.path.join(root, relative_path)
        try:
            metadata = os.lstat(path)
            if (
                stat.S_ISLNK(metadata.st_mode)
                or not stat.S_ISREG(metadata.st_mode)
                or metadata.st_size == 0
                or metadata.st_mode & 0o444 == 0
            ):
                invalid.append(relative_path)
                continue
            with open(path, "rb") as handle:
                if handle.read(len(LFS_HEADER)) == LFS_HEADER:
                    stubs.append(relative_path)
        except OSError:
            invalid.append(relative_path)
    if stubs and is_soft_context():
        print("WARN (soft LFS context): Git-LFS pointer stub(s) among required Compass files: "
              + ", ".join(stubs))
    else:
        invalid.extend(stubs)
    if invalid:
        raise CompassContractError("MS3 Compass required files are invalid: " + ", ".join(invalid))
```

- [ ] **Step 4: Balance void elements in the structure parser**

```python
VOID_ELEMENTS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
})


class _CompassStructureParser(HTMLParser):
    """Record real element/text events; comments and escaped code cannot supply a root."""

    def __init__(self):
        super().__init__()
        self.compasses = []
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        is_root = any(name == "data-fd-compass-root" for name, _ in attrs)
        if is_root:
            self.compasses.append([])
            self.depth = 0
        if self.compasses and (self.depth or is_root):
            self.compasses[-1].append(("start", tag, attrs))
            if tag not in VOID_ELEMENTS:
                self.depth += 1

    def handle_endtag(self, tag):
        if tag in VOID_ELEMENTS:
            return
        if self.depth:
            self.compasses[-1].append(("end", tag))
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.compasses[-1].append(("text", data))
```

(HTMLParser's default `handle_startendtag` calls `handle_starttag` then `handle_endtag`, so `<hr/>` is balanced by the void short-circuit in `handle_endtag`.)

- [ ] **Step 5: Replace the decoding walker with a byte scan**

Delete `KNOWN_BINARY_SUFFIXES`, `_inspect_completed_output` and `_assert_no_retired_intro`. Add:

```python
def _retired_needles():
    return {name.encode("utf-8"): "retired intro reference " + name for name in RETIRED_INTRO_FILENAMES}


def _scan_completed_output(out_dir, forbidden):
    """Walk every built file once as bytes; return the relative paths seen.

    `forbidden` maps a byte needle to the label reported when a file contains it. No
    decoding: the served tree holds audio, fonts, archives and suffix-less files, and an
    isolation scan must not fail on a file merely for being binary. Media files
    (check_lfs_media.MEDIA_EXTS) are still walked for names but not searched — they cannot
    carry a markup or filename reference.
    """
    files = set()
    for path, relative_path in _iter_completed_output_files(out_dir):
        files.add(relative_path)
        if os.path.basename(path) in RETIRED_INTRO_FILENAMES:
            raise CompassContractError("built output contains retired intro file: " + relative_path)
        if os.path.splitext(path)[1].lower() in MEDIA_EXTS:
            continue
        try:
            with open(path, "rb") as handle:
                data = handle.read()
        except OSError as error:
            raise CompassContractError("built output file is unreadable: %s" % path) from error
        for needle, label in forbidden.items():
            if needle in data:
                raise CompassContractError("built output contains %s: %s" % (label, relative_path))
    return files
```

In `assert_ms3_output` replace `_assert_no_retired_intro(out_dir)` with `_scan_completed_output(out_dir, _retired_needles())`.

Rewrite `assert_resident_output`:

```python
def assert_resident_output(out_dir) -> None:
    require_real_files(out_dir, RESIDENT_ONBOARDING_PATHS)
    forbidden = dict(_retired_needles())
    for copy in (COMPASS_ROOT_OPENER, SCOPE_COPY, PROMPT_COPY, COMPASS_HEADING, OPTIONAL_VIDEO_COPY):
        forbidden[copy.encode("utf-8")] = "MS3 Compass copy: " + copy
    files = _scan_completed_output(out_dir, forbidden)
    for relative_path in MS3_OPTIONAL_ORIENTATION_PATHS:
        if relative_path in files:
            raise CompassContractError(
                "resident built output contains MS3 optional orientation package: " + relative_path
            )
    try:
        with open(os.path.join(out_dir, "content", "welcome.md"), encoding="utf-8") as handle:
            welcome = handle.read()
    except (OSError, UnicodeError) as error:
        raise CompassContractError("resident built Welcome is unreadable: content/welcome.md") from error
    _assert_resident_welcome_video(welcome)
```

- [ ] **Step 6: Run the suite until green**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -3`
Expected: `OK`. Also run `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py 2>&1 | tail -1` → `OK`.

- [ ] **Step 7: Commit**

```bash
git add SB/welcome_compass.py SB/test_welcome_compass.py
git commit -m "fix(build): Compass gates honour the repo's soft LFS contexts; byte-level output scan

require_real_files now imports the site-wide LFS policy (check_lfs_media) and warns
instead of aborting where the repo ships pointer stubs on purpose (GitHub Actions
lfs:false, deploy previews), which is what turned this PR's CI red. The retired
trailer's LFS state no longer gates every build, the built-tree scan no longer
decodes every unlisted file as UTF-8, and the structure parser balances void elements.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: One source for the orientation and onboarding media lists; fail closed and abort cleanly on the resident side

Findings addressed: #12, #13.

**Files:**
- Modify: `SB/site_extras.py` (add `RESIDENT_ONBOARDING_MEDIA`)
- Modify: `SB/welcome_compass.py` (derive `MS3_OPTIONAL_ORIENTATION_PATHS`, `RESIDENT_ONBOARDING_PATHS`)
- Modify: `SB/resident_section.py:33-53` (strip loop, onboarding copy) and its last lines (guarded final assert)
- Modify: `SB/build_deploy.py` (delete the post-`apply_tool_status` chmod + comment; guard the final assert)
- Modify: `SB/test_welcome_compass.py`

**Interfaces:**
- Produces: `site_extras.RESIDENT_ONBOARDING_MEDIA: list[tuple[str, str]]` of `(source path, built filename)`.

- [ ] **Step 1: Write the failing test**

```python
    def test_package_paths_derive_from_site_extras(self):
        from site_extras import MS3_ORIENT_VIDEO, RESIDENT_ONBOARDING_MEDIA
        self.assertEqual(
            welcome_compass.MS3_OPTIONAL_ORIENTATION_PATHS,
            tuple("tools/" + built for _src, built, _title in MS3_ORIENT_VIDEO),
        )
        self.assertEqual(
            welcome_compass.RESIDENT_ONBOARDING_PATHS,
            tuple("media/" + built for _src, built in RESIDENT_ONBOARDING_MEDIA),
        )
        self.assertEqual(
            [src for src, _built in RESIDENT_ONBOARDING_MEDIA],
            ["_prototypes/video-library/resident-onboarding.mp4",
             "_prototypes/video-library/resident-onboarding-poster.jpg"],
        )
```

Run: `python3 SB/test_welcome_compass.py 2>&1 | grep -E "^(FAIL|ERROR):"` → the new test errors (ImportError).

- [ ] **Step 2: Add the resident onboarding list to site_extras**

In `SB/site_extras.py` add `"RESIDENT_ONBOARDING_MEDIA"` to `__all__` and, after `MS3_EXTRA_TOOLS`:

```python
# ---- resident-only onboarding media ("Yours to Run.", ~87s, silent/kinetic-text) ----
# Copied by resident_section.py into <deploy>/media/; not a page. welcome_compass.py
# derives the resident output contract from this list, so it is declared once.
RESIDENT_ONBOARDING_MEDIA = [
    ("_prototypes/video-library/resident-onboarding.mp4", "resident-onboarding.mp4"),
    ("_prototypes/video-library/resident-onboarding-poster.jpg", "resident-onboarding-poster.jpg"),
]
```

- [ ] **Step 3: Derive the tuples in welcome_compass**

At module top of `SB/welcome_compass.py`:

```python
from site_extras import MS3_ORIENT_VIDEO, RESIDENT_ONBOARDING_MEDIA

MS3_OPTIONAL_ORIENTATION_PATHS = tuple(
    os.path.join("tools", built) for _src, built, _title in MS3_ORIENT_VIDEO
)
RESIDENT_ONBOARDING_PATHS = tuple(
    os.path.join("media", built) for _src, built in RESIDENT_ONBOARDING_MEDIA
)
```

Delete the two literal tuples and the `from site_extras import MS3_ORIENT_VIDEO` inside `validate_media_manifest` (use the module-level import).

- [ ] **Step 4: Resident build: iterate the shared lists, fail closed, abort cleanly**

In `SB/resident_section.py`:
- Replace the strip loop `for _f in ["orientation-video.html", ...]:` with `from site_extras import MS3_ORIENT_VIDEO` and `for _src,_f,_t in MS3_ORIENT_VIDEO:` (same body).
- Replace the `RESIDENT_VIDEO_MEDIA` list and its copy loop with:

```python
from site_extras import RESIDENT_ONBOARDING_MEDIA
os.makedirs(OUT+"/media",exist_ok=True)
# Fail closed (2026-09-05 review): assert_resident_output hard-requires these two files at
# the end of the build, so a silent WARN here only delayed the same failure by a full build.
common.copy_required_sources(RESIDENT_ONBOARDING_MEDIA, LIB, OUT+"/media", label="resident onboarding media")
```

- Replace the final line `welcome_compass.assert_resident_output(OUT)` with:

```python
try:
    welcome_compass.assert_resident_output(OUT)
except welcome_compass.CompassContractError as _compass_error:
    print("BUILD ABORTED — resident Compass isolation:", _compass_error)
    raise SystemExit(1)
```

- [ ] **Step 5: MS3 build: drop the chmod, guard the final assert**

In `SB/build_deploy.py` delete the two comment lines beginning `# apply_tool_status atomically rewrites` and the `os.chmod(os.path.join(OUT,"tools","orientation-video.html"),0o644)` line. Replace the trailing `welcome_compass.assert_ms3_output(...)` call with:

```python
try:
    welcome_compass.assert_ms3_output(OUT, _compass_cards, _safety_text, _orientation_built_paths)
except welcome_compass.CompassContractError as _compass_error:
    print("BUILD ABORTED — MS3 Compass output:", _compass_error)
    raise SystemExit(1)
```

- [ ] **Step 6: Run the gates**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -1 && python3 13_Faculty_Resources/_automation/test_validate_curriculum.py 2>&1 | tail -1 && node --test tests/*.test.mjs 2>&1 | grep -E "^# fail"`
Expected: `OK`, `OK`, `# fail 0`. Also `grep -n "orientation-video.html" SB/resident_section.py` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add SB/site_extras.py SB/welcome_compass.py SB/resident_section.py SB/build_deploy.py SB/test_welcome_compass.py
git commit -m "fix(build): declare orientation and onboarding media once; resident build fails closed

The optional orientation package and the resident onboarding trailer were each typed in
three places. Both now derive from site_extras; the resident copy step aborts on a
missing source instead of warning and failing a full build later; both final Compass
asserts report through the BUILD ABORTED convention.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Media-manifest rule: the orientation package may be recorded, never marked served

Finding addressed: #6.

**Files:**
- Modify: `SB/welcome_compass.py` (`validate_media_manifest`)
- Modify: `SB/test_welcome_compass.py`, `tests/welcome-compass-contract.test.mjs`

- [ ] **Step 1: Write the failing Python tests**

```python
    def orientation_entries(self, served):
        from site_extras import MS3_ORIENT_VIDEO
        return [{"file": src, "served": served} for src, _built, _title in MS3_ORIENT_VIDEO] + [
            {"file": "tools/" + built, "served": served} for _src, built, _title in MS3_ORIENT_VIDEO]

    def test_media_manifest_may_describe_the_orientation_package_but_not_mark_it_served(self):
        base = {"audio": [], "video": [{"file": "media/day-in-the-life.mp4", "poster": "poster.jpg", "served": True}]}
        self.assertIsNone(welcome_compass.validate_media_manifest(base))
        for group in ("audio", "video"):
            manifest = {**base, group: base[group] + self.orientation_entries(False)}
            self.assertIsNone(welcome_compass.validate_media_manifest(manifest))
            for entry in self.orientation_entries(True):
                with self.subTest(group=group, entry=entry["file"]):
                    manifest = {**base, group: base[group] + [entry]}
                    with self.assertRaisesRegex(welcome_compass.CompassContractError, "served"):
                        welcome_compass.validate_media_manifest(manifest)
        for broken in ({"video": []}, {"audio": [], "video": [7]}, []):
            with self.subTest(broken=broken):
                with self.assertRaises(welcome_compass.CompassContractError):
                    welcome_compass.validate_media_manifest(broken)
```

Run: `python3 SB/test_welcome_compass.py 2>&1 | grep -E "^(FAIL|ERROR):"` → the new test fails (`poster.jpg` currently rejected; served:false currently rejected).

- [ ] **Step 2: Implement**

```python
def validate_media_manifest(manifest) -> None:
    """The WP-13 accessibility manifest may describe the orientation package (caption and
    transcript status are exactly what it exists to record) but may not mark it served:
    production_canary.py probes every served entry and accepts media only under /audio/,
    /audio_oe/ or /media/, while this package ships under /tools/. Widening the canary's
    scope is a separate decision; until then a served:true row would fail every canary run.
    """
    if not isinstance(manifest, dict):
        raise CompassContractError("media manifest must be an object")
    identities = set()
    for source_path, built_name, _title in MS3_ORIENT_VIDEO:
        identities.update((source_path, os.path.join("tools", built_name)))
    for group in ("audio", "video"):
        entries = manifest.get(group)
        if not isinstance(entries, list):
            raise CompassContractError("media manifest must contain a %s list" % group)
        for entry in entries:
            if not isinstance(entry, dict):
                raise CompassContractError("media manifest %s entries must be objects" % group)
            if entry.get("served") is not True:
                continue
            for value in entry.values():
                if isinstance(value, str) and value in identities:
                    raise CompassContractError(
                        "media manifest marks the MS3 orientation package as served, "
                        "outside the canary's media scope: " + value
                    )
```

- [ ] **Step 3: Align the Node contract test**

In `tests/welcome-compass-contract.test.mjs`: build `optionalOrientationIdentities` from `sourcePath` and `` `tools/${builtName}` `` only (drop `basename(sourcePath)` and the `basename` import if unused). Replace the test `"every canonical MS3 orientation identity rejects a served-false manifest mutation"` with:

```js
test("orientation package rows are allowed unless marked served", () => {
  for (const identity of optionalOrientationIdentities) {
    const described = [...mediaManifest.video, { file: identity, served: false, captions: true }];
    assert.doesNotThrow(() => validateMediaManifest({ ...mediaManifest, video: described }));
    const served = [...mediaManifest.video, { file: identity, served: true }];
    assert.throws(
      () => validateMediaManifest({ ...mediaManifest, video: served }),
      /served/,
      `served orientation row must be rejected: ${identity}`,
    );
  }
});
```

Update the test name `"media manifest records exactly one unserved retired intro and no orientation package"` to `"media manifest records exactly one unserved retired intro"` (body unchanged).

- [ ] **Step 4: Run the gates**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -1 && node --test tests/welcome-compass-contract.test.mjs 2>&1 | grep -E "^# fail"`
Expected: `OK`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add SB/welcome_compass.py SB/test_welcome_compass.py tests/welcome-compass-contract.test.mjs
git commit -m "fix(media): let the accessibility manifest describe the orientation package

The gate rejected any manifest value equal to an orientation identity, bare basenames
included, so the one served captioned video could never be recorded and a generic
poster.jpg failed the build. It now enforces the design rule as stated: no served:true
orientation row while the canary's media scope excludes /tools/.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Resident Welcome summary as data; audience-neutral ledger reason

Finding addressed: #7.

**Files:**
- Create: `14_Tracks/Resident/resident_welcome.meta.json`
- Modify: `13_Faculty_Resources/reviewed.json` (welcome.md `reason`)
- Modify: `SB/welcome_compass.py` (`load_resident_welcome_overlay`, `project_resident_welcome`)
- Modify: `SB/resident_section.py` (the `_tm` projection call)
- Modify: `SB/test_welcome_compass.py`

**Interfaces:**
- Produces: `welcome_compass.RESIDENT_WELCOME_OVERLAY = "14_Tracks/Resident/resident_welcome.meta.json"`; `load_resident_welcome_overlay(lib_root) -> dict` with keys `tldr: str`, `points: list[str]`; `project_resident_welcome(topic_meta, overlay) -> dict` (returns a new topic_meta; governance is no longer a parameter or a return value).

- [ ] **Step 1: Write the failing tests**

Replace `test_resident_projection_preserves_pending_authority_and_other_metadata` and `test_resident_projection_never_replaces_an_unrelated_faculty_pending_reason` with:

```python
    def test_resident_projection_applies_the_overlay_and_keeps_other_metadata(self):
        meta = {"welcome.md": {"tldr": "Six-Week Compass", "points": ["Orientation Packet"],
                               "read": 3, "relatedTools": ["review.html"]},
                "other.md": {"tldr": "Keep this"}}
        overlay = {"tldr": "Start with the four-week Rotation Plan.", "points": ["Bring an agenda."]}
        original = copy.deepcopy(meta)
        projected = welcome_compass.project_resident_welcome(meta, overlay)
        self.assertEqual(projected["welcome.md"]["tldr"], overlay["tldr"])
        self.assertEqual(projected["welcome.md"]["points"], overlay["points"])
        self.assertEqual(projected["welcome.md"]["read"], 3)
        self.assertEqual(projected["welcome.md"]["relatedTools"], ["review.html"])
        self.assertEqual(projected["other.md"], meta["other.md"])
        self.assertEqual(meta, original)
        with self.assertRaisesRegex(welcome_compass.CompassContractError, "welcome.md"):
            welcome_compass.project_resident_welcome({"other.md": {}}, overlay)

    def test_resident_overlay_loads_from_the_tracked_data_file_and_fails_closed(self):
        repo_root = Path(__file__).resolve().parents[3]
        overlay = welcome_compass.load_resident_welcome_overlay(repo_root)
        self.assertIn("four-week", overlay["tldr"])
        self.assertNotIn("Compass", str(overlay))
        self.assertTrue(all(isinstance(point, str) and point.strip() for point in overlay["points"]))
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "overlay"):
                welcome_compass.load_resident_welcome_overlay(root)
            target = Path(root, welcome_compass.RESIDENT_WELCOME_OVERLAY)
            target.parent.mkdir(parents=True)
            for broken in ('{"tldr": " ", "points": ["x"]}', '{"tldr": "ok", "points": []}',
                           '{"tldr": "ok", "points": [1]}', 'not json'):
                target.write_text(broken, encoding="utf-8")
                with self.subTest(broken=broken):
                    with self.assertRaisesRegex(welcome_compass.CompassContractError, "overlay"):
                        welcome_compass.load_resident_welcome_overlay(root)
```

Run: `python3 SB/test_welcome_compass.py 2>&1 | grep -E "^(FAIL|ERROR):"` → both new tests error.

- [ ] **Step 2: Create the data file**

`14_Tracks/Resident/resident_welcome.meta.json`:

```json
{
  "_note": "Resident-site overlay for the shared welcome.md topic_meta entry (tldr + points only). resident_section.py applies it through welcome_compass.project_resident_welcome; the MS3 entry in topic_meta.json is untouched. Keep this beside resident_welcome.md so a reviewer sees the page and its summary together.",
  "tldr": "Start with the four-week Rotation Plan, then use the core references and Resident Depth pages to prepare for patient care and supervision.",
  "points": [
    "Start with the 4-Week Rotation Plan.",
    "Use Resident Depth for advanced psychopharmacology, systems and med-legal work, supervision, and teaching.",
    "Bring an agenda to supervision and expect frequent, specific, behavior-based feedback."
  ]
}
```

- [ ] **Step 3: Implement the loader and projection**

In `SB/welcome_compass.py` replace `project_resident_welcome` with:

```python
RESIDENT_WELCOME_OVERLAY = os.path.join("14_Tracks", "Resident", "resident_welcome.meta.json")


def load_resident_welcome_overlay(lib_root):
    """Read the resident Welcome summary (tldr + points) from its tracked data file."""
    path = os.path.join(lib_root, RESIDENT_WELCOME_OVERLAY)
    try:
        with open(path, encoding="utf-8") as handle:
            overlay = json.load(handle)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise CompassContractError(
            "resident Welcome overlay is unreadable: " + RESIDENT_WELCOME_OVERLAY
        ) from error
    tldr = overlay.get("tldr") if isinstance(overlay, dict) else None
    points = overlay.get("points") if isinstance(overlay, dict) else None
    if not isinstance(tldr, str) or not tldr.strip():
        raise CompassContractError("resident Welcome overlay needs a non-empty tldr string")
    if (not isinstance(points, list) or not points
            or not all(isinstance(point, str) and point.strip() for point in points)):
        raise CompassContractError("resident Welcome overlay needs a non-empty list of point strings")
    return {"tldr": tldr, "points": list(points)}


def project_resident_welcome(topic_meta, overlay):
    """Return a copy of topic_meta whose welcome.md summary is the resident overlay's.

    Governance is deliberately not touched: the ledger's pending reason for welcome.md is
    audience-neutral at its source (reviewed.json), so nothing needs rewriting here.
    """
    meta = deepcopy(topic_meta)
    if not isinstance(meta.get("welcome.md"), dict):
        raise CompassContractError("topic_meta.json has no welcome.md entry to project")
    meta["welcome.md"].update({"tldr": overlay["tldr"], "points": list(overlay["points"])})
    return meta
```

- [ ] **Step 4: Wire the resident build and neutralise the ledger reason**

In `SB/resident_section.py` replace `_tm, _surface_governance = welcome_compass.project_resident_welcome(_tm, _surface_governance)` with:

```python
    try:
        _tm = welcome_compass.project_resident_welcome(_tm, welcome_compass.load_resident_welcome_overlay(LIB))
    except welcome_compass.CompassContractError as _overlay_error:
        print("BUILD ABORTED — resident Welcome overlay:", _overlay_error)
        raise SystemExit(1)
```

In `13_Faculty_Resources/reviewed.json` change welcome.md's `"reason"` to `"Welcome page revision awaiting faculty review."` (status, risk, at, by unchanged).

- [ ] **Step 5: Run the gates**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -1 && python3 13_Faculty_Resources/_automation/validate_registry_schemas.py 2>&1 | tail -1 && python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py 2>&1 | tail -1 && node --test tests/*.test.mjs faculty-console/*.test.mjs 2>&1 | grep -E "^# fail"`
Expected: `OK`, schema OK, attestation consistency OK, `# fail 0`. Also `grep -rn "Six-Week Compass and onboarding" --include='*.py' --include='*.mjs' --include='*.json' . | grep -v "_build/\|docs/"` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add 14_Tracks/Resident/resident_welcome.meta.json 13_Faculty_Resources/reviewed.json SB/welcome_compass.py SB/resident_section.py SB/test_welcome_compass.py
git commit -m "fix(resident): Welcome summary lives in data; ledger reason is audience-neutral

The resident tldr/points were Python literals and the pending reason was rewritten by
exact string match, so a faculty rewording either leaked MS3 copy to residents or
reddened the resident build. The summary now ships from
14_Tracks/Resident/resident_welcome.meta.json and the ledger reason names no audience.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: One source for the six week titles across both navs and the manifest

Finding addressed: #8.

**Files:**
- Modify: `SB/welcome_compass.py` (`week_nav_title`, use in `assert_nav_projection`)
- Modify: `SB/build_deploy.py` (`_week_items`, manifest-title parity check)
- Modify: `SB/site_manifest.json:146-176` (six week titles)
- Modify: `SB/resident_section.py:235-260` (derive the six hidden week rows)
- Regenerate: `SB/shipped_pages.json` via `python3 SB/shipped_pages.py --write`
- Modify: `SB/test_welcome_compass.py`

**Interfaces:**
- Produces: `welcome_compass.week_nav_title(card: CompassCard) -> str` returning `"Week %d — %s" % (card.n, card.title)`.

- [ ] **Step 1: Write the failing test**

```python
    def test_week_nav_title_is_the_one_formula(self):
        card = welcome_compass.CompassCard(2, "Mood, Psychosis & Pharm", "week2.md")
        self.assertEqual(welcome_compass.week_nav_title(card), "Week 2 — Mood, Psychosis & Pharm")
```

Run: `python3 SB/test_welcome_compass.py 2>&1 | grep -E "^(FAIL|ERROR):"` → AttributeError.

- [ ] **Step 2: Implement the helper**

```python
def week_nav_title(card) -> str:
    """The one wording every surface uses for a week page: nav rows, manifest, Compass."""
    return "Week %d — %s" % (card.n, card.title)
```

In `assert_nav_projection` replace `expected_title = "Week %d — %s" % (card.n, card.title)` with `expected_title = week_nav_title(card)`. In `SB/build_deploy.py` replace the `_week_items` comprehension's title expression with `welcome_compass.week_nav_title(card)`.

- [ ] **Step 3: Align the manifest and regenerate the derived listing**

In `SB/site_manifest.json` set the six week titles to: `Week 1 — Foundations & the MSE`, `Week 2 — Mood, Psychosis & Pharm`, `Week 3 — Psychotherapy & Personality`, `Week 4 — Family Systems & EE`, `Week 5 — Acute & Emergency`, `Week 6 — Integration & Exam`. Then run:

```bash
python3 SB/shipped_pages.py --write && python3 SB/shipped_pages.py --check
```

Expected: `--check` reports OK; `git diff --stat SB/shipped_pages.json` shows only the six title lines changed.

- [ ] **Step 4: Gate manifest/curriculum parity at build time**

In `SB/build_deploy.py`, immediately after the `_week_items = [...]` comprehension:

```python
# The manifest, both navs and the Compass must agree on a week page's title; the curriculum
# is the source and the manifest is checked against it here (2026-09-05 review, finding 8).
_manifest_titles={row[1]:row[2] for row in md}
_week_title_drift=[
    (card.landing_ref,_manifest_titles.get(card.landing_ref),welcome_compass.week_nav_title(card))
    for card in _compass_cards
    if _manifest_titles.get(card.landing_ref)!=welcome_compass.week_nav_title(card)
]
if _week_title_drift:
    print("BUILD ABORTED — week page titles drift between site_manifest.json and curriculum.json:")
    for _slug,_have,_want in _week_title_drift: print("   -",_slug,"manifest",repr(_have),"curriculum",repr(_want))
    raise SystemExit(1)
```

(`md` is the manifest's md list already loaded earlier in build_deploy.py; confirm its variable name at the copy loop `for src,dst,_ in md:` and use that name.)

- [ ] **Step 5: Derive the resident nav's hidden week rows**

In `SB/resident_section.py`, immediately before `_HIDDEN_INHERITED=[`:

```python
# The six inherited week pages take their titles from curriculum.json through the same
# formula the MS3 nav and the Compass use, so the two sites never label one page two ways.
from shipped_pages import load_shipped_pages as _load_shipped_pages
try:
    _week_cards=welcome_compass.prepare_cards(
        json.load(open(LIB+"/curriculum.json",encoding="utf-8"))["learningPaths"]["ms3"]["weeks"],
        _load_shipped_pages(LIB))
except welcome_compass.CompassContractError as _week_error:
    print("BUILD ABORTED — week nav titles:",_week_error)
    raise SystemExit(1)
_HIDDEN_WEEKS=[{"t":welcome_compass.week_nav_title(_c),"f":_c.landing_ref,"k":"md","hidden":True} for _c in _week_cards]
```

Then replace the six literal `{"t":"Week N — ...","f":"weekN.md","k":"md","hidden":True},` rows inside `_HIDDEN_INHERITED` with `*_HIDDEN_WEEKS,` in the same position (after the Orientation Packet row). After `nav=sorted(...)` in the resident script add `welcome_compass.assert_nav_projection(nav,_week_cards)`.

- [ ] **Step 6: Run the gates and a build-side smoke of the parity check**

Run: `python3 SB/test_welcome_compass.py 2>&1 | tail -1 && python3 SB/shipped_pages.py --check && (cd SB && python3 test_frontdoor_catalog.py 2>&1 | tail -1) && python3 13_Faculty_Resources/_automation/validate_curriculum.py | tail -1 && node --test tests/*.test.mjs faculty-console/*.test.mjs 2>&1 | grep -E "^# fail"`
Expected: `OK`, check OK, `OK`, `curriculum.json OK …`, `# fail 0`.

Then prove the parity gate has teeth without a full build:

```bash
python3 - <<'EOF'
import json, sys
sys.path.insert(0, "13_Faculty_Resources/_automation/site_build")
import welcome_compass, shipped_pages
manifest = json.load(open("13_Faculty_Resources/_automation/site_build/site_manifest.json", encoding="utf-8"))
weeks = json.load(open("curriculum.json", encoding="utf-8"))["learningPaths"]["ms3"]["weeks"]
cards = welcome_compass.prepare_cards(weeks, shipped_pages.load_shipped_pages("."))
titles = {row[1]: row[2] for row in manifest["md"]}
drift = lambda t: [c.landing_ref for c in cards if t.get(c.landing_ref) != welcome_compass.week_nav_title(c)]
print("drift now:", drift(titles))
titles["week3.md"] = "Week 3 — Wrong"
print("drift after tampering:", drift(titles))
EOF
```

Expected output: `drift now: []` then `drift after tampering: ['week3.md']`.

- [ ] **Step 7: Commit**

```bash
git add SB/welcome_compass.py SB/build_deploy.py SB/resident_section.py SB/site_manifest.json SB/shipped_pages.json SB/test_welcome_compass.py
git commit -m "fix(nav): one title per week page across both sites, the manifest and the Compass

MS3 derived week titles from curriculum.json while the resident nav, site_manifest.json
and shipped_pages.json kept the old literals, so the same page shipped under three
wordings. All surfaces now use welcome_compass.week_nav_title and the MS3 build aborts
on manifest/curriculum drift.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Full local gate on the finished branch

**Files:** none new; fix only what the gate reports.

- [ ] **Step 1: Run the one-command gate in the background and read every line**

```bash
bash bin/verify.sh > /tmp/verify-527.log 2>&1; echo "EXIT=$?" >> /tmp/verify-527.log
```

Expected: `ALL CHECKS PASSED` and `EXIT=0`. Read the report-only lines too (`verify_spans`, `check_qbank_coherence`) — a PASS line is not "nothing found", but this plan changes no evidence or question-bank content, so their counts must equal the PR's stated baseline (38 clean / 11 flagged spans; 189 live items / 0 conflicting pairs).

- [ ] **Step 2: Confirm the built sites carry the fixes**

```bash
grep -c "fd-compass" _build/ms3/content/welcome.md      # expect ≥ 1
grep -c "ms3-compass" _build/res/frontdoor.css          # expect 0
python3 -c "import json;[print(s,[i['t'] for sec in json.load(open('_build/%s/nav.json'%s)) for i in sec['items'] if i['f']=='week2.md']) for s in ('ms3','res')]"
```

Expected: both sites print `['Week 2 — Mood, Psychosis & Pharm']`.

- [ ] **Step 3: Confirm the tree is clean**

`git status --short` must be empty (no `_build/`, no media, no stray files). Do not commit anything in this task unless the gate required a fix; if it did, commit that fix alone with a message that names the gate step.
