# ADR-002 — `shipped_pages.json`: one derived source for "what ships"

- **Status:** Accepted, Phase 1 implemented
- **Date:** 2026-09-04
- **Owner:** Joshua Moss, MD
- **Scope:** `13_Faculty_Resources/_automation/site_build/` and the faculty attestation family
- **Follows:** #517 (the console read a second producer), #521 (the CLAUDE.md gotcha)
- **Decision record:** `decisions.json` → `shipped-pages-single-source`

## Context

"What ships" is the set of pages and tools the two learner deploys publish. Every
attestation guarantee the library makes rests on it: `reviewed.json` is keyed by
built slug, the faculty console shows what it can enumerate, and
`validate_attestation_consistency.py` fails when a shipped page has no ledger row.

That set had **five producers**, not one, and none of them knew about the others:

| # | Producer | What it adds | Where it lives |
|---|---|---|---|
| 1 | `site_manifest.json` | 69 shared pages + 22 shared tools, both sites | tracked JSON |
| 2 | `ORIENT_VIDEO` in `build_deploy.py` | `orientation-video.html`, MS3 only | a literal inside the build script |
| 3 | `cotw_registry.json` + `_cotw_slug()` | 11 weeks × MS3/resident = 22 pages | a formula copied into five files |
| 4 | `RES_EXTRA` in `resident_section.py` | 6 resident-only pages | a literal inside the build script |
| 5 | `PROTO_TOOLS` in `resident_section.py` | 3 resident-only tools | a literal inside the build script |

Against that, **more than fifteen production consumers read `site_manifest.json`
directly**, several re-deriving the Case-of-the-Week slug privately:
`validate_curriculum.py`, `validate_claim_anchors.py`,
`validate_attestation_consistency.py`, `validate_tool_governance.py`,
`validate_registry_schemas.py`, `surface_governance.py`,
`export_curriculum_review.py`, `library_coverage_scan.py`,
`generate_evidence_drill.py`, `governance_digest.mjs`, `pairings_block.py`,
`frontdoor/fd_data.js`, `anki/pcl_anki/release.py`, `bin/sweep_unlicensed_claims.py`,
`tools/pdf_library_export/`, `.claude/hooks/clerkship_guards.py`, and the faculty
console.

Neither producer 2, 4 nor 5 was enumerable at all without executing a build, and
both build scripts have import-time side effects (they delete and rebuild a
directory) that make importing them impossible.

**The consequence already happened, twice.**

1. From 2026-07-09 to 2026-09-04 the console derived its queue from producer 1
   alone. All 22 Case-of-the-Week pages sat at `status: "pending"` in
   `reviewed.json` with no surface able to show them. Nothing was red for two
   months, because the console displayed *something*. Fixed in #517 by teaching the
   console about producer 3.
2. Producers 2, 4 and 5 were still invisible. `NOT_REVIEWABLE_IN_CONSOLE` excluded
   `rp-agitation.html` and `rp-brief-psych.html` on the recorded grounds that they
   "ship on no learner site" — while `resident_section.py` was copying both into
   `_build/res/tools/` on every resident deploy. Two pending items that ship were
   marked unreviewable. This ADR's own gate is what surfaced it.

#517's fix was a **vigilance** control: a comment telling the next author to
remember the second source. Vigilance is exactly what failed, and it would have had
to hold for producers nobody had enumerated.

## Decision

Introduce one tracked, generated, deterministic artifact —
`13_Faculty_Resources/_automation/site_build/shipped_pages.json` — that is:

1. **Derived**, by `shipped_pages.py`, from every producer. Nothing is re-typed:
   the Case-of-the-Week formula moved to `cotw_slug.py` and the three build-script
   literals to `site_extras.py`, both imported by the builds and by the derivation.
2. **Verified against reality on every build.** `build_and_check.sh` runs
   `shipped_pages.py --check-build <OUT> --site ms3|res` after each build and
   **fails the build** on any disagreement in either direction — a tracked slug the
   build did not produce, or a published slug nothing tracks. This is the load-bearing
   part: it is a derivation *from* the build, not a second thing to remember.
3. **Kept fresh.** `--check` regenerates in memory and diffs against the tracked
   file, in `ci.yml`, in `bin/verify.sh`, in the build, and in the post-edit hook.
4. **The only thing new code reads** for "what ships".
   `tests/shipped-pages-readers.test.mjs` freezes the set of files still naming a
   producer in a string literal; that list may only shrink.
5. **Schema-checked**, as a registered pair in `validate_registry_schemas.py`.

Shape: `{version, _note, generated_from, pages[]}`, each page carrying
`{slug, kind, sites, title, source, producer}` with
`producer ∈ {site_manifest, ms3_extra_tool, cotw_registry, resident_extra, resident_tool}`.
Sorted by slug, sorted keys, 2-space indent — byte-identical for identical inputs.

Current content: **123 items** = 91 `site_manifest` (69 pages + 22 tools)
+ 1 `ms3_extra_tool` + 22 `cotw_registry` + 6 `resident_extra` + 3 `resident_tool`.
MS3 publishes 103 of them, the resident site 111; both numbers are checked against
`find _build/<site>` on every build.

`generated_from` records a sha256 per producer. It is **informational** — it lets a
reader explain a staleness failure. The gate is regenerate-and-diff, never a hash
comparison.

### Phase 1 (this change)

The attestation family, which is what both incidents were about:
`faculty-console/content-universe.mjs`, `faculty-console/check_pending_visible.mjs`,
`faculty-console/netlify/functions/attest.mjs`, and
`validate_attestation_consistency.py` (whose private `cotw_built_slugs()` is deleted).

### Human gate (non-negotiable)

Unchanged: nothing here attests anything. Faculty sign-off still happens in the
console and still lands in `reviewed.json`. What changes is that the console can now
show every page that ships, which is the precondition for that sign-off meaning what
it says.

## Consequences

**The good.**

- The build cannot publish a page nobody can attest. That is now a build failure with
  the slug named, not a silence.
- The Case-of-the-Week slug has exactly one Python definition and one JavaScript
  definition, with a test that runs the Python one over the real registry and compares.
- Two resident-only tools that ship became attestable, and the six resident-only pages
  and the orientation video joined the console universe. The universe went from 113 to
  123; the extra 10 are what the resident build always shipped and nothing enumerated.
- A new producer is now a small, obvious edit in one place (`site_extras.py` +
  `shipped_pages.py`), and forgetting it fails the build rather than going unnoticed.

**The cost — one genuinely new failure mode.** The tracked file can go stale: someone
edits `site_manifest.json` or `cotw_registry.json` and does not regenerate. That is
caught four ways (`ci.yml`, `bin/verify.sh`, `build_and_check.sh`, and the post-edit
hook), and every failure message prints the exact command:

```
python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --write
```

This is a deliberate trade: a loud, one-command staleness failure in place of a
silent, months-long invisibility failure.

**Not changed by this ADR:** which pages ship, site navigation, `reviewed.json`, the
learner UI. Both learner builds were verified byte-for-byte identical before and
after (238 files on MS3, 250 on resident).

### Phase 2 — the readers still to migrate

Each still re-derives what ships for itself, and several still carry a private copy
of the Case-of-the-Week patch. They are frozen in
`tests/shipped-pages-readers.test.mjs`; migrating one means deleting its line there.
Separate PRs, in rough order of payoff:

1. `validate_curriculum.py` — its totality guard is the closest analogue of the
   original bug.
2. `surface_governance.py` — carries `_ADDITIONAL_TOOL_SOURCES`, a hand-synced
   miniature of `site_extras.py`'s tool list.
3. `validate_tool_governance.py` — `SITE_EXTRAS`, the list the above mirrors.
4. `export_curriculum_review.py` — has its own inline COTW slug format string.
5. `validate_claim_anchors.py`, `library_coverage_scan.py`,
   `generate_evidence_drill.py`, `pairings_block.py`, `governance_digest.mjs`,
   `frontdoor/fd_data.js`, `anki/pcl_anki/release.py`,
   `bin/sweep_unlicensed_claims.py`, `tools/pdf_library_export/`.

Two readers are **partially** migrated on purpose and will keep a manifest read:
`attest.mjs` (the question bank's page anchors and its conflict revision) and
`validate_attestation_consistency.py` (per-entry source paths for the source-banner,
tool-metadata and case-pack checks). Both ask `shipped_pages.json` what ships.

## Alternatives considered

- **Keep the #517 fix and write a better comment.** Rejected: it is the same
  vigilance control that had just failed, and it would have had to cover three
  producers nobody had enumerated.
- **Make the console read all five producers.** Rejected: it makes every consumer
  carry the full producer inventory, so the sixteenth reader is as fragile as the
  first, and there is still nothing checking any of them against the real build.
- **Derive at build time only, and have consumers read the build output.** Rejected:
  the console and the validators run where `_build/` does not exist (Netlify
  functions, CI gates before the build, the pre-commit hook). A tracked file that the
  build *verifies* gives both — availability everywhere, and truth checked against
  the build.
- **Make `shipped_pages.json` hand-authored and the manifest derived from it.**
  Rejected as a much larger change to the producers, and it would not have covered
  producers 2, 4 and 5 either.
