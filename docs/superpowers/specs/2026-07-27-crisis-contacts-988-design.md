# Crisis Contacts (988) — Single-Source Safety Block

**Date:** 2026-07-27
**Author:** Joshua Moss, MD | Psychiatrist
**Roadmap item:** `FABLE_PLATFORM_AUDIT_2026-07-15.md` CL-3 / WP-06 / EN-3
**Status:** Approved design

## Problem

The library teaches safety planning but never names a crisis contact.

A sweep of every shipped surface (66 served markdown pages, 20 served HTML tools,
both the `ms3` and `res` builds) found exactly **one** surface carrying any crisis
number — `t_perinatal.md`. Everything else is empty, including:

| Surface | Slug | State |
|---|---|---|
| Core suicide-risk teaching page | `suicide.md` | Names "professionals and crisis resources" as a safety-plan step; never fills it |
| MS3 suicide pocket card | `pg_suicide.md` | Lists "5. Professionals/crisis resources" as an empty slot |
| **Columbia C-SSRS screener** | `cssrs.html` | The library's actual suicide-risk instrument. No crisis contacts at all |
| Violence risk | `violence.md` | None |
| Agitation & restraint | `agitation.md` | None |

`cssrs.html` was not in the original roadmap item and is the sharpest finding: it is
the page a student has open *while actively assessing suicide risk*.

## Verified contact data

Every number verified against its official source on 2026-07-27. Nothing was
transcribed from memory or copied from an existing repo value.

| Resource | Value | Official source |
|---|---|---|
| 988 Suicide & Crisis Lifeline | Call or text **988**; chat chat.988lifeline.org; 24/7, free, confidential | `https://988lifeline.org/` |
| Crisis Text Line | Text **HOME** to **741741** (HOLA for Spanish); 24/7, free | `https://www.crisistextline.org/` |
| Maine Crisis Line | **1-888-568-1112**; 24/7; phone, text, and chat | `https://www.maine.gov/dhhs/obh/support-services/mental-health-services/crisis-services` |
| Veterans Crisis Line | Dial **988 then press 1**; text 838255 | `https://www.veteranscrisisline.net/` |
| Emergency | **911** for imminent danger | n/a — universal |

### Upstream discrepancy found

ReConnect's `databases/core/data_all.json → crisis[1]` stores
`"Text HELLO to 741741"`. The official Crisis Text Line instruction is
**`Text HOME to 741741`**. This warrants a correction PR upstream; it is recorded in
the snapshot's `upstreamDiscrepancies` field so it is not silently lost.

## Architecture decision: vendored snapshot, not live import

The roadmap prefers deriving these contacts from ReConnect's verified crisis data.
A live cross-repo import was evaluated and **rejected** for two hard reasons:

1. **It would break the Netlify build and violate this repo's own CI lint.** Netlify
   checks out only the clerkship repo; `/Users/jm/Code/reconnect-psychiatry-system`
   does not exist on the build runner. Worse, `CLAUDE.md` states: *"No hard-coded
   `/Users` or `/sessions` paths in tracked `.py` — CI lints for this."* A build-time
   read of that path is prohibited by existing repo rules, not merely inconvenient.

2. **ReConnect's crisis data is currently stale, and ReConnect knows it.** Its own
   quality guard reports the crisis category at **10.2% fresh — 115 of 128 records
   past the 90-day verification window**, with two open handoffs
   (`HANDOFF_crisis_freshness_20260720.md`, `HANDOFF_P0_crisis_alerts_20260720.md`).
   The 988/Crisis Text Line/Maine records were last verified 2026-03-16. Importing
   today would import stale data *and* the HELLO/HOME error above.

The existing `provenance/reconnect_snapshot_provenance.json` registry does not fit
either: its schema pins `relation: "exact-copy"` for byte-identical files under
`_source/`. This block is a *derived* rendering of selected fields with independent
verification, so forcing it into that registry would misrepresent the relationship.

**Chosen approach — vendored snapshot + build-time injection:**

- `crisis_resources.json` at repo root (matching the established `question_bank.json` /
  `topic_meta.json` / `communication_cases.json` root-data convention), paired with
  `crisis_resources.schema.json`.
- Each record carries its own provenance: the official `verificationSource` URL, a
  `verifiedOn` date, and the corresponding `reconnectRecord` index upstream.
- A single renderer turns that data into one markdown block. No prose is
  hand-maintained anywhere.
- `build_deploy.py` injects the rendered block at the existing markdown copy loop.
- A dev-only sync tool diffs the snapshot against ReConnect when run on a machine
  that has both repos — a real import path that never executes on Netlify.

### What a true live import would require

Recorded so the tradeoff is not lost:

1. ReConnect publishes its crisis slice as a versioned, network-fetchable artifact
   (npm package, GitHub release asset, or a pinned raw URL), rather than a
   filesystem path.
2. The clerkship build fetches it at a pinned revision with a checksum, with the
   vendored snapshot as the offline fallback (Netlify builds must not depend on
   network availability for safety content).
3. ReConnect's crisis category returns to a green freshness state, so an automatic
   pull is not importing expired records.

Until all three hold, the vendored snapshot is the correct call.

## Components

| File | Purpose |
|---|---|
| `crisis_resources.json` | Verified contact data + provenance. Single source of truth |
| `crisis_resources.schema.json` | Contract: required fields, phone/URL shape, date format |
| `13_Faculty_Resources/_automation/site_build/crisis_block.py` | Renders the data into one markdown/HTML block |
| `13_Faculty_Resources/_automation/validate_crisis_resources.py` | Validates data against schema; run in the build gate and CI |
| `13_Faculty_Resources/_automation/sync_crisis_from_reconnect.py` | Dev-only. Diffs snapshot vs ReConnect; never runs at build |

## Data flow

```
crisis_resources.json  ──►  crisis_block.py (render)
                                  │
                                  ├──► build_deploy.py  ──► _build/ms3/content/*.md
                                  │                     └─► _build/ms3/tools/cssrs.html
                                  │
                                  └──► resident_section.py derives _build/res from _build/ms3
```

**Resident inherits automatically.** `build_and_check.sh res` builds MS3 first, then
`resident_section.py` derives the resident site from `_build/ms3`. One injection point
in `build_deploy.py` therefore covers both sites — no per-site branching, matching the
approved "identical block on both" decision. Both programs are Maine-based (UNE COM;
MMC Sanford), so the Maine Crisis Line applies to both audiences.

## Injection targets

Approved scope — core 3 plus acute safety:

| Target | Kind |
|---|---|
| `suicide.md` | markdown |
| `pg_suicide.md` | markdown |
| `cssrs.html` | tool (HTML) |
| `violence.md` | markdown |
| `agitation.md` | markdown |
| `t_perinatal.md` | markdown — replaces its hand-written 988 mention with the shared block |

## Determinism

The build has a byte-diff reproducibility requirement (frozen time,
`PYTHONHASHSEED=0`). The rendered block therefore uses the **`verifiedOn` date
recorded in the data**, never `datetime.now()`. Identical inputs produce identical
output bytes.

## Testing

- `validate_crisis_resources.py` — schema conformance, and every record has a
  verification source and date.
- Node test asserting the block renders with all required contacts present.
- Build both sites; assert `988`, `741741`, and `1-888-568-1112` appear in each
  injected file in `_build/ms3` **and** `_build/res`.
- Existing gates must stay green: `check-static-site.mjs`, `validate_topic_meta.py`,
  `validate_registry_schemas.py`, `validate_reconnect_snapshot_provenance.py`.

## Non-goals

- Changing any clinical teaching content beyond adding the contact block.
- Modifying ReConnect (the HELLO/HOME correction is filed separately upstream).
- Blanket-adding the block to all 66 served pages, which would dilute it.
- Per-site content branching.

*Joshua Moss, MD | Psychiatrist · Educational; no PHI.*
