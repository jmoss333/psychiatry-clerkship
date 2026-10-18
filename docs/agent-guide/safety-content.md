# Safety content: crisis block, PHI, instruments

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The three rules with the same standing as the dose-literal rule: crisis contacts are single-sourced and build-injected, nothing here is PHI, and the library teaches instruments without reproducing them.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### Crisis contacts live in `crisis_resources.json` only — [gate: 13_Faculty_Resources/_automation/site_build/crisis_block.py; .claude/hooks/pre_edit_guard.py]
- **Crisis contacts (988 etc.) live in `crisis_resources.json` only.** Never hard-code a crisis
  number in a content page or tool. A page opts in with a `<!-- crisis-block -->` marker
  (`<!-- crisis-block-html -->` in tools); `site_build/crisis_block.py` renders it and
  `build_deploy.py` injects at build time, so `res` inherits it via `resident_section.py`.
  Dropping the marker from a required safety surface **hard-fails the build**. Scope rule for
  adding a surface: the learner must plausibly be *doing* risk work there (assessing, rehearsing,
  or planning disposition) — not merely reading a page that mentions suicide. Data is derived
  from the ReConnect crisis dataset and independently re-verified — refresh with
  `_automation/sync_from_reconnect.py --dataset crisis --reconnect <path>` (dev-only, report-only;
  never runs on Netlify; `sync_crisis_from_reconnect.py` is the same report under its old name).
  The same engine diffs `--dataset meds` (`pharmacy.json`) and `--dataset evidence`; exit 1 means
  drift. A registry reshaped from ReConnect declares `relation: derived` in the provenance
  inventory (pinned `sourceRevision` + required `fieldMap`); the engine then also reports field
  changes since that revision.
  **Opting a surface in has two non-obvious consequences, each of which has cost a cycle.**
  (1) **The Reader stops collapsing that page.** `makeCollapsible()` in `spa_index.html` returns
  early on any body containing `.crisis-block-hook`, so the contacts can never be stranded inside
  a `display:none` section body — in the DOM, absent from what a learner reads, unreachable by
  in-page find or print. A markdown page therefore gains contacts and loses its `.sec-c` wrappers
  in the same commit. `bin/verify.sh` cannot see it (the smoke suite is a separate CI job), and it
  turned #562 red — `front-door.spec.js` pinned `pg_interview.md`'s collapsible table section.
  Tools never reach `makeCollapsible`, so `<!-- crisis-block-html -->` is exempt.
  (2) **It does NOT reopen attestation.** The block is build-injected from `crisis_resources.json`,
  centrally governed and byte-identical across every surface, so it is not authored content on the
  page it lands on. `cd1ae13` opted six surfaces in at once, author-approved, without touching
  `reviewed.json`, and nearly every crisis surface still carries a `reviewed` row dated before its
  block (27 of 32 on 2026-09-08). Move a ledger row to pending when you change **authored** clinical
  content instead — which is what WP-5m did to `sp-interview.html` (new intent, new gated reveal,
  rewritten feedback cards), and that contrast is the line. A review bot reads the badge and files
  this as a P1 (#571): it is convention, not an oversight. Changing it is a policy call over the
  whole set, and the author's to make.

### No PHI — [gate: .claude/hooks/pre_edit_guard.py]
- **No PHI.** Clinical content is synthetic / de-identified only; never commit patient identifiers to
  git-tracked files, memory, or scratch outputs.

### The library teaches administration; it does not reproduce instruments — [gate: 13_Faculty_Resources/_automation/site_build/instrument-rights-gate.mjs; .claude/hooks/pre_edit_guard.py]
- **THE LIBRARY TEACHES ADMINISTRATION; IT DOES NOT REPRODUCE INSTRUMENTS.** Same standing as the
  dose-literal rule. Teach *how to give* an instrument — the elicitation, the confounds, what the
  score does and does not license, what a negative result fails to rule out — and link to the
  official form. Do **not** ship the instrument itself: no verbatim item stems, no verbatim anchor
  ladders, no reproduced field labels, and no tool that functions as a fillable copy of a
  copyrighted form. "Programming the form" counts as reproduction even when no text is copied —
  the Stanley-Brown Safety Plan's terms name it explicitly, which is why the safety-planning work
  (WP-06R-b) is a *rehearsal* tool and reproduces nothing.
  Scope is a governance decision, not an agent decision: if a WP asks you to add verbatim item or
  anchor text, **stop and ask** rather than inferring that a particular instrument is exempt.
  **Resolved 2026-08-23 — Option A: the rule covers copyrighted instruments only** (#391). C-SSRS
  retires (WP-06R-a); Stanley-Brown is never programmed (WP-06R-b); PHQ-9/GAD-7 provisionally stay
  pending a check of the current permission footer (WP-02c); **BFCRS is RESTRICTED** (URMC written
  consent required) and **CIWA-Ar RETIRES** (2026-08-28, author's call — rights unestablishable, so
  the descriptors came down; WP-20 is closed with it). **COWS anchors retired 2026-09-10**
  (decision `cows-anchors-retired`, superseding the 2026-08-23 interim waiver, which is closed):
  the permission that exists covers clinical copying, not publication on a teaching site, so the
  45 verbatim anchor strings in `withdrawal.html` were replaced with in-house descriptors; the
  item names and legal score values are facts and stay, and the page still scores. A Taylor &
  Francis permission request runs in parallel — a license would move COWS to cleared, and that is
  the author's call, not an agent's. An instrument is exempt only once its status is recorded
  in the audit's decision table — Option A settles scope, not individual cases.
  **A withdrawal must leave a route (INV-IR2, 2026-09-03).** Retiring an instrument may not leave
  a dead end: every removed or link-only instrument ships the custodian's official `formUrl` from
  `instrument_rights.json`, and `site_build/instrument-rights-gate.mjs` fails the build when a
  pinned page drops it or points at a copy hosted here. `bin/check_instrument_links.py` re-checks
  the far end by hand; it is not a gate.
  Audit and current disposition: `docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md`.
