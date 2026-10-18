# Governance / content separation

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The two separation gates: policy may not travel with content in one commit, and a content PR may register or demote an attestation but never promote one (L1–L4). Read before touching `reviewed.json`, `topic_meta.json` `facultyReview`, `question_bank.json` `status` or `pharmacy.json` `facultyReview`.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### Policy and content may not travel in the same commit — [gate: bin/check_policy_content_separation.py]
- **Policy and content may not travel in the same commit.** A commit may touch the governing
  surface (`CLAUDE.md`, `AGENTS.md`, `.github/workflows/**`, `bin/verify.sh`, the `bin/check_*`
  / `bin/audit_*` / `bin/refresh_*` scripts, `validate_scheduled_workflows.py`, `docs/adr/*`,
  attestation config) **or** content (curriculum, tools, snapshots, registries, and the DATA
  gates read — baselines, caches, allowlists) — never both. `docs/superpowers/specs/*` is a
  **third, neutral class**: a design spec describes policy without enacting it, so it pairs
  with neither and rides with either. (Not "exempt": the first draft made specs exempt, which
  silently classified them as content, so a rule shipped with its own spec tripped its own
  gate. `bin/check_policy_content_separation.py` keeps that regression in `--self-test`.)
  *A PR that can edit `CLAUDE.md` can edit the rules governing PRs* — that is exactly what
  #640 did (a governance rule inside a curriculum PR) and what #672 then invoked to bypass
  review, shipping 85 citations of which 43 of 47 checkable ones were wrong. Splitting them
  makes the rule change its own reviewable object and keeps `git log -- CLAUDE.md` an honest
  record. Gate DATA is content on purpose: shrinking a debt (fixing a citation *and* deleting
  its allowlist entry) stays one ordinary commit, while raising the cap that bounds the debt
  is a policy edit under its own review.

### A content PR may register and demote an attestation; only the console may promote one (L1–L4) — [gate: bin/check_governance_separation.py]
- **A content PR may register and demote an attestation; only the console may promote one.**
  `bin/check_governance_separation.py` reads a PR's whole range — base rev, head rev, head branch
  — and sorts every changed path into two sets. **Governance is the machinery of attestation,
  not only the ledger and the rule files** — the first draft named those alone and a content PR
  could still rewrite its own judge, `bin/`, in the same diff as the pages being judged. It is:
  `13_Faculty_Resources/reviewed.json`, `CLAUDE.md`, `AGENTS.md`, `decisions.json`,
  `standards.json`, `instrument_rights.json`, `vocabulary.json`, `.gitattributes`,
  `reviewed.schema.json`, and `_automation/`'s `attestation_hash.py`, `surface_governance.py`,
  `validate_attestation_consistency.py`, `validate_curriculum.py`, `validate_topic_meta.py`,
  `site_build/ledger_overlay.mjs` (the attestation ledger's build-side reader), and everything
  under `13_Faculty_Resources/ledger/` (its public keys);
  everything under `.claude/` (skills, hooks, subagents, settings), `.github/` **in full** — not
  only `workflows/`: an action, a template or CODEOWNERS decides how work is reviewed too —
  `bin/` (every gate and audit tool, this one and `verify.sh` included), `faculty-console/`
  (what writes an attestation), `_automation/maintenance/` and `tests/maintenance/` (what pin
  the workflows and this guard); and **any path ending `.schema.json`**, wherever it lives, a
  schema being the shape a registry must hold. Two directories are deliberately **not**
  governance, because a legitimate content PR has to touch them in the same diff as the page it
  ships: `_automation/site_build/` is **registration data** — `site_manifest.json`,
  `cotw_registry.json`, the regenerated `shipped_pages.json`, `build_deploy.py`'s nav — without
  which a new page hard-fails the orphaned-source check, i.e. making it governance would forbid
  shipping a page at all; and `tests/` outside `tests/maintenance/` carries panel snapshots and
  per-surface rows a new surface legitimately brings with it. (A `*.schema.json` under
  `site_build/` is still governance: the data may ride along, the contract it must satisfy may
  not.) Neither exclusion is a hole in L2/L3/L4 — nothing under either can promote anything.
  **Content** is any path `site_build/shipped_pages.json` lists as a `source` or `extraSources`
  at **BASE or HEAD** — head-only, and de-registering a page in the same commit that rewrites it
  makes it stop being content exactly when it is being changed; 10 of the 130 shipped sources
  (the six `_prototypes/` tools, `sp-interview.html` among them, and four under
  `13_Faculty_Resources/`) are content *only* because the listing says so — plus anything
  matching `^(0\d|1[0-4]|99)_[^/]+/` that is not under `13_Faculty_Resources/` — a directory
  segment is required, so a top-level `03_notes.md` is not content — the derived listing because
  a page can ship from a path the regex misses (`welcome.md`'s resident override), the regex
  because a path can be content before any site lists it. **One exception:**
  `question_bank.json` has been content since #783 listed it in the question tools'
  `extraSources`, but a diff that changes nothing except items' `status` is not a content
  change — a question's attestation *is* its status, and counting the flip as content made
  every console question sign-off fail L3 against itself (rolling PR #781). Any other edit to
  the bank, `retired` included, is still content. A **promotion** is a claim that a
  review happened: in `reviewed.json`, a row whose `status` becomes `reviewed`, a row born
  `reviewed`, or a row reviewed on BOTH sides whose `at`, `by`, `risk`, `note`, `contentHash`,
  `clinicalHash`, `claimsHash`, `evidenceHash` or `evidenceThrough` changes — **a missing key is a value**,
  because #640 promoted a row by *adding* a note to it; in `topic_meta.json`, a `facultyReview`
  block that becomes `reviewed`/`attested`, or one reviewed on both sides whose `lastReviewed` or
  `reviewer` changes; in **`question_bank.json`** (items identified by their `id`; 144 of 192
  carry `status: "attested"`, and `bin/run_queue_task.py` names it beside the other two as a
  registry the nightly runner may never edit), an item whose `status` becomes `attested`, an item
  born `attested`, or an item attested on **both** sides **any** of whose fields changes — an
  attested item has no separately-attested field, the stem, options, rationale and evidence are
  all the text faculty signed, so the honest edit demotes to `draft` first (registration) and
  re-attests afterwards. In **`pharmacy.json`** (records by `id`), a `facultyReview` block that
  becomes `reviewed`, a record born reviewed, or a reviewed-on-both-sides block whose
  `lastReviewed`, `reviewer`, `reviewedFieldsHash`, `retrievalHash` or `labelEvidence` changes (decision D2 at pharmacy gate G1).
  **A pack case's `facultyReview` block is not a promotion** (decision
  `pack-case-review-is-registration`, 2026-09-26): `sp-interview.pack.json` is an `extraSources`
  entry of the `sp-interview.html` ledger row, so any case edit drifts that row to pending and
  the console's re-attestation is the claim of record; the attestation validator forbids a case
  in a reviewed pack whose status is anything but `reviewed`, `attested` or exactly `pending`;
  a pending case carries no reviewer or review date and the pack keeps at least one `reviewed`
  case (decision `pack-case-review-is-registration` as amended 2026-09-27 by #844, design
  `docs/superpowers/specs/2026-09-27-red-team-governance-simplification-design.md` §2.1; the
  tool, the proxy and the red-team runner offer only `reviewed`, so a `pending` case is
  unselectable everywhere and its probes skip),
  so a new case lands in ONE content PR — `reviewed` with the owner's read of the lines recorded
  on it, or `pending` first if it goes into the pack ahead of that read (either way the PR also
  carries the per-case rows the `_prototypes/sp-interview/tests/` and `sp-proxy/tests/` suites pin
  against the canonical pack — the id list, the case counts, the parity scenario, and the
  encounter brief the root `conversation-encounter-profiles` test requires for every case, which
  runs before both builds; none of those paths is content or governance). It needs no
  hand-written red-team probe: `bin/redteam-offline.mjs`'s S1–S3 check every reviewed case's
  gates automatically, and a `FAIL  S…` is a pack wiring mistake fixed in the same PR (decision
  `sp-redteam-signoff-retired`, 2026-09-27; from 2026-09-26 to 2026-09-27 a governance PR of
  probes had to land between a `pending` PR and a promoting PR). Two things a `pending` case
  does NOT do: hide — the built sites ship the whole pack
  verbatim at `tools/sp-interview.pack.json` and precache it, so its text is public from the
  first PR and the leak and no-PHI bar applies there, only selection is withheld; and stand in
  for its review — a console re-attestation of the drifted `sp-interview.html` row while the
  case is pending binds the row's bytes and is the claim of record for the cases the tool
  offers, not that case's review, which is the flip. `bin/what_needs_josh.py` lists every pack case whose
  status is not the literal `reviewed` (`pending`, `attested` or otherwise) as owner work until the
  flip lands. The classifier never reads the block. Everything else a content PR does to the ledger — a new pending row, a
  pending row edited, `reviewed`→`pending`, a row deleted, a demotion that drops
  `lastReviewed`/`reviewer` — is **registration**, and is exactly what a content PR is supposed
  to do. The rule forbids the claim, not the bookkeeping. Four laws: **L1** a governance path
  other than `reviewed.json` in the same diff as content; **L2** a promotion on any branch but
  `attest/pending`; **L3** a promotion in a diff that also changes content; **L4** any non-merge
  commit introducing a `reviewed.json` promotion whose author **or** committer email is not
  `faculty@clerkship.local` — **L4 is `reviewed.json`-only** (D3/D8 as written: the console does
  not write `topic_meta.json` or `question_bank.json`, so no console-identity rule could be
  defined for them). Exit 0 clean, 1 a failure, **2 could-not-check** — no base, no git, an
  unparsable registry, a registry that parses to the **wrong shape** (a `reviewed.json` or
  `topic_meta.json` that is not an object, a `reviewed.json` whose rows lack `status`, a
  `question_bank.json` with no `items` list, a `shipped_pages.json` whose `pages` is not a list:
  `{"entries": {…}}` and a bare JSON list both used to read as "every row deleted", i.e.
  registration, over a diff that promoted every row), a HEAD with no `shipped_pages.json`, a
  `reviewed.json` absent at head, or a base you NAMED that resolves to the head (`--base HEAD`,
  or `CLERKSHIP_PR_BASE` pointing at your own tip after a push: an empty range shows no
  promotion). The **default** base equalling the head is the opposite finding and exits 0
  saying so — it means the branch owns no
  commits, which is why a clean `main` still passes. Since the tool is a `bin/verify.sh` step and
  verify.sh is the pre-push hook, **2 blocks a push exactly as 1 does**: a classifier that cannot
  tell content from not-content would clear every diff it was handed. Why: run it over #672
  (`8b8ccd9`) and it fails L2+L3+L4 — three pending pages flipped to `reviewed` under the owner's
  name and three attestations re-dated, in the same diff as six content files, authored by
  `jmoss333` and committed by `GitHub`. Run it over #640 (`0009ad6`): L1+L2+L3+L4 — a rule written
  into `CLAUDE.md`/`AGENTS.md` from inside a 926-line content PR, plus a `note added` to an
  already-reviewed row. Nothing stopped either; the rule catches both retroactively. **When it
  fires:** split the governance edit into its own PR, and take the attestation through the
  faculty console rather than the ledger — a `topic_meta` `facultyReview` parity edit rides
  `attest/pending` with the promotion it mirrors, never a content branch. `attest/pending` is the
  only branch that may carry a promotion and `faculty@clerkship.local` — author AND committer,
  because #672 was authored by one identity and committed by another — the only identity that may
  author one. L4 asks git, not the ledger's `by` field, which any writer can type; it is still
  forgeable with `git commit --author`, but that is deliberate fraud with a name on it, not the
  drift this gate exists to stop. **Sync `attest/pending` with a MERGE, never GitHub's "Update
  branch → Rebase branch".** A rebase rewrites the *committer* on every commit it replays, so
  every console attestation on the rolling PR comes back committed by `jmoss333`/`GitHub` and
  L4 reddens the one branch that is allowed to promote — with a diff that looks untouched. The
  plain "Update branch" (a merge) leaves the replayed commits' identities alone, and L4 skips
  the merge commit itself. The CI step ("Guard — governance/content separation",
  `build-test-validate`) is **pull-request-only** — `github.event.pull_request.base.sha` is the
  one base a push event does not carry — and on an `attest/pending` PR it also runs
  `bin/check_attestation_hashes.py --strict --base`, so the one branch that may promote is the
  one branch whose promotions must bind to the text they attest. Its body and its branch literal
  are pinned by `validate_scheduled_workflows.py`'s `CRITICAL_STEPS` and
  `tests/maintenance/test_governance_guard_pins.py`. **On a branch stacked on an unmerged PR**
  the default base is `merge-base origin/main HEAD`, which carries the PARENT's commits — so the
  gate judges work this branch never wrote and blocks every push off the stack until the parent
  merges. Push with `CLERKSHIP_PR_BASE=origin/<parent-branch> git push`: it moves the base, it
  silences no rule, and naming the branch's own tip is exit 2, not a pass. **A stale base looks
  exactly like a breach, so the report says which it probably is**: when L2 fires but L4 stays
  silent — every ledger promotion in range was committed by the console itself, which cannot
  happen on a branch an agent or the owner wrote — the L2 block appends `hint: every promotion
  here was committed by the faculty console — if these rows are already on main, your base is
  stale`. The fix is a fetch, not an edit: `git fetch origin main`, or push with
  `CLERKSHIP_PR_BASE=origin/<parent>`. A local `origin/main` behind a merged console PR and a
  re-run CI event carrying an older `base.sha` both produce it. **The limits, which
  are the honest part.** L4 covers `reviewed.json` only, so a `topic_meta`-only promotion on
  `attest/pending` passes — the console does not write `topic_meta`, so no console-identity rule
  could be defined for it. On a **fork** PR both `github.head_ref` and the commit emails are
  attacker-controlled, so the gate does not authenticate a fork's promotion and does not claim
  to. The close is owner-side, not agent-side: move the console's token to a GitHub App or
  machine user so `faculty@clerkship.local` is an identity nobody else holds, and add a ruleset
  restricting pushes to `attest/pending` to it. Until that lands, this gate raises the cost of a
  forged promotion; it does not make one impossible.
