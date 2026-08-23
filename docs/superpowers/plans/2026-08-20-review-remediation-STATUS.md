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

### A5. Stale premises — verify the DEFECT before executing a WP

Amendment A1 covers drifted line numbers. Wave 1 surfaced the larger version: **some defects the
review describes no longer exist.** The review read a mount on
`fix/table-scroll-desktop-affordance-v2`; several were fixed on `main` in the interim.

**Confirm the defect reproduces before writing the fix.** Two of the first five packages would
have caused harm if executed as written.

| WP | Handoff says | Actually on `main` | Evidence |
|---|---|---|---|
| **WP-10** | Serves 5 hardcoded `SAMPLE` items; `BLUEPRINT` + `buildExam` are dead code; delete the "blueprint-weighted COMAT/shelf simulation" claim and disable the tool | **Fixed by PR #343.** `bankPool()` draws **142 attested items** from `question_bank.json`; `pool.length===0` is false so `SAMPLE` never fires; `buildExam` is called, `BLUEPRINT` drives allocation. The marketing copy is now **accurate**. | `bankPool`-eligible = 142 of 192; `SAMPLE` reachable only when the bank fails to load |
| **WP-09** | Options render in source order; key at index 0 in 220/437; pressing "1" scores ~50% | **Already implemented, more rigorously than specified.** `optOrder()` does a deterministic per-(card, local day) shuffle with an FNV-1a seed + xorshift32 — chosen *because* a bare LCG produced only 5 of 24 permutations. Verified in-repo across 200 ids: 24/24 permutations, first-position ≈ ¼. Stable across re-renders and same-day resumes. | `review.html`, `optOrder` and its comment |
| **WP-01** | `'na'` is truthy so the tool declares INTACT | **Laundering half already fixed** — `verdict()` has an `anyNA` branch. The export half was real and is fixed in #374. | verified by executing `verdict()` |
| **WP-07** | Count directive **and** literal-`**` FRST bug **and** `LOCAL_POLICY` token | Count directive real (fixed, #373). Asterisk bug **already fixed**. `LOCAL_POLICY` is **pack-only infrastructure** with no HTML equivalent → OPEN-DECISION-12. | `check-static-site.mjs` L378-382 |

**Executing WP-10 as written would have disabled a working, faculty-governed exam simulator** and
deleted page copy that is now true. It also means **OPEN-DECISION-5 is already resolved** — Shelf
Mode is wired to `question_bank.json`.

Corollary for Wave 2+: `quizzes.json` is at
`07_Evidence_and_Reading/Landmark_Trials/quizzes.json`, **not** the repo root the handoff implies.

### A6. Render assertions, not just data assertions

WP-02's eight tests passed while **every COWS subtitle was blank.** They asserted on the item
array; the renderer read `i.d`, which the regenerated array no longer had. Data tests prove the
array is right. They cannot prove the array is being *read*.

**Standing rule — any WP that changes an instrument data model must include a render-level
assertion that each item produces a non-empty label, subtitle/elicitation, and anchor list.**

This is load-bearing for **WP-20**, which rewrites both the CIWA and COWS item shapes wholesale:
a silent render regression there empties ten items at once, and every data test still passes.

### A7. Assume ~40% premise staleness — and file the check as an artifact

Two of five Wave-1 premises were already fixed on `main`. **Treat that as the base rate for every
remaining WP, Waves 2–6 included.**

A5 makes you check. A7 makes the check **auditable**: before any edit, add a premise-verification
note to the table below — the grep evidence that the defect reproduces, or the PR number that
fixed it. No note, no edit.

#### Premise verification log

| WP | Verified | Verdict | Evidence |
|---|---|---|---|
| WP-01 | 2026-08-20 | partly stale | `anyNA` branch present; export gap real → #374 |
| WP-02 | 2026-08-20 | **real** | all 11 items carried `max:N` + dense render loop → #375 |
| WP-07 | 2026-08-20 | partly stale | count directive real → #373; asterisk bug already fixed; `LOCAL_POLICY` has no HTML equivalent |
| WP-09 | 2026-08-20 | **stale — do not execute** | `optOrder()` already shuffles per (card, day), FNV-1a + xorshift32 |
| WP-10 | 2026-08-20 | **stale — do not execute** | `bankPool()` serves 142 attested items; PR #343 |
| WP-03 | 2026-08-20 | **real, all parts** | `"Often no medication"` ×1; CIWA labels still 3 bands (`≤8 / 9–19 / ≥20`); `RASS/PAWSS` ×1 |
| WP-04 | 2026-08-20 | **partly stale** | seizure band still sequential `24–48 h` (real). **ODC-2 resolved:** page self-labels "AI-drafted, faculty-reviewed" and `reviewed.json['decision-aids.html']` = reviewed, 2026-06-30, moderate |
| WP-05 | 2026-08-20 | **real, all four parts** | Withdrawal anchors still `< 3 days`/`≥ 3 days`; `[0,1,2,3].map` renders all four with no `disabled`; only conditional is `screenCount>=2`, no malignant interrupt; callout still `1–2 mg IV/IM, reassess in 1–2 h` with no ≥50% criterion |
| WP-06 | 2026-08-20 | **real, all parts** | one `lifetime` label (Q6 only), no Past-month frame on Q1–Q5; `S(k)` clears nothing, `showSub` gates rendering only; `tierLbl` still risk tiers; **zero** administration lines |
| WP-06f | 2026-08-20 | **real — live exposure** | Q1–Q5 reproduced **verbatim in both shipped builds** (`_build/{ms3,res}/tools/cssrs.html`). ODC-3 is not hypothetical |
| WP-08 | 2026-08-20 | **real** | all three punitive regexes in the pack; `onlyFirstTime` hard-coded to `open_invite` on **both** sides; `closedRun ===` on both sides; **zero** `988` in `sp-interview.html` |
| **WP-08c** | 2026-08-20 | **✅ TIER-0 CLEAR** | `POST_PACK_STATUSES = {reviewed, attested}` unchanged; guard intact; `packNotApproved()` → **403**; `pack.status = draft-pending-attestation` in source **and both shipped builds**. The 403 holds. |

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

### Deferred: the HTML `LOCAL_POLICY` mechanism (ODC-12)

**Do not build a general HTML token mechanism yet — one consumer is not a design brief.**

*Now (WP-07b, small):* split the violence one-pager's site-specific paragraph along the existing
`ms3`/`res` build axis, which already maps to UNE/MMC. Shared MS3 text states the **principle**
only — many units screen violence risk at intake with a structured tool; know which one yours
uses and when it is completed. The FRST / MMC / ED-intake specifics ship to `res` only.

This is a **content improvement, not just de-risking**: "know whether your unit uses X" is the
same scope-calibration posture the review praised in the MS3 consult expansion module.

*Later (WP-20):* the CIWA administration panel needs exactly this — hold parameters, who scores,
frequency by band, all site-specific. Build the mechanism there **with FRST as the second
consumer**, so two real cases inform the shape. Recorded here so the dependency is not
rediscovered.

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
| 0 | WP-00 | Branch, tracking file, verification baseline | AGENT | **merged** | — | #371 | — |
| 0 | WP-00b | `bin/verify.sh` + pre-push hook + smoke runner | AGENT | **merged** | — | #372 | — |
| 0 | **WP-00c** | Make `bin/verify.sh` the gate contract; collapse `ci.yml` | AGENT | **next** | — | — | — |
| 1 | WP-01 | Capacity: `'na'` bug + disable Copy note | AGENT | **merged** | — | #374 | superseded by WP-01b |
| 1 | **WP-01b** | Delete `verdict()`; capacity module becomes a structured report | AGENT + AUTHOR-GATED | **next** | — | — | author copy (~200 w) for header + 2 prompts |
| 1 | WP-02 | COWS legal-value arrays | AGENT | **merged** | — | #375 | — |
| 1 | **WP-02b** | Instrument attribution on `withdrawal.html` (CIWA-Ar + COWS) | AGENT | **done** | `decision/instrument-scope-option-a` | — | — |
| 1 | **WP-02c** | Verify the PHQ-9/GAD-7 permission footer against the current published form | AUTHOR-GATED | todo | — | — | needs the current form, not a remembered footer |
| 1 | **WP-02d** | Establish CIWA-Ar / COWS / BFCRS copyright status | AUTHOR-GATED | todo | — | — | author/counsel task; **blocks WP-20/21/22** |
| 1 | **WP-06R-a** | Retire the C-SSRS verbatim reproduction from `cssrs.html` | AGENT + AUTHOR-GATED | **next** | — | — | removal is mechanical; the replacement administration-teaching copy is authored |
| 1 | **WP-06R-b** | Safety-plan rehearsal tool that reproduces no Stanley–Brown content | AUTHOR-GATED | todo | — | — | content |
| 1 | WP-03 | CIWA bands + delete unconditional directive | AGENT+REVIEW | todo | — | — | — |
| 1 | WP-04 | Withdrawal seizure window overlap | AGENT+REVIEW | todo | — | — | — |
| 1 | WP-05 | BFCRS anchors, invalid scores, malignant interrupt | AGENT+REVIEW | todo | — | — | — |
| 1 | WP-06 | C-SSRS timeframes, stale answers, admin panel | AGENT+REVIEW | todo | — | — | OPEN-DECISION-3 blocks 6e |
| 1 | WP-07 | Violence page: delete count directive | AGENT | **merged** | — | #373 | LOCAL_POLICY half deferred → OPEN-DECISION-12 |
| 1 | WP-08 | SP: punitive regexes, crisis path, keep 403 | AGENT+REVIEW | todo | — | — | needs 2nd reviewer |
| 2 | WP-09 | Daily Review: shuffle options | AGENT | **already done on main** | — | — | premise stale — see "Stale premises" |
| 2 | WP-10 | Shelf Mode: disable + remove false copy | AGENT | **premise stale — do not execute** | — | — | see "Stale premises" |
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
| OPEN-DECISION-1 | Delete `verdict()` and convert the capacity module to a structured report? | WP-01 | **RESOLVED — yes, delete it. → WP-01b** |
| OPEN-DECISION-2 | Attest `decision-aids.html` or suppress the outbound link? | WP-04 | **RESOLVED — page is attested** (`reviewed.json`, 2026-06-30, moderate); self-label now reads "AI-drafted, faculty-reviewed" |
| OPEN-DECISION-3 | C-SSRS licensing for verbatim reproduction on two public sites | WP-06 | **RESOLVED 2026-08-23 — Option A: the rule covers copyrighted instruments only. C-SSRS retires → WP-06R-a.** See `2026-08-20-instrument-reproduction-audit.md` |
| OPEN-DECISION-4 | Build the BVC, or correct the markdown pointing at a nonexistent Brøset tool? | WP-07 | open |
| OPEN-DECISION-5 | Wire Shelf Mode to `question_bank.json` | WP-10 | **CLOSED by PR #343** — already wired; see A5 |
| OPEN-DECISION-6 | Case-level attestation, or inherit page-level? (Not both.) | WP-13 | open |
| OPEN-DECISION-7 | Do unattested drafts ship? (46 of 189 served items) | WP-17 | open |
| OPEN-DECISION-8 | Move the communication bank to two-tier? | review §8.4 | open |
| OPEN-DECISION-9 | Is the SP going live this academic year? Determines whether WP-08b is Tier 0 | review §5.2 | open |
| OPEN-DECISION-10 | Source documents committed to the repo by WP-00 | WP-00 | **resolved — confirmed, root copies removed** |
| OPEN-DECISION-11 | Capacity `anyImp`/`anyNA` ordering | WP-01 | **MOOT** — `verdict()` is being deleted (ODC-1). The clinical truth it surfaced is preserved as an author-written sentence in WP-01b, so the teaching is not lost with the function. |
| OPEN-DECISION-12 | `LOCAL_POLICY` has no HTML-tool equivalent | WP-07 | **RESOLVED — split now via the ms3/res build axis; build the mechanism in WP-20.** See "Deferred: HTML LOCAL_POLICY" below |
| OPEN-DECISION-5 | Wire Shelf Mode to `question_bank.json` | WP-10 | **resolved — already wired (PR #343); see A5** |

## Burn-down counters

Populated as the gates land; each must be printed on every CI run so it cannot be quietly forgotten.

| Counter | WP | Baseline | Current |
|---|---|---|---|
| `validate_item_cues` allowlist size | WP-15 | not yet measured | — |
| COWS options outside published legal values | WP-02 | 12 (dense ranges on 11 items) | **0** — pinned by `tests/cows-legal-values.test.mjs` |
| Count-derived directives on non-instruments | WP-07 | 1 (violence one-pager) | **0** — pinned by `tests/violence-no-tally.test.mjs` |
| Exportable incomplete capacity notes | WP-01 | unbounded | **0** — pinned by `tests/capacity-verdict.test.mjs` |
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
