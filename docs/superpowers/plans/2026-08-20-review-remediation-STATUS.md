# Review Remediation — Status Tracker

Companion to `docs/superpowers/plans/IMPLEMENTATION_HANDOFF_2026-08-20.md`.
Clinical author-of-record: **Joshua Moss, MD**. Content source of truth for Wave 1/4:
`docs/superpowers/specs/SPEC_Withdrawal_Instrument_Redesign_v1.md`.

**Update this file in the same commit as the work it describes** (handoff §4).

## Status legend

`todo` · `in-progress` · `pr-open` · `blocked-review` (AGENT+REVIEW, awaiting clinical sign-off) ·
`blocked-author` (AUTHOR-GATED, awaiting content) · `merged`

## Work packages

| Wave | WP | Title | Owner | Status | Branch | PR | Blocker |
|---|---|---|---|---|---|---|---|
| 0 | WP-00 | Branch, tracking file, verification baseline | AGENT | in-progress | `chore/wp-00-remediation-baseline` | — | — |
| 1 | WP-01 | Capacity: `'na'` bug + disable Copy note | AGENT | todo | — | — | — |
| 1 | WP-02 | COWS legal-value arrays | AGENT | todo | — | — | — |
| 1 | WP-03 | CIWA bands + delete unconditional directive | AGENT+REVIEW | todo | — | — | — |
| 1 | WP-04 | Withdrawal seizure window overlap | AGENT+REVIEW | todo | — | — | — |
| 1 | WP-05 | BFCRS anchors, invalid scores, malignant interrupt | AGENT+REVIEW | todo | — | — | — |
| 1 | WP-06 | C-SSRS timeframes, stale answers, admin panel | AGENT+REVIEW | todo | — | — | OPEN-DECISION-3 blocks 6e |
| 1 | WP-07 | Violence page: delete count directive | AGENT | todo | — | — | — |
| 1 | WP-08 | SP: punitive regexes, crisis path, keep 403 | AGENT+REVIEW | todo | — | — | needs 2nd reviewer |
| 2 | WP-09 | Daily Review: shuffle options | AGENT | todo | — | — | — |
| 2 | WP-10 | Shelf Mode: disable + remove false copy | AGENT | todo | — | — | — |
| 2 | WP-11 | Case banks: randomize at render | AGENT | todo | — | — | — |
| 2 | WP-12 | Formative labelling + honest attempts | AGENT | todo | — | — | — |
| 2 | WP-13 | Draft-badge bug + attestation coherence | AGENT | todo | — | — | — |
| 2 | WP-14 | Diagnostic Reasoning: blind repeat practice | AGENT | todo | — | — | WP-11 |
| 3 | WP-15 | CI gate: positional + length cues | AGENT | todo | — | — | WP-11 |
| 3 | WP-16 | `quizzes.json` governance | AGENT | todo | — | — | WP-09 |
| 3 | WP-17 | Content-hash attestation in CI | AGENT | todo | — | — | — |
| 3 | WP-18 | Trap-name consistency + 3 stale `why` | AGENT+REVIEW | todo | — | — | WP-17 |
| 3 | WP-19a | Distractor-rationale leak migration | AGENT | todo | — | — | WP-16 |
| 4 | WP-20 | CIWA-Ar + COWS as rating instruments | AGENT+REVIEW | todo | — | — | WP-02, WP-03 |
| 4 | WP-21 | Serial trending | AGENT | todo | — | — | WP-20 |
| 4 | WP-22 | BFCRS pre/post Δ% | AGENT+REVIEW | todo | — | — | WP-05, WP-21 |
| 4 | WP-23 | PAWSS pre-screen card | AUTHOR-GATED | blocked-author | — | — | WP-20 + content |
| 5 | WP-24 | Catatonia + acute dystonia | AUTHOR-GATED | blocked-author | — | — | content |
| 5 | WP-25 | Fentanyl-era buprenorphine + qbank re-keys | AUTHOR-GATED | blocked-author | — | — | content |
| 5 | WP-26 | Citation + landmark-trial corrections | AGENT+REVIEW | todo | — | — | — |
| 5 | WP-27 | Dose policy rewrite | AGENT+REVIEW | todo | — | — | content §12.9 |
| 5 | WP-28 | Evidence registry wiring | AGENT | todo | — | — | — |
| 5 | WP-29 | Six consult pages | AUTHOR-GATED | blocked-author | — | — | content |
| 6 | WP-30 | Coverage → patient-side emission | AGENT+REVIEW | todo | — | — | WP-08 |
| 6 | WP-31 | Gates → authored preconditions | AUTHOR-GATED | blocked-author | — | — | WP-30 + content |
| 6 | WP-32 | Evaluator quote enforcement, strengths floor 0 | AGENT | todo | — | — | WP-08 |
| 6 | WP-33 | Adversarial transcript suite | AGENT | todo | — | — | WP-30, WP-32 |

## Open decisions (author resolves)

| id | Decision | Raised in | Status |
|---|---|---|---|
| OPEN-DECISION-1 | Delete `verdict()` and convert capacity module to a structured report? | WP-01 | open |
| OPEN-DECISION-2 | Attest `decision-aids.html`, or suppress the attested→unattested outbound link? | WP-04 | open |
| OPEN-DECISION-3 | C-SSRS licensing for verbatim reproduction on two public sites | WP-06 | open |
| OPEN-DECISION-4 | Build the BVC, or correct the markdown pointing at a nonexistent Brøset tool? | WP-07 | open |
| OPEN-DECISION-5 | Wire Shelf Mode to `question_bank.json`, or generate `SHELF-*` decks? | WP-10 | open |
| OPEN-DECISION-6 | Case-level attestation, or inherit page-level? (Not both.) | WP-13 | open |
| OPEN-DECISION-7 | Do unattested drafts ship? (46 of 189 served items) | WP-17 | open |
| OPEN-DECISION-8 | Move the communication bank to two-tier? | review §8.4 | open |
| OPEN-DECISION-9 | Is the SP going live this academic year? Determines whether WP-08b is Tier 0 | review §5.2 | open |
| **OPEN-DECISION-10** | **Source documents committed to the repo by WP-00 — confirm or revert.** See "WP-00 notes". | WP-00 | **needs confirmation** |

## Burn-down counters

Populated as the gates land; each must be printed on every CI run so it cannot be quietly forgotten.

| Counter | WP | Baseline | Current |
|---|---|---|---|
| `validate_item_cues` allowlist size | WP-15 | not yet measured | — |
| Distractor-rationale leaks (`quizzes.json`) | WP-19a | 175 / 437 questions (393 options) | — |
| Attested items drifted since 2026-07-05 | WP-17 | not yet measured | — |
| Cases `draft` under a `reviewed` tool page | WP-13 | 22 across 5 banks | — |
| Registry sources referenced by nothing | WP-28 | 26 / 36 | — |

## Verification baseline (WP-00, `origin/main` @ `99b6871`)

Captured 2026-08-20 on macOS. Every subsequent WP is measured against this.

| Check | Result |
|---|---|
| `validate_registry_schemas.py` | OK — 7 registries |
| `test_validate_registry_schemas.py` | OK |
| `validate_topic_meta.py` | OK — 72 topics |
| `validate_attestation_consistency.py` | OK — 88 manifest items, 22 topic entries |
| `node --test tests/*.test.mjs` | **1089 pass / 0 fail** |
| `node tests/contrast-check.mjs` | OK |
| `npm --prefix sp-proxy test` | **241 pass / 0 fail** |
| `_prototypes/sp-interview/tests/run-all.sh` | **4 pass / 0 fail** (ALL SUITES PASSED) |
| `build_and_check.sh ms3` | PASS — `hard:0 soft:7 info:4` |
| `build_and_check.sh res` | PASS — `hard:0 soft:10 info:6` |

Playwright smoke is a separate suite (`cd tests/smoke && npm ci && npx playwright test`) and is
**not** runnable from repo root. Its config has no `webServer` block, so ports 4200 (ms3),
4201 (res) and 4202 (faculty-console) must be served first or every spec fails `ECONNREFUSED`.
Verify a served port exposes *your* build — a stale `http.server` from another worktree answers
`200` with the right page titles and the wrong code.

## WP-00 notes

**Source documents were untracked in the primary working tree** (`/Users/jm/Psychiatry-Clerkship-Library`),
on branch `fix/table-scroll-desktop-affordance-v2`, and therefore invisible to every worktree —
the exact failure CLAUDE.md's "Cowork ↔ Claude Code Handoff" section documents. WP-00 copies them
into the repo, byte-verified by SHA-256, at the conventional locations:

| Source | Committed to |
|---|---|
| `IMPLEMENTATION_HANDOFF_2026-08-20.md` | `docs/superpowers/plans/` |
| `CLINICAL_AND_INSTRUMENT_REVIEW_2026-08-20.md` | `docs/superpowers/plans/` |
| `SPEC_Withdrawal_Instrument_Redesign_v1.md` | `docs/superpowers/specs/` |

Filenames are unchanged so the handoff's own cross-references ("SPEC §2.2") stay resolvable.
This is **OPEN-DECISION-10** — it is a judgement call made to unblock Wave 1, and it is reversible.
WP-02 and WP-20 require the SPEC verbatim under Ground Rule 1; they cannot proceed while it is
readable only from one worktree's untracked working tree.

**CI is currently unavailable.** GitHub Actions is blocked at the account level
("recent account payments have failed or your spending limit needs to be increased", confirmed
2026-08-20 on PR #370 — the job completes in ~4s with zero steps and no log; the message is only
in the check-run annotations API). Branch protection on `main` is currently **disabled**, so a red
check does not block merge. Until billing is restored, the §2 local battery is the gate, and every
PR body should say so explicitly rather than letting a red check imply the work is broken.
