# Attestation hashes

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). How a faculty signature is bound to the text it attested (`contentHash`, the v2 `clinicalHash`), how a drifted row renders on every surface, the one spent backfill, and what the projection test pins and does not pin.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### An attestation names the text it attested, and the name has to still fit — [gate: 13_Faculty_Resources/_automation/validate_attestation_consistency.py; bin/check_attestation_hashes.py; tests/attestation-projection-build.test.mjs]
- **An attestation names the text it attested, and the name has to still fit.** A reviewed row's
  `contentHash` in `13_Faculty_Resources/reviewed.json` is a **git blob SHA over a manifest** —
  one line per input, each line itself a blob SHA: the slug's shipped source file(s) (`source`
  plus any `extraSources` in `site_build/shipped_pages.json`, sorted by path) and its
  `topic_meta.json` record canonicalised with `facultyReview` removed, because governance state is
  not content and attesting a page must not depend on the block that records the attesting. The
  rule lives once in `13_Faculty_Resources/_automation/attestation_hash.py`;
  `python3 bin/check_attestation_hashes.py --explain SLUG [--rev REV]` prints the manifest so
  anyone can re-derive the value by hand with `git hash-object --stdin`, and
  `faculty-console/attestation-hash.mjs` is the JS twin that the console writes with
  (`tests/attestation-hash-parity.test.mjs` pins the two byte for byte). Why: on 2026-09-16 #640
  and #672 added 85 citations to already-attested pages, and **#672 alone** re-dated three of
  those attestations and flipped three pending pages to `reviewed` under the owner's name (#640's
  governance damage was a different one: it wrote the SafetyKit rule into CLAUDE.md/AGENTS.md from
  inside a content PR — the rule #672 then leaned on). Every one of those pages went on reading
  reviewed, by a named clinician, on a date — nothing in the repository bound an attestation to
  the text it attested, so rewriting the page afterwards cost nothing and showed nowhere.
  **Drift is a notice; unbound fails closed.** A content PR edits an attested page
  constantly, so a stale row exits 0 — `bin/verify.sh` reports it and `bin/what_needs_josh.py`
  lists the drifted pages as the owner's work — but a reviewed *shipped* row with no
  `contentHash`, a malformed one (not 40 hex), a missing attested source, or an unshipped row
  absent from `attestation_hash.py`'s `LEDGER_ONLY_LEGACY` is an **error** in
  `validate_attestation_consistency.py`, which `site_build/build_and_check.sh` runs **before**
  either build — so a hand-edited ledger fails the Netlify production deploy and the last good
  deploy stays live, which is the intended posture for a crisis-content site, not an outage.
  **Only the faculty console may write a hash** (`faculty-console/netlify/functions/attest.mjs`,
  on attest): it shows a drifted row as needs-review — status `unreviewed`, reason "Content
  changed since faculty review on <at>; awaiting re-attestation." — and re-attesting rebinds it.
  **Fingerprint v2 — a citation-only change keeps the signature** (Joshua Moss, MD,
  2026-09-26): a row may also carry `clinicalHash`, the same manifest over the page's *clinical
  text* (a `fingerprint clinical/1` line first; Markdown sources with Key-paper lines,
  reference-list entries, DOIs/PMIDs/PubMed links, numeric and footnote anchors, author–year
  parentheticals, emphasis and whitespace removed; `evidenceIds` dropped from the topic_meta
  record; every other source hashed exactly as v1). A row is bound when EITHER hash matches.
  Only the console writes it (on every signature, and a baseline stamps already-bound rows);
  a row without it is v1-only. A row kept only by `clinicalHash` is **reported, never
  silent** — `CITATIONS CHANGED` in `bin/check_attestation_hashes.py`, `citationsChanged` in the
  console — because the machine citation gate (#694) is not built and #672 was a citation
  change. Measured before building: of 205 signatures voided since 2026-09-16 it would have
  kept 3. Rules and risk: `attestation_hash.py` above `CLINICAL_FINGERPRINT`.
  The 2026-09-18 truthful backfill was the one-time exception, binding each existing row to the
  text as of its own `at` date (the day ends 23:59:59 **UTC**, always); its provenance is
  `13_Faculty_Resources/Handoffs/CONTENTHASH_BACKFILL_2026-09-18.md`. **That exception is spent**
  — `--write-backfill` is never to be run against the live ledger again, and
  `--write-backfill --as-of-now` least of all: it would rebind every drifted row to today's text,
  silently re-attesting pages nobody reviewed.
  **A drifted row RENDERS as pending, on every surface, and never unplaces the page.** Both
  builds load the ledger through `surface_governance.load_effective_ledger()`, which projects a
  stale row to `status: pending`, `by: "Pending faculty review"` and the one
  `attestation_hash.STALE_REASON` string. A learner therefore sees the ordinary pending-high or
  pending-compact notice carrying that reason, the nav/search badge, and — for a tool — the
  direct-open block plus `needs-review` in `tool-governance.json`. The **built** `topic_meta.json`
  is demoted in the same pass (`project_topic_meta_faculty_review`, after `cotw_meta.inject` in
  both build scripts): `facultyReview.status` becomes `pending` while `reviewer` and
  `lastReviewed` are **kept** (D6 — the review did happen on that date, over the older text), so
  the Front Door's `✓ … faculty-attested` line disappears for a drifted page without erasing who
  reviewed it. The source `topic_meta.json` and `reviewed.json` are never written: only the
  console writes the faculty's record. The weekly digest reports `staleAttestations` and sits at
  `gate: review` while the count is above zero, which routes one maintenance issue naming the
  count and the first five slugs. The demotion **warns, it never unplaces** — a drifted page stays
  in nav and in the search index, because an unreachable protocol at 2am is worse than a warned
  one. What pins all of that is `tests/attestation-projection-build.test.mjs`, which reads
  `_build/<site>` and asserts that the two built registries AGREE: a `governance.json` item that
  is pending with the stale reason has a built `topic_meta.facultyReview` that is not `reviewed`
  and still carries `reviewer`/`lastReviewed`; a `governance.json` item that is `reviewed` and
  has a source-authored block has a built block reading `reviewed` (it skips with its reason
  while that set is empty, rather than passing over nothing); every drifted slug is still placed
  in `nav.json` and every drifted index row badges `pending`; and no tracked `contentHash`
  appears in any served JSON. It is a local-only contract — `node --test` runs before both
  builds, so CI never reaches it. **What it does not pin is ORDER.** `cotw_meta.py` writes
  `facultyReview.status: "pending"` unconditionally for every derived case and `inject()` leaves
  a hand-written entry alone, while `project_topic_meta_faculty_review` only rewrites blocks that
  already exist — so inject-then-demote and demote-then-inject produce identical bytes, and
  re-ordering them is undetectable *and harmless*. A later write that re-marked a drifted page
  `reviewed` is the real hazard, and that one IS caught, because the two built registries would
  then disagree. Placement is not pinned by `faculty-console/check_pending_visible.mjs` either:
  that reads the **source** ledger, where a drifted row still says `reviewed`, and never opens
  `nav.json` or `search-index.json`. The search index legitimately carries fewer slugs than nav
  (the week pages and two tools are never indexed) and that omission is governance-independent,
  so the test asserts nav placement and the embedded badge rather than search membership.
  One knock-on to expect: `check-static-site.mjs` §4a2 counts only pages the built
  `governance.json` calls `reviewed` toward crosswalk coverage, so drift surfaces there as
  **soft** `blueprint gap:` findings — the §9 ratchet was raised 0 → 6 per site for exactly
  that, and each re-attestation lowers it, so **lower the pin back** as the queue drains rather
  than leaving headroom.
  **And what it does not close on
  its own:** a content PR that edits an attested page AND rewrites that row's `contentHash` in the
  same diff passes every gate *this* bullet installs — diff-scoped `--strict` fails only a touched
  row that is stale at head, and the authorship check reads the signer string. The next bullet
  closes it: rewriting a reviewed row's `contentHash` **is a promotion**, so L2 fails that diff on
  any branch but `attest/pending` and L4 fails it for any author or committer but the console.
  What survives both is a promotion pushed to `attest/pending` under a forged
  `faculty@clerkship.local` identity — deliberate fraud rather than drift, and the owner-side
  close for it is named there too. Not the same field as `canonical_claims.json`'s
  `contentHashAtReview`, which is a sha256 of one cited file's whole text per **cited-file
  entry** (an `appliesTo` entry in `canonical_claims.schema.json`, narrowed by
  `scopeHashAtReview`).
