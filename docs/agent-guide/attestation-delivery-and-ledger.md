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

### The attestation ledger (ADR-003) — removed 2026-10-18 — [judgment]
- **The attestation ledger (ADR-003) was built dark and has been removed** (decision
  `attestation-ledger-removed`, Joshua Moss, MD, 2026-10-18; `docs/adr/ADR-003-attestation-ledger.md`
  keeps the design and the reasons). Hash-bound signatures in `reviewed.json` plus the console
  identity work of review item R4 answer the question it was built for. Phase 1 removed the
  build-side overlay and the `CLERKSHIP_LEDGER` hook in `build_and_check.sh`, the `ledger-publish`
  scheduled function, `bin/ledger.mjs`, `bin/ledger_keygen.mjs` and `13_Faculty_Resources/ledger/`.
  Phase 2 removed the console's `ATTEST_LEDGER` mode (`faculty-console/ledger.mjs`,
  `faculty-console/ledger-publish.mjs`, the ledger branches in `attest.mjs`, `release-status.mjs`
  and `rolling-pr-sweep.mjs`, and their tests); the console no longer reads `ATTEST_LEDGER` or
  any `LEDGER_*` variable. Two things from the design survive on purpose: `question_bank.json`'s
  manifest line is hashed WITHOUT item `status` (`canonical_question_bank` /
  `canonicalQuestionBank`, parity-pinned) so signing a question never drifts the question tools,
  and **an agent never mints a signing key or writes a signatures branch** of any kind.
