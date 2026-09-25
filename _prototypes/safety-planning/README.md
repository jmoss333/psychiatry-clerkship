# Safety Planning Practice — WP-06R-b shell (preview)

**Status: shell built, clinical content unsigned. Ships to neither site.**

`safety-planning-practice.preview.html` is the agent-executable half of **WP-06R-b**, built against
`docs/superpowers/specs/SPEC_Safety_Planning_Practice_v1_DRAFT.md`, which authorises exactly this
and no more:

> *Claude Code may build the shell against this structure but must not treat any string as final
> until the author marks it so.*

Every clinical string in the file is that spec's first draft, carried over verbatim so the spec and
the tool can be redlined together. Open the file directly in a browser — it is standalone and needs
no build step.

## Why it is not registered

It is deliberately absent from `site_manifest.json` and from nav in `build_deploy.py`, so the
build assembles neither site with it. That is the point: unattested clinical strings on a
suicide-safety surface must not reach a student. Verified — the QA gate reports no orphaned-source
finding and `_build/ms3/tools/` has no safety-planning page.

## What the spec forbids, and where the code enforces it

The Stanley-Brown Safety Plan is copyrighted, and its own terms name **programming the form** as
reproduction — which is why WP-06R-b is a rehearsal tool. Three invariants are therefore enforced
in code rather than asserted in copy (spec §1), and any future edit must keep them:

| Invariant | Where | How to re-check |
|---|---|---|
| The learner's rehearsal text is **never persisted** | one `setItem`, writing ratings only | `grep -n setItem` — must be exactly one hit, and its payload must be `state.ratings` |
| **No export of any kind** — no download, clipboard, print view, or generated document | absent by construction | `grep -in "download\|clipboard\|execCommand\|window.print\|createObjectURL"` — comments only |
| `cw_*` storage namespace | `cw_sp_practice_v1` | `grep -o "cw_[a-z_0-9]*"` |

The spec names the export button specifically as *"the `verdict()` failure mode and the worst PHI
surface the library could add."* It is not a nice-to-have omission.

Crisis numbers are **not** in this file. The `<!-- crisis-block-html -->` marker is present so
promotion out of `_prototypes/` picks up the build-injected block from `crisis_resources.json`
automatically; it renders nothing in the standalone preview.

The official-source route (`suicidesafetyplan.com`) is the one recorded in `instrument_rights.json`
under `stanley-brown`. Keep the two in step — if that route is ever refreshed, this page follows.

## What is missing on purpose

**Effect sizes.** The spec's lethal-means section carries specific numbers (pooled IRRs, percentage
declines, ORs, NNTs). None of them are in this preview. Every one would need a verbatim
`sourceSpan` in `evidence_annotations.json` before it could ship, and the 2026-08-21 pass found 54%
of annotations needed amendment when written from titles rather than results. The three-tier
framing survives without the numbers; the numbers get added by the evidence pass, not by the shell.

## Author checklist before this can be promoted

From the spec's §7, unchanged and all still open:

- [ ] Every model line reads like something you would actually say on your unit
- [ ] The six headings and all step text reproduce nothing from the copyrighted form
- [ ] `LOCAL_POLICY:crisis_contacts` and `LOCAL_POLICY:means_storage` filled or deliberately left as tokens
- [ ] Lethal-means three-tier framing confirmed
- [ ] **MS3 vs resident scope decided** — the shell currently reads as shared
- [ ] Three practice cases finalised as fictional composites
- [ ] `facultyReview` set by you, not by the agent

## Promotion path, once signed

1. Move to `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/safety-planning-practice.html`.
2. Register in `site_manifest.json` **and** nav in `build_deploy.py` — both, or the orphaned-source
   check hard-fails.
3. Add a `tool_registry.json` entry (`riskLevel: high`, and a `disclaimerType`).
4. Swap the local rating store for the build-injected `cw_srs_v1` adapter
   (`/*__SRS_STORE__*` + `/*__SM2_APPLY_GRADE__*` markers, as `family-systems-practice.html` does)
   so the cards join the shared review queue.
5. Add the page to `_CRISIS_REQUIRED_TOOLS` in `build_deploy.py` — a learner rehearsing safety
   planning is doing risk work, which is exactly the scope rule for a crisis surface.
6. Add the effect sizes with their `sourceSpan`s, then run `validate_evidence_annotations.py`.
7. Attest via the faculty console.
