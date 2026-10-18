# ADR-003 — The attestation ledger: sign-offs that never merge

**Status:** Accepted 2026-09-25; built; **DARK** (not activated). Decision §6-a of the
2026-10-17 architecture review asks the owner to activate it by a date or remove it — two
integrity mechanisms with one switched off is design debt, not defence in depth.
**Design:** `docs/superpowers/specs/2026-09-25-attestation-ledger-design.md`.
**Activation:** `13_Faculty_Resources/ledger/ACTIVATION.md`.

## Context

A faculty signature is recorded as a row in `13_Faculty_Resources/reviewed.json`, bound to the
page's text by `contentHash` (ADR-002's derived page set, hashed; see
`docs/agent-guide/attestation-hashes.md`). The row is written by the faculty console, on the
branch `attest/pending`, under the identity `faculty@clerkship.local`, and reaches `main` through
the rolling pull request. Three properties follow that the owner wanted to remove:

1. a signature is a **commit on a branch that must merge** — it competes with content PRs,
   drifts when they land first, and its author identity is a commit email anyone can set;
2. a signature can be **rewritten in history** by anyone who can push the branch;
3. the sites learn of a signature only through a merge and a **billed** production deploy.

## Decision

Once activated, a faculty sign-off is **one Ed25519-signed, hash-chained line** appended to
`ledger/events.jsonl` on the orphan branch `attestations` — never merged, never built, no CI and
no Netlify run on push. Only the console in ledger mode (`ATTEST_LEDGER=on`) writes it, hashing
the page **as it stands on `main`**. Each learner-site build runs
`site_build/ledger_overlay.mjs` first (`CLERKSHIP_LEDGER=on`): it verifies every signature and
chain link against `13_Faculty_Resources/ledger/keys.json` and projects the latest event per item
onto the working copies of `reviewed.json`, `topic_meta.json` and `question_bank.json`, so every
validator, projection and test downstream judges the combined record unchanged.

- A **tampered** ledger fails the build; the last good deploy stays live.
- An **unreachable** ledger builds the baseline and says so.
- `CLERKSHIP_LEDGER=off` is the emergency override.
- The console's scheduled `ledger-publish` function rebuilds a site ~10 minutes after sign-offs
  go quiet, reading the `ledger-receipt.json` each site serves.
- `question_bank.json`'s manifest line is hashed **without** item `status`
  (`canonical_question_bank` / `canonicalQuestionBank`, parity-pinned), so signing a question
  does not drift the question tools.

## Consequences

- `reviewed.json` **stays the registration record**: content PRs still register and demote
  there, and a baseline row dated later than a ledger event wins over it.
- **An agent never runs `bin/ledger_keygen.mjs`** (whoever runs it briefly holds the signing key
  — the owner's step) and never writes the ledger branch.
- Git-side report tools read the baseline only; `node bin/ledger.mjs materialize --out DIR`
  gives them the combined view; `node bin/ledger.mjs verify|status|audit` inspect the ledger.
- Core: `faculty-console/ledger.mjs`. Tests: `tests/ledger-*.test.mjs`,
  `tests/faculty-console-ledger.test.mjs` — every guard in them was broken once to watch its
  test go red.
- While dark, the forgeable-identity problem (property 1) is closed more cheaply by a GitHub App
  or machine user for the console plus a ruleset restricting pushes to `attest/pending`
  (review recommendation R4). If that lands and the owner chooses **remove**, this ADR is
  superseded and the overlay, `bin/ledger.mjs`, the ledger tests and `ledger/` go in one
  governance PR.
