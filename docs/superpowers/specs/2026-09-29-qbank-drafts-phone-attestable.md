# Draft questions must reach main attestable from the phone

Decision `qbank-drafts-phone-attestable` · 2026-09-29 · owner: Joshua Moss, MD

## Problem

The faculty console's phone view (`faculty-console/m/`) never offers **Attest** for a question
that `faculty-console/qbank-rules.mjs` flags: `m-model.mjs` evaluates eligibility with an empty
`warningAcks` set, so any warning makes a question desktop-only, and a blocker makes it
unattestable anywhere. Nothing checked this at merge time. On 2026-09-28 every live draft
(qb_pha_002, qb_pha_007, qb_pha_009, qb_saf_006, qb_sud_013) had reached main with one warning
each; the owner discovered it by being unable to attest them on the phone. #891 fixed the five.

## Options considered

| Option | Verdict |
|---|---|
| A scheduled console function that opens a fix PR for any flagged draft | **Rejected.** Two of the four warnings seen (answer-length cue, weak lead-in) need clinical judgment; the console has no model, so this would add an AI key and unattended clinical authoring to the attestation server; and it repairs after merge instead of preventing the merge. |
| Merge-time gate running the console's own rules, with a mechanical `--fix` | **Chosen.** The author (usually a Claude session) fixes the draft inside the PR that adds it; the owner reviews once. No new moving parts in the console. |

## Design

`bin/check-qbank-drafts.mjs` (policy — `bin/check-*.mjs`):

- Loads `question_bank.json` and `site_manifest.json` exactly as `attest.mjs buildQbankPayload`
  does and runs `assessBank` from `faculty-console/qbank-rules.mjs` — **imported, never copied**, so
  the gate and the phone cannot disagree, and a PR that changes the rules is checked against every
  draft by the rules it ships.
- Scope = what the console queues: live (`retired !== true`) items with `status !== 'attested'`
  (`review-model.mjs completion()`). Attested items are out of scope; their warnings were
  acknowledged at signing, and WP-7's length-cue ratchet owns that debt.
- Fails (exit 1) on any in-scope item whose gate is `warning` or `blocked`; exit 2 if a
  repository file cannot be read; exit 0 otherwise.
- `--fix` repairs only the two warnings that have one mechanical answer, on drafts only, never
  `status`: a final `The <x> is/are:` → `What is/are the <x>?` (and a `Which/What …:` gets its
  `?`); evidence that names a selected page by source path/file name → that page's slug, when
  exactly one selected page matches. Everything else is reported for a person.
- `--self-test` plants flagged, blocked, retired, attested and exception cases and asserts the
  verdicts; two mutants (warnings treated as ready; no drafts seen) were confirmed to fail it.
- `bin/qbank_desktop_only.json` (content) may list deliberately desktop-only drafts
  (`{id, codes, reason}`), but `MAX_DESKTOP_ONLY` in the script (policy) is **0**: opening that door
  is an owner decision in its own policy commit. Stale entries fail.

Wiring: CI `build-test-validate` step "Validate — question-bank drafts are attestable from the
phone" (both commands pinned in `validate_scheduled_workflows.py` CRITICAL_STEPS; ci.yml digest
updated) and two `bin/verify.sh` steps (self-test, gate). CLI behaviour is pinned by
`tests/qbank-drafts-gate.test.mjs`.

## Evidence it works

Replayed against the bank as it stood before #891 (911b176): the gate reports all five drafts
(exit 1); `--fix` repairs exactly qb_pha_007 (lead-in) and qb_sud_013 (evidence slug) — the same
two edits #891 made by hand — changes 2 lines of the file, and leaves the three judgment calls
(qb_pha_002 weak lead-in, qb_pha_009 and qb_saf_006 answer length) reported.

## Revisit if

The phone client gains warning acknowledgement, or the rules gain a warning that faculty
routinely accept.
