# Review Remediation — Status Tracker

Companion to `docs/superpowers/plans/IMPLEMENTATION_HANDOFF_2026-08-20.md`.
Clinical author-of-record: **Joshua Moss, MD**. Content source of truth for Wave 1/4:
`docs/superpowers/specs/SPEC_Withdrawal_Instrument_Redesign_v1.md`.

**Update this file in the same commit as the work it describes** (handoff §4).

---

## ⚠ HANDOFF AMENDMENTS — read before any edit

### A1. Every `L###` in the handoff is an approximate anchor, not an address

The handoff was written against a mount on branch `fix/table-scroll-desktop-affordance-v2`,
not `main`. Confirmed drift: `DOSE` is at `check-static-site.mjs:68` (handoff says :53); the
`*.pack.json` dose check is at L372-376 (handoff says :284); `doseHard` is at L298 (handoff says
L242-251); the storage-namespace check is at L305-307 (handoff says L253-255).

**Standing rule — locate every edit site by grepping the quoted code string, never by line
number. If the quoted string is not found, STOP and report. Do not edit the nearest plausible
line.** A near-miss edit in a safety instrument that still passes the build is the failure mode
this rule exists to prevent.

### A2. Ground Rule 6 correction — the SP mirror is asymmetric, and parity does not cover all of it

The handoff says "`deriveState` exists in both files." Server-side it does
(`sp.mjs:284`). **Client-side there is no function of that name** — the mirrored logic lives in
`MockProvider`'s prototype methods in `_prototypes/sp-interview/sp-interview.html`, exposed for
testing as `window.__SP_TEST__`. `parity.test.mjs` `eval`s the whole `<script>` block and compares
rapport / coverage / unlocked gates against the server's `_internals`.

**Enumerate before editing.** The mirror has three regions with different risk:

| Region | Server (`sp.mjs`) | Client (`sp-interview.html`) | Parity-covered? | Touched by |
|---|---|---|---|---|
| State constructor | `deriveState` L284, state literal L288 | `MockProvider.start` L229, state literal L234 | ✅ | WP-08d (add `usedRaises:{}` to **both**) |
| Intent-scan / raise loop | L296 (`onlyFirstTime` hard-coded to `open_invite`) | L264 (same hard-coding) | ✅ | **WP-08d** |
| Interrogation penalty | L303-305 (`===` equality bug) | L273-275 (same bug) | ✅ | **WP-08e** |
| Coverage marking | L306 | L276 | ✅ | — |
| Gate / unlock logic | L319-328 | L286-298 | ✅ | WP-31 |
| `computeCoverage` core | L338-351 | L368-377 | ✅ | **WP-30** |
| **Technique derivation** | *(none — delegated to the LLM evaluator)* | **L394-397** | ❌ **client-only** | **WP-30** |
| **Debrief strengths** | *(none — `validateFeedback` L675+ only checks shape)* | **L408-409** | ❌ **client-only** | **WP-30**, WP-32 |
| Prompt assembly | `actorSystem` L353+ | *(none)* | ❌ server-only | — |
| Feedback validation | `validateFeedback` L675+ | *(none)* | ❌ server-only | **WP-32** |

**The consequence for WP-30:** "observed iff the gate is unlocked" must be applied in **four**
places — server `computeCoverage`, client `computeCoverage`, client technique derivation (L396,
keys off `s.covered['si_direct']`), and the client narrative strength (L408, *"…that is exactly
why she told you the truth"*, also keyed off `covered` not `unlocked`). **Parity will stay green
if the last two are missed**, because parity compares rapport/coverage/gates and never reads the
debrief narrative. That is structurally the same hole the `onlyFirstTime` bug lived in — both
sides wrong together, test green.

### A3. No warn→hard gate promotion while CI is down

WP-15, WP-16 and WP-17 ship **warn-only** with their burn-down counters printed on every run.
A hard gate nobody runs is theatre. Promotion to hard is **WP-15b**, whose trigger is billing
restoration (see "When CI returns" below).

### A4. Source-document integrity

The three source documents are committed here and the untracked root copies were removed, so
there is exactly one source of truth. WP-20's acceptance criteria require tracing every clinical
string back to a SPEC line; if SPEC changes, that mapping is invalid.

| Document | SHA-256 (at WP-00) |
|---|---|
| `plans/IMPLEMENTATION_HANDOFF_2026-08-20.md` | `5a30da819529e6a45bd89c0165026ee3918cf6afc59127a37aa43fa3a0d5d981` — amended at WP-00 (Ground Rule 6, per A2); as-received was `19e6dbfb2081bd19…` |
| `plans/CLINICAL_AND_INSTRUMENT_REVIEW_2026-08-20.md` | `8a3817c3507fed8585907fd76b47a44c5a466d393ab014f113623ee1ecb1f0ba` |
| `specs/SPEC_Withdrawal_Instrument_Redesign_v1.md` | `907f83a3c67339c5f22421798abc132b69404fa9b0749038c426e0248e8118b4` |

Re-verify before Wave 4: `shasum -a 256 docs/superpowers/specs/SPEC_Withdrawal_Instrument_Redesign_v1.md`

### When CI returns (WP-15b)

1. Re-run the full battery (`bin/verify.sh`) against **merged main**.
2. Open one PR promoting the warn-gates to hard.
3. Drop the "CI unavailable" line from the PR template.

## Status legend

`todo` · `in-progress` · `pr-open` · `blocked-review` (AGENT+REVIEW, awaiting clinical sign-off) ·
`blocked-author` (AUTHOR-GATED, awaiting content) · `merged`

## Work packages

| Wave | WP | Title | Owner | Status | Branch | PR | Blocker |
|---|---|---|---|---|---|---|---|
| 0 | WP-00 | Branch, tracking file, verification baseline | AGENT | pr-open | `chore/wp-00-remediation-baseline` | #371 | — |
| 0 | WP-00b | `bin/verify.sh` + pre-push hook + smoke runner | AGENT | in-progress | `chore/wp-00b-verify-harness` | — | — |
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
| 3 | WP-15 | CI gate: positional + length cues (**warn-only**, per A3) | AGENT | todo | — | — | WP-11 |
| 3 | WP-15b | Promote warn-gates to hard | AGENT | blocked-ci | — | — | **Actions billing restored** |
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

Playwright smoke is a separate suite and is **not** runnable from repo root. Use
`bash bin/verify-smoke.sh` (WP-00b), which starts the three servers from *this* worktree's
`_build/` and **refuses to reuse a port it did not open** — a stale `http.server` from another
worktree answers `200` with the right page titles and the wrong code.

Non-visual smoke baseline (WP-00b, 2026-08-20): **13 passed** — `nav-crawl` (ms3 + res),
`aria-live`, `lfs-integrity` (ms3 + res, against deploy preview #370). Visual specs are excluded
by design: baselines are Ubuntu-only and false-diff on macOS.

## The gate, while CI is down

`bash bin/verify.sh` is the whole §2 battery in one deterministic command, exits non-zero on any
failure, and is installed as a **pre-push hook** by `bash bin/install-hooks.sh` (hooks live in the
shared `--git-common-dir`, so one install covers every worktree; a fresh clone needs it again).

Its stdout goes in the PR body, followed by the literal line:

> `CI unavailable (Actions billing) — local gate only.`

Failure path is verified, not assumed: appending a byte to `AGENTS.md` makes it report
`FAILED (1): CLAUDE.md/AGENTS.md byte-parity` and exit `1`.

`bash bin/verify.sh --quick` skips the two site builds for a fast inner loop. It prints
`QUICK PASS — builds skipped, not a gate run` and **does not count as a gate run**.

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
