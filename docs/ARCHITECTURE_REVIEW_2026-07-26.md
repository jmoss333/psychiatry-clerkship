# Architecture Review — Psychiatry Clerkship Library
**Date:** 2026-07-26 · **Scope:** build pipeline, data model, validation/CI, content topology
**Framing question:** what breaks as this expands (more audiences, more content, more tools, more contributors, more institutions)?

---

## 0. Executive summary

The **data layer is strong** and the **gate is strong**. The **assembly layer is the weak link**, and it is weak in a specific, fixable way: *audience is not a concept in the data model — it is a directory copy plus a second hand-maintained nav literal.*

| Layer | Verdict | Evidence |
|---|---|---|
| Content data model (8 root registries + paired schemas) | **Good** — genuinely well-designed | `question_bank.json` 192 items, exactly 16/category × 12; every registry has a `*.schema.json` |
| Validation gate | **Good breadth, structural depth only** | 37 checks in `check-static-site.mjs`; 4 Python validators; 38 CI steps |
| Build / assembly | **Fragile — the bottleneck** | 687 LOC across 2 scripts, **1 shared module** (`media_guard.py`, 76 LOC) |
| Audience abstraction | **Absent** | `res` = `copytree(ms3)` + in-place mutation |
| Content-quality assurance | **Thin** | ~90% structural; `safetyLevel` absent on 58/71 topics |
| Source-tree hygiene | **Degrading** | 295 `.md` in `NN_/` tree, **66 ship** |

*All figures below were re-derived from a clean local build of both sites (`build_deploy.py` → `resident_section.py`, both exit 0) and from direct reads of the registries.*

**Velocity context that makes this urgent:** 353 commits, *all* within 60 days (~6/day). Architecture debt in this repo compounds on a weekly, not annual, timescale. The duplication documented below has already measurably drifted in under two months.

**The one-line thesis:** every expansion axis currently costs **O(audiences × features)** instead of **O(features)**. Fixing that is worth more than every other item combined.

---

## 1. Current architecture, as built

```
NN_Category/  (content source, 295 .md)
   │
   ├── site_manifest.json  ── source→slug map (20 tools, 2 assets, 66 md)
   │
   ├── build_deploy.py (444 LOC) ──────────► _build/ms3
   │      copy → polish pass → dark pass → vendor rewrite
   │      → nav literal (88 items) → search index (41 synonym groups, 20 TOOLKW)
   │
   └── resident_section.py (243 LOC)
          shutil.copytree(_build/ms3, _build/res)   ← the entire divergence mechanism
          → delete/overwrite/str.replace in place
          → nav literal #2 (96 items) → search index #2 (37 groups, 23 TOOLKW)

Gate: check-static-site.mjs (37 checks) + check_lfs_media + check_search_quality
Root registries: question_bank · topic_meta · evidence_registry · tool_registry ·
                 communication_cases · reasoning_cases(_resident) · family_systems_scenarios ·
                 longitudinal_case  — each with a paired *.schema.json
```

**What is genuinely well-designed and should be preserved:**

- Schema-paired registries with referential-integrity validation (`evidenceIds` must resolve; enforced across 5 registries).
- The `cw_*` / `rp_*` localStorage namespace rule, hard-enforced — prevents silent attestation/SRS corruption.
- The dose-literal ban in `rp-*`/`*-trainer` tools and all `*.pack.json` — a real clinical-safety gate, not a lint.
- The source-map orphan check — purpose-built to catch the "10 pages dropped at git cutover" failure class.
- Vendored React + `marked` with a CDN-host ban — correctly designed for ward Wi-Fi.
- API key server-side in `sp-proxy`, browser holds only a passcode.
- `CLAUDE.md`/`AGENTS.md` byte-parity enforced in CI.

These are not accidents; they are scar tissue from real incidents, and the review does not propose touching any of them.

---

## 2. Stress points, ranked by what breaks first

### S1 — Audience is a `copytree`, not a data model **(critical)**

`build_and_check.sh res` runs `build_deploy.py` in full to produce `_build/ms3`, then `resident_section.py` does:

```python
if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(MS3, OUT)   # start as a full copy of the polished/dark/motion MS3 build
```

…and mutates in place. Everything both sites need exists as **two copies**:

| Construct | ms3 | res | State |
|---|---|---|---|
| `nav` | 11 sections / 88 items | 11 sections / 96 items | Independently re-declared; **87 shared slugs**, 1 ms3-only, 9 res-only (verified from built `nav.json`) |
| `_navorder` | 278-char literal | same 278-char literal | **Byte-identical** (md5 verified) |
| Synonym `GROUPS` | 41 groups | 37 groups | **22 of 37 already drifted** |
| `TOOLKW` | 20 keys | 23 keys | **15 of 20 shared values already drifted** |
| Tokenizer, stopwords, index builder | ~30 LOC | ~26 LOC | Transcribed by hand |
| skip-link injection, `#87786a`→`#665a4f` | inline | re-pasted | Duplicated |
| `HIDDEN_TOOLS`, `TOOLS` | live | **declared, never read** | Dead code carried across |

There is no `Page` class, no `NavItem` type, no `Audience` enum, no shared `nav.py`. The word "audience" appears in the pipeline exactly once — as prose in a comment. The shared contract is the *JSON file format*, enforced only at runtime.

The clearest statement of the problem is a comment in the code itself:

```python
# ---------- resident-only inline tool CTAs (topic_meta is shared, so patch OUT's copy) ----------
```

The shared data model has no audience dimension, so audience is expressed by **mutating the output directory**.

**Why this breaks on expansion:** `14_Tracks/` already stubs six more audiences — Sub-I/MS4, CAP Fellow, Nursing, SW, PGY2, Patients/Families. Thirteen of its 33 files are wired into neither build. `14_Tracks/README.md` states the intended design — *"overlays — links only, no forked content"* — and the one track that actually ships violates it exactly. Audience #3 under the current design is a third 240-line fork with a third drifting synonym table.

Also note `14_Tracks/Resident/` (live, 7 files, no README) vs `14_Tracks/Resident_PGY2/` (documented, disconnected) — two competing resident representations, one real.

### S2 — Post-hoc HTML string mutation fails silently

The polish / dark-mode / a11y / vendor passes rewrite *built* HTML with exact-literal `str.replace` and regex:

```python
_t=_t.replace('<div id="root"></div>','<main id="root"></main>')
_t=_t.replace("--surface:#ffffff;","--surface:#ffffff; --on-brand:#ffffff;",1)
_t=_t.replace("https://cdnjs.cloudflare.com/.../react.production.min.js","vendor/react.min.js")
```

A tool authored with `<div id='root'>`, or `--surface: #fff;`, or a different React CDN path, **silently receives nothing**. There is no assertion that any transform applied.

This has already happened. The three `rp-*` resident tools bypass the pass entirely, and the code says so:

```python
# WP-05: these 3 rp-* tools bypass build_deploy.py's polish pass entirely (raw copy, above),
```

They ship without `clinical-warm.css`, the motion CSS, the in-iframe link interceptor (so links dead-end when framed by the SPA), the `#fff`→`var(--surface)` rewrites, the contrast fix, and the cache-bust. The dark-mode pass's *output* was instead hand-duplicated into the source files.

**Why this breaks on expansion:** silent-coverage gaps grow linearly with tool count and are invisible by construction. At 20 tools it's tractable; at 50 it is not auditable.

### S3 — Per-tool metadata lives inside the build script

`TOOLKW` is a 20-key dict of search keywords embedded in `build_deploy.py`, forked into `resident_section.py`. Search relevance for a tool is edited in a Python build script, in two places, far from the tool.

**`tool_registry.json` already exists, with a schema.** This metadata has an obvious home it is not using.

### S4 — Nav is code; the manifest is data

`site_manifest.json` holds source→slug; structure, order, and `hidden` live in Python list literals. Shipping one new page for both audiences = editing **4 locations across 2 languages**. The QA gate hard-fails if you miss one — good — but the cost is paid on every single addition.

`_HIDDEN_INHERITED` in `resident_section.py` (23 MS3 pages dumped into the resident nav as `hidden:True`) is a pure workaround for the nav-orphan rule firing on files the copytree dragged along. That list will grow monotonically with every MS3 page added.

### S5 — Attestation state is smeared across five surfaces

| Surface | Coverage |
|---|---|
| `reviewed.json` | 99 entries — 94 reviewed, 5 pending |
| `topic_meta.facultyReview` | **13 of 71** topics have `lastReviewed` |
| `[RC-META]` headers in tool HTML | per-tool, free text |
| `question_bank.json` `status` | 143 attested / 49 draft |
| `qbank_attestation_2026-07-05.json` | separate dated ledger |

`validate_attestation_consistency.py` is **892 LOC — the largest validator in the repo — and it exists purely to police divergence between these ledgers.** That 892 LOC is the carrying cost of not having one.

Note the coverage asymmetry: `reviewed.json` says 94/99 reviewed while `topic_meta` carries review metadata for 13/71. Those describe overlapping-but-different populations, which is exactly why the validator is so large.

**A sharper instance of the same problem, found during verification:** exactly 13 topics carry `safetyLevel` and exactly 13 carry `facultyReview.lastReviewed` — **but they are not the same 13.** Two fields that should co-vary (a page flagged high-risk is precisely the page that needs a dated faculty review) have independently drifting populations, and nothing detects it, because `safetyLevel` is optional. Worth a one-line assertion in `validate_topic_meta.py` immediately, ahead of any larger refactor.

### S6 — Content-quality gates are ~90% structural

The strongest clinical rule in the repo:

```python
if v.get("safetyLevel") == "high":
    if not v.get("evidenceIds"): bad(k, "high-risk page requires non-empty evidenceIds")
    # ...requires facultyReview.status + lastReviewed
```

**`safetyLevel` is optional, and absent on 58 of 71 topics.** The gate is escapable by omission, and 82% of topics escape it.

Missing entirely (zero repo-wide hits): reading-level / readability checks, claim-level evidence binding (`evidenceIds` is page-level), any clinical-accuracy check, and **any freshness gate** — `lastReviewed` is required but its *value* is never age-compared. All 13 review dates are 2026-07. In twelve months nothing will flag them stale.

External link + citation checking exists (`surveillance/`, weekly cron, lychee + DOI/PMID resolution) but **cannot fail a PR or a deploy** — it opens issues.

`STRICT` is never set by `build_and_check.sh` or CI, so all soft findings — missing `topic_meta` entries, nav items absent from `reviewed.json`, blueprint coverage holes, near-duplicate stems, missing `[RC-META]` — warn forever.

### S7 — The source tree conflates curriculum with raw material

**295 `.md` in the `NN_Category/` tree; 66 ship — 229 do not.** The remainder includes Notion export artifacts (`2b849b94b18d80d492c5fe11ba3054a7.md`), podcast transcripts, reading lists, and audit scratch — sitting beside curriculum source.

The orphaned-source check only recognizes three filename conventions (`*_inpatient(_teaching).md`, `*_pocket_(guide|card).md`, `Week_*/README.md`). Everything else is invisible to it.

**Why this breaks on expansion:** "is this page live?" becomes unanswerable by inspection. Contributor onboarding cost rises. Grep/search noise rises. `13_Faculty_Resources/` at 469 MB and `07_Evidence_and_Reading/` at 170 MB are already heavy.

### S8 — CI does ~4× redundant work, uncached, untimed

- **`build_deploy.py` executes 4× per CI run** — ms3 job, res job (rebuilds ms3 as its base), then `smoke-tests` rebuilds both from scratch rather than consuming artifacts. The 4-validator preflight, `check-static-site.mjs` (including an O(n²) stem-similarity loop over a 591 KB bank), and `check_search_quality.py` all run 4×.
- **No `cache: pip`, no `cache: npm`.** Two cold `pip install`, two cold `npm ci` per run.
- **No `timeout-minutes` anywhere** across all 6 workflows — a hung Playwright inherits GitHub's 6-hour default.
- Playwright cache key is a hardcoded `1.46.1`, not a lockfile hash — a version bump silently restores a stale browser cache.
- The LFS deploy-preview probe skips silently if the preview isn't live — the LFS integrity check is a coin flip on PR timing.
- `maxDiffPixelRatio: 0.20` is loose enough to miss most real layout regressions.

### S9 — Orphan automation and a dead test suite

Never invoked by CI or `build_and_check.sh`: `build_attest.py`, `attest_serve.py`, `build_index.py` (19 KB, writes to a dead sandbox path), `crosswalk_apply.py`, `oe_scan.py`, `build_citation_index.py`, and all six `anki/` entrypoints.

**`tests/anki/` — 13 pytest files — never executes.** `pytest` appears in **zero** `.sh`/`.yml`/`.toml`/`.cfg`/`.ini` files repo-wide. It is the only coverage the 12 `pcl_anki/` modules have.

Coverage asymmetry worth noting: `validate_topic_meta.py` is 310 LOC, ~30 rules, runs on every deploy — and is the **only** one of the four core validators without a paired test. Its three siblings all have one.

### S10 — Root-level document sprawl

26 markdown planning docs at repo root — audits, backlogs, handoffs, fill maps, remediation logs, mostly dated Jun–Jul 2026. No archival convention. New contributors cannot tell which are live.

---

## 2b. Interaction with the approved Risk-Aware Publishing design (same date)

`docs/superpowers/specs/2026-07-26-risk-aware-publishing-warnings-design.md` (status: **Approved design**) already resolves a large part of S5. It makes `reviewed.json` the sole governance authority, adds a risk classification to every record, emits a normalized `governance.json` for learner clients, and rejects any divergence between `tool-governance.json` envelopes and the canonical ledger. **Recommendation 3.3 below is therefore already designed — treat this review as corroborating evidence, not a competing proposal.**

Three points of contact worth acting on:

1. **This review supplies direct evidence for that design's premise.** The finding that `safetyLevel` and `facultyReview.lastReviewed` cover two *different* sets of 13 topics is precisely the "overlapping review signals that can drift" the design cites. It is measured, not hypothetical.

2. **The design explicitly defers freshness** — "Adding evidence-staleness automation in this increment" is listed as a non-goal. So **recommendation 3.2 (age-based re-attestation) remains a real, uncovered gap**, and it is the natural follow-on increment once one ledger exists. With all review dates currently in a single month (2026-07), the gap is invisible today and becomes material in roughly a year.

3. **⚠️ The design is about to pay the S1 duplication tax again.** Its implementation notes say: *"Modify `resident_section.py` only if resident-specific assembly cannot consume the [normalized artifact]."* That works *around* the fork rather than through it — the new governance artifact has to be threaded into **two** assembly scripts, and the warning-rendering logic becomes the next candidate to drift, exactly as the synonym tables and `TOOLKW` already have.

   **Sequencing consequence:** land **1.1 (extract `common.py`)** *before or alongside* the risk-aware implementation. Doing so is cheap now and converts "modify both scripts" into "modify one shared function." Landing it afterward means retrofitting warning-injection logic that has already been written twice.

---

## 3. Recommendations — phased

Effort: **S** ≈ hours · **M** ≈ 1–2 days · **L** ≈ ~1 week.

### Phase 1 — Stop the bleeding (do before any third audience exists)

| # | Action | Effort | Impact |
|---|---|---|---|
| 1.1 | ✅ **DONE 2026-07-26** — **Extracted `site_build/common.py`**: `tok()`, stopwords, `SYNONYM_GROUPS`, `TOOL_KEYWORDS`, `build_search_index()`, `apply_page_chrome()`, `apply_dark_mode()`, `apply_full_page_pass()`. Both scripts import it; both copies deleted. | M | Killed 22 drifted synonym groups + 15 drifted TOOLKW values at the root |
| 1.2 | **Move `TOOL_KEYWORDS` into `tool_registry.json`** as a `searchKeywords` field (schema already exists). Build reads it. Now a single-table move rather than two. | S | Tool metadata lives with the tool |
| 1.3 | ✅ **DONE 2026-07-26** — **`page_contract_failures()` / `assert_page_contract()`.** Replaced "assert each replace applied" with the stronger form: assert the *outcome* per shipped page (skip-link, `#root`, theme init, dark tokens, favicon, iframe shim). Hard-fails with the file list. | S | Converts S2 from silent to loud |
| 1.4 | ✅ **PARTIAL 2026-07-26** — deleted dead `TOOLS` + `HIDDEN_TOOLS` in `resident_section.py`, the dead `_DARK` constant, and fixed the dead vendor branch. Still open: `build_index.py` and the other orphan scripts. | S | Removes false signal |
| 1.5 | **CI hygiene**: add `cache: pip` + `cache: npm`, `timeout-minutes: 20/30`, lockfile-hashed Playwright key, and pass `_build/` between jobs via `upload/download-artifact`. | S | ~4× → ~2× build work; bounded failure modes |
| 1.6 | **Run `tests/anki/`** — add a pytest step, or delete the suite. Do not leave 13 files pretending to be coverage. | S | Honest coverage signal |

### Phase 2 — Make audience a first-class dimension (the main event)

**Target model — nav becomes data, audience becomes a field:**

```jsonc
// site_manifest.json — entries become objects, not positional arrays
{
  "pages": [
    { "src": "03_Core_Topics/Mood/t_mood.md", "slug": "t_mood.md",
      "title": "Mood", "kind": "md",
      "section": "Understand the Problem", "order": 60,
      "audiences": ["ms3", "res"] },
    { "src": "14_Tracks/Resident/adv_psychopharm.md", "slug": "adv_psychopharm.md",
      "title": "Advanced Psychopharmacology", "kind": "md",
      "section": "Make a Plan", "order": 20,
      "audiences": ["res"] }
  ],
  "audiences": {
    "ms3": { "site": "une-ms3-psychiatry",  "brand": {...} },
    "res": { "site": "mmc-psychiatry-residents-sanford", "brand": {...},
             "overrides": { "reasoning_cases.json": "reasoning_cases_resident.json" } }
  }
}
```

| # | Action | Effort | Impact |
|---|---|---|---|
| 2.1 | Migrate `site_manifest.json` entries from positional arrays to **named objects** with `section`, `order`, `audiences[]`, `hidden`. Positional arrays have no slot for an audience field without changing arity — this is the blocking prerequisite. | M | Unblocks everything below |
| 2.2 | **Generate `nav.json` from the manifest.** Delete both Python nav literals and both `_navorder` copies. | M | 184 hand-maintained nav items → 0 |
| 2.3 | **One build entrypoint**: `build_site.py --audience {ms3,res,...}`, filtering by `audiences[]`. Delete the `copytree`. Every audience gets every pass by construction. | L | Third audience becomes a manifest edit, not a fork. `_HIDDEN_INHERITED` disappears |
| 2.4 | Add `audience` to `topic_meta` CTA entries so resident CTAs stop being patched into the built copy. | S | Removes output-directory mutation |
| 2.5 | ✅ **PARTIAL 2026-07-26** — `test_common.py` (29 tests) now covers the tokenizer, the synonym merge policy, keyword union, all HTML passes, pass idempotency, and the page contract (including a regression test reproducing the exact `rp-*` bypass). Wired into CI. Still open: a golden-file snapshot of `nav.json` for the Phase-2 nav generator. | M | Refactor safety net |

**Result:** the `14_Tracks/` design intent — *"overlays, links only, no forked content"* — becomes true instead of aspirational. Sub-I, CAP, Nursing, SW, PGY2, and Patients/Families become manifest rows.

### Phase 3 — Content assurance catches up to structural assurance

| # | Action | Effort | Impact |
|---|---|---|---|
| 3.1 | **Make `safetyLevel` required** in `topic_meta.schema.json` (enum `low\|moderate\|high`). Backfill 58 topics. Closes the escape-by-omission hole on the repo's strongest clinical gate. | M | Highest clinical-safety value in the plan |
| 3.2 | **Freshness gate**: fail (or warn→fail on a date) when `facultyReview.lastReviewed` exceeds N months — suggest 12 for `high`, 24 otherwise. Emit a monthly "expiring attestations" report feeding the existing attest workflow. | S | The single missing dimension in the attestation system |
| 3.3 | **Unify attestation into one ledger** — ✅ **already designed and approved**; see §2b. Ship it. The follow-through this review adds: once it lands, shrink the 892-LOC consistency validator to a thin derivation check, since most of its checks become structurally impossible. | L | Removes the largest accidental-complexity mass in the repo |
| 3.4 | **Turn on `STRICT=1`** in CI (not on Netlify prod) after clearing the current soft backlog. Soft findings that never block are documentation, not gates. | S | Reclaims 6 existing checks |
| 3.5 | Add `test_validate_topic_meta.py` — the only core validator without one. | S | Closes the coverage asymmetry |
| 3.6 | Add a **reading-level check** on learner- and family-facing markdown (Flesch-Kincaid; warn-only first). Currently zero coverage; matters most for `10_Patient_and_Family_Education/` and any future Patients/Families track. | M | Prerequisite for the family-facing audience |

### Phase 4 — Content topology and contributor experience

| # | Action | Effort | Impact |
|---|---|---|---|
| 4.1 | **Separate `source/` from `raw/`.** Move Notion exports, transcripts, and reading-list dumps out of `NN_Category/` into `99_Archive/raw/` or an unpublished sibling. Target: files in `NN_Category/` are *candidates to ship*. | M | Makes the 424→66 ratio legible; sharpens the orphan check |
| 4.2 | **Broaden the orphaned-source check** to all `NN_Category/**/*.md` once 4.1 lands, with an explicit `"unpublished": true` opt-out in the manifest. | S | Closes the "dropped page" class properly |
| 4.3 | **Archive root docs** to `docs/_archive/YYYY-MM/`. Keep at root only: `README`, `CLAUDE`, `AGENTS`, and the one live roadmap. | S | 26 → 4 |
| 4.4 | **Author a `CONTENT_CONTRIBUTION.md`** — the "add a page" path end-to-end. After Phase 2 this is a manifest row + a markdown file; today it is 4 edits in 2 languages. | S | Makes co-authoring by other faculty viable |

---

## 4. Sequencing rationale

**Do 1.1 before the risk-aware publishing implementation.** This is the one genuinely time-sensitive item: that work is approved and imminent, and under the current structure it must touch both assembly scripts. Extracting `common.py` first turns two edits into one and stops the next drift before it is written. (See §2b.3.)

**Do 1.3 next** (assert-on-no-op) — a few hours, and it converts the most dangerous silent failure mode into a loud one *before* any larger refactor moves the ground.

**Do Phase 2 before adding audience #3.** The marginal cost of a third fork is ~240 LOC and a third drifting synonym table; the refactor costs roughly the same and is paid once. Every audience after that is nearly free.

**Phase 3.1 is the highest clinical-value item here** and is independent of the build refactor — it can run in parallel, and it feeds directly into the risk-classification migration step that the approved design already calls for.

---

## 5. Metrics to watch

| Metric | Today | Target |
|---|---|---|
| LOC duplicated between audience builds | ✅ **0** (was ~180) | 0 |
| Drifted synonym groups / TOOLKW values | ✅ **0 / 0** (was 22 / 15) | 0 |
| Shipped pages verified by a build-failing contract | ✅ **48** (23 ms3 + 25 res; was 0) | all |
| Assembler unit tests | ✅ **29** (was 0) | — |
| Hand-maintained nav items | 184 | 0 (generated) |
| Locations edited to ship one dual-audience page | 4 | 1 |
| Topics with explicit `safetyLevel` | 13 / 71 | 71 / 71 |
| Topics with `facultyReview.lastReviewed` | 13 / 71 (**a different 13**) | 71 / 71, same set |
| `build_deploy.py` executions per CI run | 4 | 2 |
| `.md` in `NN_Category/` that never ship | 229 / 295 | ~0 (raw material relocated) |
| Attestation ledgers | 5 | 1 (+ derived views) |
| Assembler test coverage | ~1 narrow assertion | golden-file snapshot |

---

## 6. What not to change

Explicitly out of scope, and deliberately so: the registry/schema pairing, the `cw_*`/`rp_*` namespace rule, the dose-literal bans, the CDN-host ban and vendored runtime, the source-map orphan check, the `sp-proxy` key-server-side design, and the `CLAUDE.md`/`AGENTS.md` parity check. These are the parts of the architecture that are working.
