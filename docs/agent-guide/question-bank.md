# Question bank

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The two standing rules for `question_bank.json`: every live draft must be attestable from the phone, and a revised question stages for faculty rather than learners.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### Every live draft question must be attestable from the phone — [gate: bin/check-qbank-drafts.mjs]
- **Every live draft question must reach main attestable from the phone** (decision
  `qbank-drafts-phone-attestable`, 2026-09-29). `node bin/check-qbank-drafts.mjs` (CI, verify.sh)
  runs the console's own `faculty-console/qbank-rules.mjs` over every live, un-attested item and
  fails unless each is `gate: ready` — the phone never offers Attest for a flagged question. When
  you add or rewrite a question, run `node bin/check-qbank-drafts.mjs --fix` first (it repairs only
  a statement-form final lead-in and evidence that cites a file name instead of the page slug, on
  drafts only, never `status`), then rewrite whatever it still reports yourself. Never clear the
  gate by listing a draft in `bin/qbank_desktop_only.json`: its cap is 0 and raising it is the
  owner's call, in its own policy commit.

### Revised questions stage for faculty, not learners — [gate: 13_Faculty_Resources/_automation/site_build/qbank_public.py; bin/check_qbank_draft_exposure.py]
- **Revised questions stage for faculty, not learners** (2026-10-11). Canonical
  `question_bank.json` may contain valid drafts for the existing saved-draft faculty console.
  The learner builder uses `site_build/qbank_public.py` to publish only active, explicitly
  attested questions; root JSON, placement questions, shell/review inventories and Anki/CSV
  downloads use that projection. A revision awaiting approval is temporarily withheld, with
  no previous-version fallback. `check_qbank_draft_exposure.py` names source drafts as staged;
  its QB cap remains zero and no draft allowlist is added. Actual-output checks in static QA
  and download parity enforce the boundary on both sites. Malformed source or missing public
  input fails closed. Baseline question approval must use the exact preview IDs, item
  revisions and manifest revision, never a newly computed queue. This staging permission is
  not faculty approval and does not enable either AI pilot. See
  `docs/superpowers/specs/2026-10-11-qbank-review-only-staging.md`.
