# Curriculum Surveillance

A scheduled "librarian" for the clerkship library. It watches authoritative sources,
checks that our links still work, and gathers candidate resources — then leaves
**GitHub issues** and **dated reports** for faculty to review. It never edits teaching
content. Design rationale: `ADR-001-curriculum-surveillance.md`. For the combined
operations matrix, alert semantics, and pause procedure, see the
[scheduled maintenance runbook](../maintenance/README.md).

## The four jobs

| Job | UTC cadence | Artifact (90 days) | What it does |
|---|---|---|---|
| `link-source-monitor` | Monday 06:00, `0 6 * * 1` | `surveillance-link-monitor-${{ github.run_id }}` | Verifies outbound links in Markdown/HTML (404, redirect, TLS) |
| `citation-monitor` | Monday 07:00, `0 7 * * 1` | `surveillance-citation-monitor-${{ github.run_id }}` | Verifies registry source URLs plus DOI/PMID identifiers |
| `guideline-surveillance` | First day monthly 06:00, `0 6 1 * *` | `surveillance-guideline-monitor-${{ github.run_id }}` | Detects changes at scoped authoritative sources |
| `resource-intake` | On demand; no cron | `surveillance-resource-intake-${{ github.run_id }}` | Gathers candidate resources against strict filters |

GitHub cron is UTC and becomes active only from the default branch. A branch-local
workflow is not scheduled production state.

## Directory layout

```
_automation/surveillance/
├── README.md                      ← this file
├── ADR-001-curriculum-surveillance.md
├── REVIEW_RULES.md                ← severity, idempotency, human gate, SLAs
├── bin/                           ← the pipeline (stdlib Python; pyyaml only in collectors)
│   ├── lib_surveillance.py        ← shared: affects resolution, escalation, fingerprint, rendering
│   ├── sync_findings.py           ← findings → idempotent GitHub issues + reports (the core)
│   ├── run_link_monitor.py        ← parse lychee JSON → findings
│   ├── run_guideline_surv.py      ← Apify crawl + normalize/hash/diff vs baseline → findings
│   ├── run_resource_intake.py     ← scoped Apify crawl → P2 candidates
│   ├── report_branch.py           ← hydrate/publish the protected rolling report branch
│   ├── open_update_pr.py          ← actionable delta → attestation-routed PR (Phase 1)
│   ├── lib_ai_draft.py            ← ADVISORY AI-drafted edit for a PR (Phase 2; needs ANTHROPIC_API_KEY)
│   └── run_citation_check.py      ← live source-URL + DOI/PMID validity → findings (Phase 2)
├── apify/                         ← paste-into-console input examples (3)
├── config/
│   ├── source_registry.yaml       ← SINGLE SOURCE OF TRUTH for all 3 jobs
│   ├── finding.schema.json        ← normalized output every job emits
│   └── citation_index.json        ← curriculum file → sources it depends on
└── history/                       ← dated datasets (git-native audit trail)
    ├── link_audit_YYYY-MM-DD.{csv,json}
    ├── citation_audit_YYYY-MM-DD.{csv,json}
    ├── guideline_delta_YYYY-MM-DD.json
    ├── resource_intake_YYYY-MM-DD.{csv,json}
    ├── digest_YYYY-MM.md          ← batched P2 items
    ├── baselines/<source_id>.json ← guideline baselines (hash; +text for full_text sources)
    └── last_run.json              ← per-source last_checked stamps

.github/workflows/  →  surveillance-link-monitor.yml (weekly),
                       surveillance-citations.yml (weekly),
                       surveillance-guideline.yml (monthly),
                       surveillance-resource-intake.yml (manual)
```

## Data flow

```
Collector / GitHub Action
   → writes findings.json + checked-sources.json
   → sync resolves affects[] and reads the live surveillance issue queue
        → P0/P1 → open issue (idempotent by fingerprint)
        → P2   → append to monthly digest
        → write dated report + content-free issue-state.json
   → status builder overlays live open/closed issue truth
   → generated history/status only → rolling automation/surveillance-inbox PR
   → faculty review → edit page manually if needed → re-stamp reviewed.json → close issue
```

An existing open or closed fingerprint is deduplicated; automation does not comment on,
reopen, or update that issue. Live status excludes closed issues from the active queue.
If a finding requires a clinical change, faculty decide the edit and re-attestation, then
close the issue manually.

Wiring pattern: **collector → GitHub Action → one rolling review PR**. The four
workflows share the `surveillance-inbox` concurrency group. They hydrate prior generated
state, collect and sync, upload 90-day run artifacts, then publish only `history/**`,
`STATUS.md`, and `status.html` to `automation/surveillance-inbox`. They never push
scheduled output directly to `main`.

The full repository-relative write allow-list is exact:

- `13_Faculty_Resources/_automation/surveillance/history/**`
- `13_Faculty_Resources/_automation/surveillance/STATUS.md`
- `13_Faculty_Resources/_automation/surveillance/status.html`

The branch helper rejects any other path and publishes with the captured remote SHA and
an exact force-with-lease. Actionable guideline findings may separately open a
fingerprint-scoped proposal PR that changes only `config/needs_reattest.json` and
`PENDING_UPDATES.md`; it does not edit teaching content or `reviewed.json`.

## Netlify note (done)

Two sites share this repo and `netlify.toml` has a build-ignore hook. Committing dated
JSON/CSV must not trigger production rebuilds — so `netlify-ignore.sh` now also skips a
build when every changed file is under `_automation/surveillance/**` (added alongside the
existing `_automation/*.md` rule). No further action needed.

## Status page & external triggers

Every run regenerates the faculty view (via `bin/build_status.py`):

- **`STATUS.md`** — GitHub renders it in-repo: open P0/P1, pages needing re-review
  (attestation older than the change that affects them), and per-source freshness.
- **`status.html`** — standalone dashboard; open via `file://` or copy into a faculty area.
- Every render identifies issue authority as either `live` (a normalized GitHub issue
  snapshot was supplied) or `offline-report-fallback`. The fallback is explicit and
  must not be interpreted as the current GitHub queue.
- DOI/PMID findings are triaged separately: live teaching-page citations are grouped
  by affected page, while imported NotebookLM bundles, `_source` reports, faculty-only
  files, and prototypes are excluded from page re-review counts.

For a manual run, prefer **Actions → the named workflow → Run workflow**. Link,
citation, and guideline workflows also accept a narrowly scoped
`repository_dispatch` event for an existing external controller. Any dispatch credential
must remain in that controller's secret store, be least-privilege and manually rotated,
and never appear in this repository, an artifact, or a log. The request shape is:

```
POST https://api.github.com/repos/OWNER/REPOSITORY/dispatches
Authorization: Bearer <externally stored token>
Accept: application/vnd.github+json
Body:  {"event_type": "surveillance-guideline"}   # or "surveillance-link"
```

The matching workflow listens via `on: repository_dispatch`. Note: website-content-crawler
has no built-in change detection, so the meaningful diff still happens in
`run_guideline_surv.py` against the stored baselines — the webhook just swaps the schedule
for an event.

## Cost & secrets

- The Apify-backed guideline/intake work sits in the free/near-free tier at this
  volume. Set a monthly compute-unit cap + alert; `resource-intake` is the only job
  that can grow — it is manual-triggered and capped at `max_candidates_per_run: 25`.
- Secrets: `APIFY_TOKEN` and the built-in `GITHUB_TOKEN`. Workflows grant only
  contents, issues, and pull-request write access for the report/issue review loop.

## Running it

Implemented by four workflows in `.github/workflows/`. Scheduled runs begin only after
the workflow files reach the default branch. To configure the external collectors:

1. **Set repo secret** (Settings → Secrets and variables → Actions): `APIFY_TOKEN`.
   `GITHUB_TOKEN` is provided to Actions automatically (workflows request `issues: write`
   + `contents: write`).
2. **Classify each source’s `modality`** in `source_registry.yaml` (open HTML vs PDF vs
   login). Unknowns stay `signal_only` — the safe default.
3. **Baseline the guideline job**: Actions → *Surveillance — Guideline Monitor* → Run
   workflow. First run records hashes and opens no issues.
4. **First citation run** reports which registry URLs and DOI/PMID identifiers are valid or
   unreachable. It does not edit `source_registry.yaml`; any registry update remains a
   human-reviewed change.
5. **First link run** reports outbound-link failures found in repository Markdown and HTML.
6. Schedules then run automatically: weekly links and citations, monthly guidelines;
   resource intake remains manual.

## Local operator runs

Run from the repository root. Use synthetic or previously captured inputs in `/tmp`;
these commands do not write generated state into the source tree. `maintenance_issue.py`
and `report_branch.py publish` are intentionally absent because they perform real
GitHub/git writes and have no dry-run mode.

```bash
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py \
  --self-test

python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py \
  --out /tmp/citation-findings.json \
  --checked-out /tmp/citation-checked.json

python3 13_Faculty_Resources/_automation/surveillance/bin/run_link_monitor.py \
  --lychee /tmp/lychee.json \
  --out /tmp/link-findings.json \
  --checked-out /tmp/link-checked.json

python3 13_Faculty_Resources/_automation/surveillance/bin/run_guideline_surv.py \
  --fixture /tmp/guideline-texts.json \
  --baseline-dir /tmp/guideline-baselines \
  --out /tmp/guideline-findings.json \
  --checked-out /tmp/guideline-checked.json

python3 13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py \
  --fixture /tmp/crawled-items.json \
  --out /tmp/resource-findings.json \
  --checked-out /tmp/resource-checked.json

python3 13_Faculty_Resources/_automation/surveillance/bin/sync_findings.py \
  --findings /tmp/guideline-findings.json \
  --checked-sources /tmp/guideline-checked.json \
  --issues-out /tmp/issue-state.json \
  --job guideline-surveillance \
  --dry-run \
  --out-dir /tmp/surveillance-history

python3 13_Faculty_Resources/_automation/surveillance/bin/build_status.py \
  --history-dir /tmp/surveillance-history \
  --out-dir /tmp/surveillance-status \
  --issues-json /tmp/issue-state.json

python3 13_Faculty_Resources/_automation/surveillance/bin/open_update_pr.py \
  --findings /tmp/guideline-findings.json \
  --dry-run \
  --out-dir /tmp/surveillance-pr
```

The three fixture paths are inputs you supply; do not use real learner, patient, or
credential data. A live citation run omits `--self-test` and should still write
`--out` and `--checked-out` under `/tmp`.

## Next steps (proposed)

- Auto-augment `citation_index.json` by scanning inline citations across topic files
  (currently seeded with 8 high-value entries).
- Generate the schedule/artifact table from the parsed workflow contract so CI can flag
  future runbook drift.
- Optional: pull FDA drug-label changes per taught medication (structured openFDA API)
  as a higher-precision complement to the drug-safety page diff.

## The attestation hop — `bin/open_update_pr.py`

Surveillance no longer ends at an issue. For an **actionable** guideline delta (P0/P1 on a page we
teach), `open_update_pr.py` opens an **attestation-routed pull request** (branch
`surveillance/update-<fp8>`, idempotent per fingerprint) that:

- flags the affected topic slug(s) in `config/needs_reattest.json` — which `build_attest.py` unions
  into the Review & Attest tool's "changed" list, so the page's *Reviewed by* badge is queued for
  re-confirmation;
- logs the proposal in `PENDING_UPDATES.md`;
- carries the source diff, affected pages, recommended action, and an **attestation checklist** in the
  PR body, for the authorized faculty reviewer to confirm the edit and re-stamp `reviewed.json`.

It runs after the generated report inbox is published (needs `pull-requests: write`) and
caps new PRs via `MAX_NEW_PRS`. An actionable P0/P1 routing failure fails visibly; the
report artifact and rolling inbox publication remain available for review. Test it
offline (no git/gh):

```
python3 bin/open_update_pr.py --findings fixtures/guideline_delta_example.json --dry-run --out-dir /tmp/surv_pr
```

Loop: **detect → PR that flags re-attestation → faculty edits + re-attests → merge.**

## Phase 2 — AI-drafted suggestions + live citation validity

Two additions close the loop tighter, both strictly **advisory** and both no-ops without setup:

**1. AI-drafted suggested edit (`lib_ai_draft.py`).** When an attestation PR is opened, if the
`ANTHROPIC_API_KEY` repo secret is present, each PR gets an **advisory** AI-drafted edit — a minimal
`before:`/`after:` suggestion tying the source change to the affected page, plus a *Reviewer must
verify* checklist. Hard guardrails by construction: it **never** writes a teaching `.md`, **never**
touches `reviewed.json`, **never** marks anything attested; output is banner-labelled, collapsed in a
`<details>` block, and fence-neutralized. **No key → PR is byte-identical to Phase 1.** Test offline:

```
python3 bin/open_update_pr.py --findings fixtures/guideline_delta_example.json --dry-run \
    --out-dir /tmp/surv_pr --ai-stub      # canned block, no API call
```

**2. Live citation validity (`run_citation_check.py`).** Weekly (`surveillance-citations.yml`), verifies
the authoritative **source URLs** in `source_registry.yaml` (which live in YAML, so lychee never sees
them) and any **DOIs/PMIDs** cited in curriculum text still resolve — via `doi.org` / NCBI eutils.
Failures become idempotent issues (a no-HTTP-response is capped at P1 to avoid false P0 pages from
bot-blocking). The scanner skips imported/archive-only citation copies so faculty issues route to
live curriculum surfaces first. DOI checks stop at the DOI.org redirect layer: a DOI.org 3xx redirect
counts as resolved, even if the downstream publisher blocks automation with 403. Stdlib-only; no extra
secret. Test:

```
python3 bin/run_citation_check.py --self-test                 # offline logic check
python3 bin/run_citation_check.py --skip-citations --out /tmp/f.json   # live: registry URLs only
```
