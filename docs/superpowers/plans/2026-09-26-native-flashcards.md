# Native Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let MS3 and resident learners study reviewed Concepts in Daily Review, with the same released cards in Anki and honest browser-local progress.

**Architecture:** A tracked, status-free candidate catalog records exact source excerpts and stable editorial IDs. Both site builders project a released feed after the optional signed ledger overlay; Daily Review, Today counts, and Anki export use that feed. A generated-asset dependency rule binds the candidate to tool attestation and verifies the built feed.

**Tech Stack:** Python 3, `genanki==0.13.1`, stdlib SQLite/ZIP for package checks, existing inline React Daily Review, Front Door JavaScript, Node `node:test`, Playwright, Netlify static build.

**Spec:** `docs/superpowers/specs/2026-09-26-native-flashcards-design.md`

**Execution:** The owner explicitly requested implementation once this plan was developed, aiming to review a PR in the morning. Use subagent-driven execution on this isolated branch; the PR remains draft for faculty review.

## Global Constraints

- The MS3 and resident builds share one content source; read `shipped_pages.json` for deployed slugs and effective faculty status after `CLERKSHIP_LEDGER=on` overlay.
- No invented clinical prose, dose literals, patient data, Anki schedule sync, or new analytics events. Faculty reviews changed card faces and release readiness.
- Candidate card IDs survive reorder; each rendered cloze has its own versioned `CONCEPT#<id>@<revision>` SRS key. Preserve old Anki note GUIDs for unchanged grouped notes.
- Keep `cw_srs_v1` compatible. Old mixed `stats.correct/seen` cannot be split into objective and self-rated history.
- Build the released feed before `common.emit_service_worker`; verify both the tool and shell carry its exact digest. Build packages after site QA, then hard-check semantic parity before build success.
- No silent coverage shrink: all structurally eligible source summaries and pearls are either candidates or explicitly excluded with a reason. The structural inventory found 38 eligible sources, including 16 whole-source first-release exclusions and five additional Brief Psychotherapy pearls. Four published card targets no longer exist in current source and are explicitly withdrawn pending faculty review.
- Both sites must serve the same initial shared card set; a new audience difference needs an explicit exclusion decision or separate packages.
- The branch is isolated from the user's dirty `Flash-cards` checkout. A collision preflight reported concurrent branch/PR overlap for `build_deploy.py` and `spa_index.html`; edit only this worktree, inspect upstream before rebasing, and report overlap in the PR.

## File map

| Unit | Files | Responsibility |
|---|---|---|
| Candidate and projection | `site_build/concept_candidates.json`, `site_build/concept_guid_crosswalk.json`, `site_build/concept_cards.py`, `site_build/test_concept_cards.py` | Exact source binding, stable IDs, reviewed release feed, coverage and identity checks |
| Build provenance | `site_build/teaching_dependencies.py`, `site_build/shipped_pages.json`, `site_build/build_deploy.py`, `site_build/resident_section.py`, `site_build/common.py`, `site_build/test_shipped_pages.py` | Generated feed route, attestation input, digest injection, pre-worker staging |
| Anki parity | `site_build/export_anki_content.py`, `site_build/export_anki_all.py`, `site_build/build_anki.sh`, `site_build/check_anki_parity.py`, `site_build/test_concept_package.py`, `requirements.txt`, `site_build/build_and_check.sh` | Build current packages and verify rendered cards, including cloze ordinals |
| Study surface | `07_Evidence_and_Reading/Landmark_Trials/review.html`, `site_build/concept_recall.js`, `tests/concept-recall.test.mjs`, `tests/review-recall.test.mjs`, `tests/session-receipt.test.mjs` | Feed validation, recall cards, filter, reveal, self-rated metrics, visual cue |
| Front Door and offline | `site_build/spa_index.html`, `site_build/frontdoor/fd_wire.js`, `site_build/frontdoor/fd_offline.js`, `site_build/sw_template.js`, `tests/srs-home-counters.test.mjs`, `tests/fd-offline.test.mjs`, smoke tests | Same released-ID due set, active-week context, offline dependency |
| Learner documentation | `09_Exam_Prep/anki_export/README.md`, `09_Exam_Prep/anki_export/anki.md`, generated deck artifacts and audit report | Accurate counts, site study link, faculty-readable card changes |

## Review Focus

1. **A signed review arrives after checkout:** both sites and Anki include the newly eligible card without modifying tracked candidate data; Task 2/3 fixture tests this.
2. **A card changes or is withdrawn while old SRS data remains:** Today and Daily Review skip obsolete keys, preserving unrelated history; Task 4/5 tests this.
3. **A source has no weekly Path assignment:** default All serves it and This week reports excluded new cards; Task 4 tests this.
4. **An old service worker serves stale JSON despite a query parameter:** digest mismatch shows unavailable, and retry updates/reloads the worker; Task 4/5 browser tests this.
5. **One Anki note has multiple clozes:** `(note GUID, ordinal)` maps every rendered card and a sibling change is reported; Task 1/3 tests this.

---

### Task 1: Candidate inventory and exact card extraction

**Files:** Create `site_build/concept_candidates.json`, `site_build/concept_guid_crosswalk.json`, `site_build/concept_cards.py`, `site_build/test_concept_cards.py`; retire `pearl_cards.json` reads in Task 3.

**Interfaces:** `load_candidates(root: Path) -> dict`; `validate_candidates(root: Path, document: dict) -> list[dict]`; `release_cards(root: Path, site: str) -> dict`; `feed_bytes(root: Path, site: str) -> bytes`. A released card has `id`, `noteId`, `ordinal`, `revision`, `kind`, `q`, `reveal`, `page`, `source`, and `topic`. `id` is the versioned SRS key. The feed includes `schemaVersion`, `cards`, `examinedSources`, `withheld`, and `digest`.

- [x] **Step 1: Write failing tests.** In `test_concept_cards.py`, create fixture pages, a controlled `shipped_pages.json`, and effective ledger rows. Assert that reordering two bullets preserves their IDs; a missing, duplicate, or overlapping exact target fails with the note ID; a `**High-yield pearls.**` variant is discovered; a reviewed page missing from the map or explicit exclusions fails coverage; a pending page is withheld; a post-checkout signed review releases it. Verify the ethics mismatch cannot produce a generic prompt.

```python
def test_reorder_keeps_ids(self):
    before = validate_candidates(self.root, self.candidates)
    self.page.write_text(self.page.read_text().replace('- First\n- Second', '- Second\n- First'))
    after = validate_candidates(self.root, self.candidates)
    self.assertEqual({c['id'] for c in before}, {c['id'] for c in after})
```

- [x] **Step 2: Run `python3 -m unittest 13_Faculty_Resources/_automation/site_build/test_concept_cards.py -v`; confirm it fails on the absent module.**
- [x] **Step 3: Implement the parser and projection.** Parse the canonical summary/pearl section variants, match exact normalized excerpts, derive each deployed page slug from `shipped_pages.json` rather than the source basename, and validate one nonoverlapping target per rendered card. Use `load_effective_ledger()` after overlay. Serialize sorted JSON deterministically, and fail on duplicate IDs, unexamined eligible sources, or an empty release.

```python
def feed_bytes(root: Path, site: str) -> bytes:
    feed = release_cards(root, site)
    return (json.dumps(feed, sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
```

- [x] **Step 4: Inventory the present 142 Concepts notes / 158 rendered cards from the checked-in `.apkg`.** Migrate the 22 legacy source pages to candidate records with permanent note IDs and per-target IDs. Record `(old GUID, ordinal) -> editorial ID` for all rendered cards. Bind the five ethics fallback cards to exact source targets for faculty review. Record explicit first-release exclusions for the 11 newly discovered shared pages (Case Formulation, Psychotherapy, Medical Workup, Agitation, Catatonia, Delirium, Suicide Risk, Toxidromes, Violence Risk, Medication Monitoring, Student Psychopharmacology Primer), five additional sources found by the structural scan, and five Brief Psychotherapy pearls. Explicitly withdraw the four obsolete targets. Add a machine-checked coverage report; do not infer coverage from the old exporter regex alone.
- [x] **Step 5: Re-run tests and commit only candidate/parser/identity files.** Use `git diff --check`, inspect the generated front/back diff, then commit `feat: define source-bound concept candidates`.

### Task 2: Build the released feed and bind it to governance

**Files:** Modify `site_build/teaching_dependencies.py`, `site_build/shipped_pages.json`, `site_build/build_deploy.py`, `site_build/resident_section.py`, `site_build/common.py`, `site_build/test_shipped_pages.py`; add targeted `site_build/test_concept_build.py`.

**Interfaces:** Consumes `feed_bytes(root, site)` from Task 1. Produces `/tools/concepts.json` in both site outputs and a SHA-256 expected digest injected into built `review.html` and `index.html` before service worker emission. `teaching_dependencies.discover()` returns `concept_candidates.json` as an extra source for the generated URL, and `--check-build` compares built feed bytes against `feed_bytes()`.

- [x] **Step 1: Write failing tests.** A fixture with a candidate, a pending source page, and a valid signed overlay must change feed membership while `review.html`'s tracked attestation input remains the same. Test a built asset one byte shorter than `feed_bytes()` fails dependency parity. Test `shipped_pages.derive()` lists the candidate under `review.html.extraSources` and never lists `reviewed.json` there.

```python
def test_generated_concepts_asset_is_checked(self):
    expected = feed_bytes(self.root, 'ms3')
    self.assertEqual(self.discover('ms3', built=expected), {'13_Faculty_Resources/_automation/site_build/concept_candidates.json'})
    with self.assertRaises(DependencyError):
        self.discover('ms3', built=expected[:-1])
```

- [x] **Step 2: Run the targeted Python tests and confirm failure before code.**
- [x] **Step 3: Add one explicit generated-asset branch to `teaching_dependencies.discover()`.** It maps `tools/concepts.json` to the tracked candidate at source-list time and compares generated built bytes at `--check-build` time. Keep the existing byte-equality rule for every other teaching asset. Regenerate `shipped_pages.json` with `shipped_pages.py --write` and inspect only the intended `review.html.extraSources` change.
- [x] **Step 4: In each builder, write the feed, inject its digest, then emit `sw.js`.** The resident builder must regenerate from its post-overlay effective state rather than copying a stale MS3 feed. Assert the built tool and shell contain the exact digest, and that the feed is in the worker's precache list. Make the existing Daily Review item visible in both audiences' Practice and Exam Prep navigation by removing only `review.html` from `HIDDEN_TOOLS` and its resident `hidden:True` flag; leave Shelf Mode's visibility unchanged. Pin this with a nav test.

```python
raw = concept_cards.feed_bytes(Path(LIB), SITE)
(Path(OUT) / 'tools' / 'concepts.json').write_bytes(raw)
expected = hashlib.sha256(raw).hexdigest()
common.inject_concept_digest(Path(OUT), expected)
```

- [x] **Step 5: Run candidate, shipped-pages, and build-unit tests; commit `feat: project reviewed concept feed into both sites`.**

### Task 3: Rebuild Anki from that feed and prove parity

**Files:** Modify `export_anki_content.py`, `export_anki_all.py`, `build_anki.sh`, `build_and_check.sh`, `requirements.txt`, `09_Exam_Prep/anki_export/README.md`; create `check_anki_parity.py`, `test_concept_package.py`.

**Interfaces:** Consumes built `/tools/concepts.json` and candidate note grouping/crosswalk. `build_anki.sh OUT_DIR` stages all three `.apkg` files into `OUT_DIR/anki` without editing tracked packages; `check_anki_parity.py OUT_DIR` reads `collection.anki2` from staged ZIPs and compares `(editorial ID, ordinal, front, back, source)` with the released feed. The combined package's question-bank subdeck remains separately checked against the overlaid `question_bank.json`.

- [x] **Step 1: Write failing package tests.** Build a two-cloze fixture with one note GUID and ordinals 0/1. Assert two site IDs, unchanged GUID reuse, and parity failure for one missing card, extra card, changed answer, stale withdrawn card, bad source, or wrong ordinal even when note counts match. Test fallback committed package is accepted only on exact semantic equality.

```python
def test_same_note_two_clozes_are_two_cards(self):
    actual = read_apkg(self.package)
    self.assertEqual({(c.guid, c.ordinal) for c in actual}, {('old-guid', 0), ('old-guid', 1)})
```

- [x] **Step 2: Run `python3 -m unittest 13_Faculty_Resources/_automation/site_build/test_concept_package.py -v`; confirm failure.**
- [x] **Step 3: Pin `genanki==0.13.1` in root `requirements.txt` and build note groups from the released feed.** Remove the positional map, `attested by` regex gate, author-bold fallback, and generic front. Preserve a legacy GUID for unchanged grouped notes via the crosswalk; mint a new GUID when a tested target changes and report sibling churn. Generate the combined package from the same feed, including current overlaid question-bank status.
- [x] **Step 4: Stage to a temporary build directory and hard-check after staging.** Keep the old committed packages as an exact-match fallback only. A missing dependency or mismatched package fails the site build; no stale Anki link is served. Check each package by rendered cards, not note count, and add the parity check after the existing `build_anki.sh` call in both `build_and_check.sh` branches.

```bash
bash "$HERE/build_anki.sh" "$MS3_OUT"
python3 "$HERE/check_anki_parity.py" "$MS3_OUT" ms3
```

- [x] **Step 5: Run package tests and `build_and_check.sh ms3`/`res`; update README from measured packages; commit `feat: keep Anki downloads aligned with native cards`.** Provide an explicit local baseline-refresh command that copies verified output packages into `09_Exam_Prep/anki_export/` outside an active ledger overlay. The baseline refresh remains intentionally deferred pending faculty review; no committed packages were replaced. Routine builds must not rewrite them. Do not commit LFS pointer stubs.

### Task 4: Daily Review Concepts and honest feedback

**Files:** Modify `07_Evidence_and_Reading/Landmark_Trials/review.html`, `site_build/common.py`, `site_build/srs_store.js`, `site_build/question-bank-practice.html`, `tests/review-recall.test.mjs`, `tests/session-receipt.test.mjs`; create `site_build/concept_recall.js`, `tests/concept-recall.test.mjs`.

**Interfaces:** Consumes verified `/tools/concepts.json`. The pure `conceptCardsFromFeed(feed)` returns one existing `kind:'recall'` card per released cloze, with `id`, `q`, `reveal`, `page`, and `source`. `newConceptAllowed(card, activeWeekRefs, filter)` affects new cards only; `CONCEPT#` due cards ignore the filter. Inject `concept_recall.js` through one `/*__CONCEPT_RECALL__*/` marker in both `review.html` and `spa_index.html`, so queue and due eligibility share code. Existing `cw_srs_v1` state is reused.

- [x] **Step 1: Write failing tests.** Pin one card per cloze, escaped reveal, no answer in DOM before reveal, missing/stale feed visible error, source link using the shipped slug, no-week sources available under default All, This week limiting new only, due unchanged, transient filter state, direct visit fallback, focus-safe shortcuts, and a next-due strip after the last card and after Again. Test old mixed `stats.correct/seen` never appears as “Retention” and new choice/recall counters start separately.

```javascript
assert.equal(conceptCardsFromFeed(feed).length, 2);
assert.deepEqual(newConceptAllowed({ page: 'ethics_legal.md' }, ['mse.md'], 'week'), false);
assert.deepEqual(newConceptAllowed({ page: 'ethics_legal.md' }, ['mse.md'], 'all'), true);
```

- [x] **Step 2: Run `node --test tests/concept-recall.test.mjs tests/review-recall.test.mjs tests/session-receipt.test.mjs`; confirm the new assertions fail.**
- [x] **Step 3: Add the pure card adapter and feed loader.** Fetch the generated URL, check the build-injected SHA-256 against actual response bytes, validate schema/IDs, then append cards to Daily Review. Show an unavailable state on failure, with Retry that checks worker update/reload rather than adding a query string the current worker ignores. Keep the existing other card sources available but make Concepts incompleteness explicit.
- [x] **Step 4: Add UI and grading.** Default All, offer This week with an excluded count and Other library topics cue, keep due cards across filters, and use a post-grade status strip for `concept → source → next due`. Reveal source page and available evidence link as text/links, never generated markup. Suppress keyboard shortcuts while focus is in interactive controls.
- [x] **Step 5: Replace the mixed Retention percentage.** Add `choiceSeen/choiceCorrect` and `recallSeen/recallGoodEasy` on new grades in both Daily Review and Practice Questions; keep historical fields but do not recast them as objective scores. Label new counts “since this update” and separate session receipt wording. Run the targeted tests; commit `feat: study concepts in Daily Review`.

### Task 5: Today counts, Path context, and offline truth

**Files:** Modify `site_build/spa_index.html`, `site_build/frontdoor/fd_wire.js`, `site_build/frontdoor/fd_offline.js`, `site_build/sw_template.js`, `tests/srs-home-counters.test.mjs`, `tests/fd-offline.test.mjs`, `tests/block-wiring.test.mjs`; add smoke coverage in `tests/smoke/front-door.spec.js`.

**Interfaces:** The shell loads the same feed and validates its expected digest. `dueBreakdown(releasedIds: Set<string> | null)` filters `CONCEPT#` keys; `null` means the concept count is unknown. Concept due status is `checking | ready | unavailable`; `ready` carries the active released-ID set. A typed same-origin iframe message sends `state.week` and projected `FD_INDEX.weeks` refs; `review.html` never reads `state.viewWeek` as active week.

- [x] **Step 1: Write failing tests.** Seed `cw_srs_v1` with one live concept, one withdrawn revision, and another tool's card. Today counts only the live concept when the feed is ready; it reports unknown while checking or unavailable. Test a curator-projected week and invalid message origin/payload. Pin that timed `?block=1&limit=N` ignores the week filter. Test offline readiness includes `concepts.json` when a review pack contains Daily Review and rejects a missing cache entry.

```javascript
assert.equal(srsBucket('CONCEPT#ethics-capacity:1@2'), 'daily');
assert.equal(dueBreakdown(new Set(['CONCEPT#ethics-capacity:1@2'])).daily.due, 1);
```

- [x] **Step 2: Run focused Node tests and confirm new assertions fail.**
- [x] **Step 3: Load/verify the feed before displaying a complete Today due count.** Filter old `CONCEPT#` keys against released IDs without deleting their history; preserve existing QB, FAM, COMM, REASON, and TOPIC counters. Use the same pure eligibility rule in the tool, shell, and block path. Add a visible unknown state for failed feed load.
- [x] **Step 4: Add the typed same-origin Path context exchange and offline route rule.** The host sends actual active week and projected refs after validating the requesting review frame. Accept `/tools/concepts.json` in both Front Door and worker route allowlists. The current default weekly offline receipt does not certify Daily Review unless it is in that selected pack; separately verify the actual global precache entry on both sites.
- [x] **Step 5: Browser-check MS3 and resident at 390 px, keyboard, reduced motion, stale worker, source navigation, and block receipt.** Run targeted Node and smoke tests; commit `feat: align Today and offline Concepts state`.

### Task 6: Quality audit, full gates, and reviewable PR

**Files:** Update `09_Exam_Prep/anki_export/anki.md` with a link to on-site Concepts and corrected deck-description copy, add the generated audit report at `docs/flashcards/2026-09-26-card-audit.md`, update `docs/superpowers/plans/2026-09-26-native-flashcards.md` checkboxes, and touch test files only for a demonstrated failure. The authored `anki.md` change may reopen its faculty attestation; report that state without signing it.

**Interfaces:** The audit lists every old/new rendered card ID, GUID/ordinal, source page, answer-target change, excluded source, and Qbank option-length cue; it is an owner review aid, not a faculty sign-off.

- [x] **Step 1: Generate the candidate and package diff report.** Include the five repaired ethics fronts, 21 specific summary fronts, 16 deferred-source reasons, five deferred Brief Psychotherapy pearls, and four withdrawals. Label the checked-in package snapshot separately from current question-bank source when reporting evidence/source omissions and longest-answer cues; their attested sets have changed. Include exact item IDs and mark changed clinical prompts as requiring faculty review.
- [x] **Step 2: Run validators and focused tests:** `validate_attestation_consistency.py`, `shipped_pages.py --check`, concept/package Python suites, `node --test tests/*.test.mjs`, both `build_and_check.sh` sites, and browser smoke. Fix only concrete failures. Run `bin/verify.sh` when the focused gates are green; capture exit status and meaningful skipped coverage.
- [ ] **Step 3: Review the exact branch diff.** Re-run collision preflight; inspect overlapping PR #840 and dirty worktree footprints without altering them. Rebase on current `origin/main` if safe, rerun the affected gates, and ask a fresh reviewer to inspect the branch for clinical-governance and silent-shrink risks.
- [ ] **Step 4: Push and open a draft PR for morning review.** The PR body names local tests, CI state, package counts, faculty card-face decisions, and what is *not* approved (merge, deployment, learner readiness). Attach the PR to this task with `attach_artifact`. Do not merge or deploy.

```bash
git push -u origin codex/native-flashcards-design-2026-09-26
gh pr create --draft --base main --head codex/native-flashcards-design-2026-09-26 --title "Native concept flashcards in Daily Review" --body-file /tmp/native-flashcards-pr.md
```


Task 6 coordination: implementation and local gates belong to the Task 6 worker; final whole-branch review, any safe rebase, push and draft PR belong to the coordinator. Steps 3 and 4 stay unchecked until that work completes. The tracked audit is `docs/flashcards/2026-09-26-card-audit.md`. All completed Task 1–5 boxes reflect their implementation reports; faculty review and replacement of checked-in APKG baselines remain deferred.
