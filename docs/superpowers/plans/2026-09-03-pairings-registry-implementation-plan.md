# Pairings Registry — Implementation Plan

**Date:** 2026-09-03
**Branch:** `claude/library-gaps-podcasts-books-2t7p96`
**Status:** **Plan for approval. Not implemented.** No code, registry, schema or source page
is changed by this document.
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
> **Read** [Delirium](?page=delirium.md) · **Listen (2 min)** *The HELP Trial: Multicomponent
> Strategies for Delirium Prevention* · **Go deeper** The Curbsiders #375, *Delirium in the
> Hospital* (Dr. Esther Oh, President, American Delirium Society) · **Practice**
> [Decisional Capacity](?tool=capacity.html)
> *Suggested, not required. External links verified 2026-09-03.*

---

## 2. Why this is cheap — the three constraints it sidesteps

Most additions to this repo are expensive because they trip governance machinery. This one is
designed to trip none of it. These are the findings that make the plan worth doing.

| Usual cost | Why it does not apply |
|---|---|
| **A new page must be registered in `site_manifest.json` AND in nav inside `build_deploy.py`, or the QA gate's orphaned-source check hard-fails the build** | **No new page.** Pairings are injected into six existing week pages. `site_manifest.json` and the nav array are untouched. |
| **`CLAUDE.md`: "Adding a step to `ci.yml` trips three separate contracts"** — `check-verify-coverage.py`, `validate_scheduled_workflows.py` (exact step inventory **and** a sha256 of the whole file), and the `PAIRS` tuple | **No new CI step.** Validation piggybacks on the existing `Validate — registry schemas` step. `ci.yml` is not edited, so no digest recompute and no `verify.sh` mirror step. Only the `PAIRS` tuple changes — the third contract, which is a two-line edit in two files. |
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

**Audience scoping** is free: `build_deploy.py` already builds `ms3` and `res` separately, so
`inject_markdown` takes the audience and skips pairings whose `audiences` array excludes it.

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
| **P0 — walking skeleton** | `pairings.json` with **one** pairing (`pair_delirium`, Week 5), schema, renderer, build wiring, semantic gate, one marker in Week 5. Prove it renders on both sites and the build stays reproducible. | ~1 sitting |
| **P1 — internal-only spine** | Six pairings, one per week, using **only** `page` / `tool` / `audio_oe` items. **Zero external links, so zero unverified claims.** This is shippable without the link check. | small |
| **P2 — external leg** | Add `book` / `audiobook` / `podcast` items from the gap-scan slate — **gated on the link check** (gap scan §6 step 1). Every item lands as `verifiedBy: "opened"` or not at all. | after link check |
| **P3 — reporting** | A `--report` flag listing stale/`search-attested` items, mirroring `export_curriculum_review.py`'s report-only posture. Feeds the annual refresh. | optional |

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

- **`site_build/test_pairings_block.py`** (new) — mirrors `test_media_guard.py` / `test_common.py`,
  which `verify.sh` already runs as a glob-free explicit step. Covers: marker absent → text
  untouched; marker present → injected once; audience filtering; **determinism** (same input →
  byte-identical output across two calls); unknown `audio_oe` ref → raises.
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
Edited: `build_deploy.py` (~8 lines), `validate_registry_schemas.py` (~30),
`test_validate_registry_schemas.py` (~3), six week `README.md` (one line each).
**Not edited: `ci.yml`, `bin/verify.sh`, `site_manifest.json`, the nav array,
`validate_scheduled_workflows.py`.**

---

*Joshua Moss, MD | Psychiatry Clerkship Library. Plan prepared 2026-09-03 for approval.
Educational; no PHI; no instrument text; no crisis contacts outside `crisis_resources.json`.*
