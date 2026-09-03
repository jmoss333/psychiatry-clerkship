# Pairings Registry — Implementation Plan

**Date:** 2026-09-03
**Branch:** `claude/library-gaps-podcasts-books-2t7p96`
**Status:** **Plan for approval. Not implemented.** No code, registry, schema or source page
is changed by this document.
**Revised 2026-09-03** after automated review on PR #478 corrected three real errors: audience
scoping is not free (§4 — the resident `copytree`), the proposed P0 could not pass its own gates
(§7), and the renderer test would never have run (§9, §12).
**Companion to:** `2026-09-03-library-gap-scan-podcasts-books-audiobooks.md` §7.3, which named
this as the highest-value structural repair that needs no new content.

---

## 1. The idea in one sentence

Join what the library already owns — a book, its audiobook edition, a podcast episode, an
`audio_oe` landmark brief, and the topic page — into **one topic-keyed pairing**, and inject the
matching pairing into each weekly page at build time, so two flat alphabetical lists become a
six-week arc that tracks the curriculum.

**The proof it is real, not hypothetical:** *Mind Fixers* (Anne Harrington) already exists as a
book, as an audiobook (narrated by Joyce Bean), **and** as a PsychEd book-club episode from March
2025. The pairing exists in the world; the library just has no way to express it.

### What a learner sees

Today, Week 5 (Acute/Emergency) says "Suggested reading: …" and names three papers. Under this
plan it also carries, injected and never hand-maintained:

> **This week's pairing — Delirium**
> **Read** [Delirium](?page=delirium.md) · **Listen (1:47)** *Stopping delirium with the HELP
> trial* — landmark brief · **Practice** [Decisional Capacity](?tool=capacity.html)
> *Suggested, not required. Every item already ships in this library.*

That is the **P1 shape: internal assets only**, which is what makes it safe to ship before any
external candidate is approved. A fourth *Go deeper* row (e.g. The Curbsiders #375, *Delirium in
the Hospital*) is P2 and arrives only with a verification stamp — see §3 and §7.

A rendered preview of this block on the real Week 5 page, switchable between off / one-line /
internal-only / with-external, was produced for review on 2026-09-03.

---

## 2. Why this is cheap — the constraints it sidesteps, and the one it does not

Most additions to this repo are expensive because they trip governance machinery. This one avoids
most of it, and pays one cost deliberately. The first draft claimed it tripped *none* — review on
PR #478 corrected that; the renderer test cannot avoid the `ci.yml` contracts (§9).

| Usual cost | Why it does not apply |
|---|---|
| **A new page must be registered in `site_manifest.json` AND in nav inside `build_deploy.py`, or the QA gate's orphaned-source check hard-fails the build** | **No new page.** Pairings are injected into six existing week pages. `site_manifest.json` and the nav array are untouched. |
| **`CLAUDE.md`: "Adding a step to `ci.yml` trips three separate contracts"** — `check-verify-coverage.py`, `validate_scheduled_workflows.py` (exact step inventory **and** a sha256 of the whole file), and the `PAIRS` tuple | **Avoided for the validator**, which piggybacks on the existing `Validate — registry schemas` step via the semantic-diagnostics hook; only the `PAIRS` tuple changes. **Not avoided for the renderer test** — nothing globs `site_build/test_*.py`, so it needs a real `ci.yml` step, a `verify.sh` mirror and a digest recompute (§9). This row overstated the saving in the first draft. |
| **New client state must use `cw_*` / `rp_*` localStorage namespaces or the QA gate hard-fails** | **No client state.** The block is static markdown injected at build time. No JS, no storage, no namespace risk. |

The pattern being copied is already proven in this repo twice over:

- **`crisis_block.py`** — a JSON source of truth, a renderer, a `<!-- marker -->` that pages opt
  into, injection inside the md copy loop, and a hard-fail when a required surface loses its
  marker. Pairings mirror this almost exactly.
- **`cotw_registry.json`** — the Case of the Week is registry-driven, and its own comment states
  the goal plainly: *"The weekly automation only prepends one entry there + drops two source files
  — no edits to this script or the manifest."* That is the bar: adding a pairing must be a
  registry edit, never a code edit.

---

## 3. Data model — `pairings.json` + `pairings.schema.json`

Two new root files, validated as the **tenth** registry pair.

```jsonc
{
  "_note": "Topic-keyed pairings joining library assets. One pairing may serve many weeks.",
  "pairings": [
    {
      "id": "pair_delirium",
      "topic": "Delirium",
      "weeks": [5],
      "audiences": ["ms3", "res"],
      "blurb": "The medical emergency that looks psychiatric.",
      "items": [
        { "role": "read",     "kind": "page",     "ref": "delirium.md" },
        { "role": "listen",   "kind": "audio_oe", "ref": "38" },
        { "role": "practice", "kind": "tool",     "ref": "capacity.html" },
        {
          "role": "deeper", "kind": "podcast",
          "show": "The Curbsiders", "episode": "#375 Delirium in the Hospital",
          "url": "https://audioboom.com/posts/8225246-375-delirium-in-the-hospital-featuring-dr-esther-oh",
          "note": "Dr. Esther Oh, President, American Delirium Society. Free CME.",
          "verifiedOn": "2026-09-03", "verifiedBy": "search-attested"
        }
      ]
    }
  ]
}
```

### Item kinds, and why the split matters

| `kind` | Resolves to | Link rot? |
|---|---|---|
| `page` | `?page=<slug>` — must exist in `site_manifest.json`'s md list | **none** — internal |
| `tool` | `?tool=<file>` — must exist in the tools list | **none** — internal |
| `audio_oe` | a row in `12_Media/audio_oe/MANIFEST.csv` by `number` | **none** — shipped audio |
| `book` / `audiobook` | title, author, `isbn13`, optional `url` | external |
| `podcast` | show, episode, `url` | external |

**Three of the five kinds are internally resolvable.** That is deliberate: the pairing's spine is
made of things the library already owns and can validate, and external media is the optional
fourth leg. A pairing stays useful even if every external link dies.

### `verifiedOn` / `verifiedBy` — carrying the gap scan's honesty forward

Every external item carries a verification stamp. This is the direct answer to the companion
document's §0.2 problem (no link in the gap scan was ever opened, because this environment blocks
outbound HTTP). Two allowed values:

- `"search-attested"` — a search engine returned it; nobody opened it. **The state every item from
  the gap scan starts in.**
- `"opened"` — a human or a tooled agent loaded the page and confirmed it.

This makes link quality **queryable data** rather than a caveat buried in prose, and it gives the
future link-check pass (gap scan §6 step 1) something to write its results into. A reporting
script can then answer "what is stale?" without re-reading anything.

---

## 4. Renderer — `site_build/pairings_block.py`

Mirrors `crisis_block.py` in structure, naming, and determinism discipline.

```python
MARKER = "<!-- pairing-block -->"   # content pages only; no HTML/tool variant in P0

def load(lib_root)                  -> dict          # read + sanity-check pairings.json
def resolve(data, lib_root)         -> dict          # attach audio_oe titles from MANIFEST.csv
def render_markdown(pairing, ctx)   -> str           # one blockquote, same shape as crisis block
def inject_markdown(text, data, week, audience) -> (text, injected)
```

**Determinism is a hard requirement.** `crisis_block.py` documents why: *"the 'verified' line uses
the latest `verifiedOn` recorded in the DATA, never build time, so the build stays
byte-reproducible."* Pairings must obey the same rule — the rendered "verified" date comes from
`verifiedOn` in the registry, never `date.today()`. A build that is not byte-reproducible breaks
the visual-regression baselines in `tests/smoke/`.

**Audience scoping is NOT free — the first draft was wrong.** Corrected after review on PR #478.
`build_deploy.py` does **not** render the two sites independently: it builds MS3, then
`resident_section.py` starts the resident site as `shutil.copytree(MS3, OUT)` (line 20) and
strips/overrides from there. Because `inject_markdown` **consumes the marker**, a block rendered on
the MS3 side rides along in that copy — so an audience-scoped registry would silently ship MS3's
pairing to residents, omit resident-only pairings, and keep MS3-only ones.

`crisis_block` already solved exactly this, and pairings must copy the solution rather than
re-discover it. `resident_section.py` (lines ~77–95) re-runs `crisis_block.inject_markdown` over
**every** `OUT/content/*.md` after the copytree, relying on marker consumption to make the
already-injected MS3 pages a no-op while catching resident-only pages written fresh. Its own
comment records the cost of not doing this: until 2026-09-02 nothing caught the gap, and the first
resident-only page to opt in "would have shipped as an invisible HTML comment with no contacts at
all."

So the plan needs **two injection passes**, not one:

| Pass | Where | Covers |
|---|---|---|
| MS3 | `build_deploy.py` md copy loop | every page on the MS3 site |
| Resident | `resident_section.py`, after the copytree, before the strip/contrast passes | resident-only pages, and any audience-scoped re-render |

**Consequence for audience scoping:** a resident-specific pairing cannot simply be *skipped* on the
MS3 side, because the marker would reach the resident pass already consumed. Either the resident
pass re-renders from a distinguishable, unconsumed marker (`<!-- pairing-block:res -->`), or **P1
ships one pairing set for both audiences** and scoping is deferred. **P1 takes the second option** —
the cheapest correct thing, and §11 decision 2 already leaned that way.

---

## 5. Build wiring — the exact insertion point

`build_deploy.py`'s md copy loop (currently ~L301–320) already reads each source, injects the
crisis block, and writes the result. Pairings inject in the same pass — one read, one write:

```python
_pair_data = _pairings.load(LIB)
_pair_done = set()
for src, dst, _ in md:
    ...
    _t, _did = _crisis.inject_markdown(_t, _crisis_data)
    _t, _pdid = _pairings.inject_markdown(_t, _pair_data, dst, AUDIENCE)   # <-- added
    if _did or _pdid:
        open(OUT + "/content/" + dst, "w", encoding="utf-8").write(_t)
    if _pdid: _pair_done.add(dst)

# Same hard-fail shape as the crisis gate: a week page that lost its marker fails the build.
_pair_gap = sorted(_PAIRINGS_REQUIRED_MD - _pair_done)
if _pair_gap:
    print("BUILD ABORTED — pairing block missing from week page(s):")
    ...
    raise SystemExit(1)
```

`_PAIRINGS_REQUIRED_MD = {"week1.md", …, "week6.md"}`. The failure this prevents is the same one
the crisis gate prevents: a marker silently deleted during an unrelated edit, and nobody notices
the block stopped rendering.

### Source edits — six lines, total

One marker per week page, placed after the existing **Suggested reading:** line:

```
01_Six_Week_Curriculum/Week_1_Foundations/README.md      + <!-- pairing-block -->
… Week_2 … Week_6                                         (5 more, identical)
```

Nothing else in the week pages changes. The week themes stay where they are (hardcoded in
`build_deploy.py` L334): Foundations · Mood/Psychosis/Pharm · Psychotherapy/Personality ·
Family/Systems/EE · Acute/Emergency · Integration/Exam.

---

## 6. Validation — a semantic gate, not a new CI step

`validate_registry_schemas.py` already runs **semantic** gates alongside schema validation:
`qbank_prefix_diagnostics()` enforces a rule the JSON Schema pattern cannot express, and
`validate_root()` folds its diagnostics into the same output. Pairings use that exact hook.

**Changes required (four small edits, no new CI step):**

1. `validate_registry_schemas.py` — add `("pairings.json", "pairings.schema.json")` to `PAIRS`;
   add `pairings_integrity_diagnostics(document, root)`; call it from `validate_root()` the way
   `qbank_prefix_diagnostics` is called.
2. `test_validate_registry_schemas.py` — add the same tuple to its mirrored `PAIRS`.
3. Docstrings: `"nine root registries"` → ten, and `"the nine fixed registry/schema pairs"` (L184)
   → ten.
4. **Pre-existing bug worth fixing in the same pass:** the test method is named
   `test_all_eight_current_document_schema_pairs_pass` but already validates **nine** pairs. It
   will read "eight" while checking ten. Rename it.

### What the semantic gate enforces (JSON Schema cannot)

| Check | Failure it prevents |
|---|---|
| every `kind: "page"` ref exists in `site_manifest.json`'s md list | a pairing links to a page that was renamed or dropped |
| every `kind: "tool"` ref exists in the tools list | same, for tools |
| every `kind: "audio_oe"` ref exists in `MANIFEST.csv` | a brief was renumbered and the pairing points at nothing |
| every `weeks` entry is 1–6 | a pairing that can never render |
| each `[week, audience]` has ≥1 pairing | a week page renders an empty block |
| `id` is unique and matches `^pair_[a-z0-9_]+$` | duplicate/ambiguous ids |
| external items carry `verifiedOn` + `verifiedBy` | an unverified link ships with nothing recording that |
| `isbn13` matches `^97[89][0-9]{10}$` when present | the malformed-ISBN class the gap scan warned about |

**Dangling references fail the build, not the learner.** That is the whole point of putting this in
the registry gate rather than trusting the renderer to degrade quietly.

---

## 7. Phasing

| Phase | Deliverable | Size |
|---|---|---|
| **P0 — walking skeleton** | Renderer, schema, **both** injection passes (§5), build wiring, semantic gate, and `pairings.json` seeded for **all six weeks** (one internal-only pairing each) with a marker in all six week pages. | ~1 sitting |
| **P1 — internal-only spine** | Six pairings, one per week, using **only** `page` / `tool` / `audio_oe` items. **Zero external links, so zero unverified claims.** This is shippable without the link check. | small |
| **P2 — external leg** | Add `book` / `audiobook` / `podcast` items from the gap-scan slate — **gated on the link check** (gap scan §6 step 1). Every item lands as `verifiedBy: "opened"` or not at all. | after link check |
| **P3 — reporting** | A `--report` flag listing stale/`search-attested` items, mirroring `export_curriculum_review.py`'s report-only posture. Feeds the annual refresh. | optional |

> **Why P0 seeds all six weeks — corrected after review on PR #478.** The first draft proposed a
> one-pairing, one-marker Week 5 skeleton, which **its own gates would have rejected**: §6 requires
> at least one pairing per week and §5 makes all six week pages required markers, so a Week-5-only
> registry fails the semantic gate and a Week-5-only marker fails `_PAIRINGS_REQUIRED_MD` before
> anything renders. The choice was to seed all six or defer the completeness gates to P1. **Seeding
> all six is the right call** — the gates are the part most worth proving early, and six
> internal-only pairings are barely more work than one. It does collapse P0 and P1 into nearly one
> step; that is an honest simplification, not a lost phase.

**P1 is the honest stopping point if the link check never happens.** It uses only assets the
library already ships and validates, so it carries no verification debt at all. That property is
what makes this plan safe to start before the gap scan's candidates are approved.

---

## 8. Failure modes and where each is caught

| Failure | Caught by | When |
|---|---|---|
| Week page loses its marker | `_PAIRINGS_REQUIRED_MD` gate | build, hard-fail |
| Pairing points at a renamed page/tool/brief | semantic gate | CI + `verify.sh` |
| Malformed registry | Draft-07 schema | CI + `verify.sh` |
| A week/audience has no pairing | semantic gate | CI |
| Build stops being byte-reproducible | `tests/smoke/` visual regression | CI smoke job |
| External link rots | `verifiedOn` ageing + P3 report | report-only, never blocks a build |
| Node test goes red and hides all of this | already a known trap — `build_and_check.sh` is `set -euo pipefail` and runs `node --test` **before** `build_deploy.py`, so `_build/` keeps serving stale output while the script merely looks "failed" | run the node suite first when a source edit isn't showing up |

---

## 9. Test plan

- **`site_build/test_pairings_block.py`** (new) — covers: marker absent → text untouched; marker
  present → injected once; the **resident second pass** being a no-op on an already-injected page
  but effective on a fresh one; **determinism** (same input → byte-identical output across two
  calls); unknown `audio_oe` ref → raises.

  **It must be wired in explicitly, and the first draft was wrong to imply otherwise.** Corrected
  after review on PR #478. `ci.yml` and `bin/verify.sh` each invoke exactly two python tests from
  this directory **by name** — `test_media_guard.py` and `test_common.py` — and
  `build_and_check.sh` discovers only Node tests (`node --test tests/*.test.mjs`) plus
  `contrast-check.mjs`. **Nothing globs `site_build/test_*.py`**, so a new file there would never
  run and could regress in silence. Required:

  1. a new step in `ci.yml`'s `build-test-validate` job invoking it;
  2. the mirroring step in `bin/verify.sh` (or an `ALLOWED` exemption with a stated reason) to
     satisfy `bin/check-verify-coverage.py`;
  3. a recomputed contract digest for `_automation/maintenance/validate_scheduled_workflows.py`,
     which pins `ci.yml` by exact step inventory **and** a sha256 of the whole file — computed by
     importing that validator's own `_load`/`_contract_digest`, never by reimplementing its
     canonicalisation.

  **This is the one place the plan does pay the three-contract cost from `CLAUDE.md`.** §2 still
  holds for the *validator* — the semantic gate rides the existing registry-schema step — but a new
  test file cannot dodge it. Better to pay it deliberately than to ship a test that never runs.
- **`validate_registry_schemas.py` self-test** — the existing
  `test_validate_registry_schemas.py` gains pairings via `PAIRS`; add negative fixtures for each
  semantic rule in §6.
- **Smoke** — `tests/smoke/` visual baselines must be regenerated **on Ubuntu/Chromium via the
  "Refresh visual baselines" workflow_dispatch**, never on a laptop. Week pages change
  appearance, so expect exactly six baseline diffs and confirm they are the intended block.

---

## 10. Honest risks

**This could become clutter.** Six more blocks on six pages a student may already skim. Mitigation:
one pairing per week, four items maximum, and the block sits *below* the existing objectives and
reading line rather than above it. If faculty review says it crowds the page, P1 is cheap to
revert — six marker lines and a registry file.

**It hard-codes a curricular opinion.** Choosing *the* pairing for Week 5 asserts that delirium is
that week's centre of gravity. That is a teaching judgement, not an engineering one, and it belongs
to Dr. Moss. The registry makes the opinion explicit and editable rather than implicit — which is
an improvement on the status quo, where the two library pages assert no ordering at all.

**External items inherit unverified links.** Fully mitigated by phasing: P1 ships with none, and P2
is gated on the link check.

**It adds a tenth registry to a repo that already has nine.** Real cost, and the reason this piggybacks
on the existing validator rather than adding its own — one more `PAIRS` row, not one more gate.

---

## 11. Open decisions for faculty

1. **One pairing per week, or a small set?** Plan assumes one. A set is more useful and more
   cluttered; the schema supports both (`weeks` is an array, and multiple pairings may name the
   same week) so this is reversible.
2. **Do MS3 and resident sites get different pairings?** The `audiences` field supports divergence.
   Cheapest start: identical, diverge later.
3. **Does the block belong on topic pages too, not just week pages?** Topic pages are where a
   student lands from search. Deferred — it multiplies the required-marker surface from 6 to ~70.
4. **Does P1 ship before the gap-scan slate is approved?** It can — P1 touches no external
   resource and no unapproved recommendation. Shipping it early would prove the mechanism while
   the candidate slate is still under review.

---

## 12. What this costs, concretely

New files: `pairings.json`, `pairings.schema.json`, `site_build/pairings_block.py`,
`site_build/test_pairings_block.py`.

Edited: `build_deploy.py` (~8 lines, MS3 pass), **`resident_section.py` (~10 lines, the resident
second pass — §4)**, `validate_registry_schemas.py` (~30), `test_validate_registry_schemas.py`
(~3), six week `README.md` (one line each), and — **for the renderer test only, per §9** —
`ci.yml` (one step), `bin/verify.sh` (the mirroring step), and the pinned contract digest in
`validate_scheduled_workflows.py`.

**Not edited: `site_manifest.json`, the nav array.** No page is registered, so the QA gate's
orphaned-source check stays untouched — that was always the load-bearing claim. The first draft of
this section also listed `ci.yml`, `verify.sh` and `validate_scheduled_workflows.py` as untouched;
**that was incorrect**, because the new test cannot run without them (§9).

---

*Joshua Moss, MD | Psychiatry Clerkship Library. Plan prepared 2026-09-03 for approval.
Educational; no PHI; no instrument text; no crisis contacts outside `crisis_resources.json`.*
