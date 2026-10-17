# Attestation delivery and the ledger

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). How signatures the owner makes reach the learner sites on their own (the rolling `attest/pending` sweep and the daily delivery check), and the built-but-dark Ed25519 ledger (ADR-003).

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### Signatures deliver themselves — [report: bin/check_attestation_delivery.py; faculty-console/rolling-pr-sweep.mjs]
- `faculty-console/rolling-pr-sweep.mjs` + `bin/check_attestation_delivery.py` — **signatures
  deliver themselves**. The sweep (a Netlify scheduled function on the console site, every 15 min)
  opens or reopens the rolling `attest/pending` PR when that branch is ahead of `main` and arms
  auto-merge with a **merge commit** (L4 reads the console identity per commit; never squash). The
  daily check (step 2 of `maintenance-release-watch.yml`) compares, page by page, what is signed
  against what each learner site serves and names where anything is stuck — stranded (no PR, red
  after 30 min), in the PR (6 h), merged but unpublished (24 h), published but not shown (at once);
  a page whose text changed after signing is re-attestation work, not a delivery gap. Neither
  creates a signature; they only move ones the owner made. Born of 2026-09-28, when the Interview
  Room re-attestation sat on `attest/pending` with no PR on a rotation's first morning.

### The attestation ledger (ADR-003) — built and DARK — [gate: 13_Faculty_Resources/_automation/site_build/ledger_overlay.mjs]
- **The attestation ledger (ADR-003) — sign-offs that never merge.** Built and DARK: nothing
  changes until `13_Faculty_Resources/ledger/ACTIVATION.md` is followed. Once on, a faculty
  sign-off is one Ed25519-signed, hash-chained line appended to `ledger/events.jsonl` on the
  orphan branch `attestations` (never merged; pushes to it trigger no CI and no Netlify build),
  written only by the console in ledger mode (`ATTEST_LEDGER=on`), which hashes the page AS IT
  STANDS ON `main`. Each learner-site build runs `site_build/ledger_overlay.mjs` FIRST
  (`CLERKSHIP_LEDGER=on`): it verifies every signature and link against
  `13_Faculty_Resources/ledger/keys.json` and projects the latest event per item onto the
  working copies of `reviewed.json` / `topic_meta.json` / `question_bank.json`, so every
  validator, projection and test below it judges the combined record unchanged. A tampered
  ledger fails the build (last good deploy stays live); an unreachable one builds the baseline
  and says so; `CLERKSHIP_LEDGER=off` is the emergency override. The console's scheduled
  `ledger-publish` function rebuilds a site ~10 min after sign-offs go quiet, reading the
  `ledger-receipt.json` each site serves. Rules that follow: **`reviewed.json` stays the
  registration record** — content PRs still register and demote there, and a baseline row dated
  LATER than a ledger event wins over it; **an agent never runs `bin/ledger_keygen.mjs`** (whoever
  runs it briefly holds the signing key — it is Josh's step) and never writes the ledger branch;
  **git-side report tools read the baseline only** — `node bin/ledger.mjs materialize --out DIR`
  gives them the combined view; `node bin/ledger.mjs verify|status|audit` inspect the ledger.
  Core: `faculty-console/ledger.mjs`; tests: `tests/ledger-*.test.mjs`,
  `tests/faculty-console-ledger.test.mjs` (every guard in them was broken once to watch its test
  go red). Also note `question_bank.json`'s manifest line is hashed WITHOUT item `status`
  (`canonical_question_bank` / `canonicalQuestionBank`, parity-pinned) — signing a question must
  not drift the question tools.
