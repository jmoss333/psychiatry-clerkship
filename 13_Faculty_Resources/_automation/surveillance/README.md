# Curriculum Surveillance

A scheduled "librarian" for the clerkship library. It watches authoritative sources,
checks that our links still work, and gathers candidate resources — then leaves
**GitHub issues** and **dated reports** for faculty to review. It never edits teaching
content. Design rationale: `ADR-001-curriculum-surveillance.md`.

## The four jobs

| Job | Cadence | What it does | Tool |
|---|---|---|---|
| `link-source-monitor` | Weekly | Verifies outbound links in Markdown/HTML (404, redirect, TLS) | GitHub Action (lychee); Apify `logiover/bulk-url-status-checker` fallback |
| `citation-monitor` | Weekly | Verifies registry source URLs plus DOI/PMID identifiers | Stdlib HTTP checks against source sites, doi.org, and NCBI |
| `guideline-surveillance` | Monthly | Detects changes at FDA / APA / DSM / USPSTF / SAMHSA / AACAP | Apify `apify/website-content-crawler` + own semantic diff |
| `resource-intake` | On-demand | Gathers candidate resources against strict filters | Apify `apify/website-content-crawler` (scoped) |

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

Wiring pattern: **collector → GitHub Action → one rolling review PR**. The four
workflows share the `surveillance-inbox` concurrency group. They hydrate prior generated
state, collect and sync, upload 90-day run artifacts, then publish only `history/**`,
`STATUS.md`, and `status.html` to `automation/surveillance-inbox`. They never push
scheduled output directly to `main`.

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

To trigger a job on demand from Apify (instead of waiting for the cron), point an Apify
webhook at GitHub's `repository_dispatch` endpoint:

```
POST https://api.github.com/repos/jmoss333/psychiatry-clerkship/dispatches
Authorization: Bearer <PAT with contents:write>
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

Enabled by four workflows in `.github/workflows/`. To go live:

1. **Set repo secret** (Settings → Secrets and variables → Actions): `APIFY_TOKEN`.
   `GITHUB_TOKEN` is provided to Actions automatically (workflows request `issues: write`
   + `contents: write`).
2. **Classify each source’s `modality`** in `source_registry.yaml` (open HTML vs PDF vs
   login). Unknowns stay `signal_only` — the safe default.
3. **Baseline the guideline job**: Actions → *Surveillance — Guideline Monitor* → Run
   workflow. First run records hashes and opens no issues.
4. **First link run** confirms the registry URLs (flips `verified` / files unreachable).
5. Schedules then run automatically (weekly links / monthly guidelines).

Local dry-run (no network, no GitHub calls) — the behavior proven before shipping:

```bash
cd 13_Faculty_Resources/_automation/surveillance/bin
python3 sync_findings.py --findings sample.json --job guideline-surveillance \
    --checked-sources checked-sources.json --issues-out /tmp/issue-state.json \
    --dry-run --existing-fixture existing_fps.json --out-dir /tmp/surv
```

Collectors run offline too: `--fixture` (guideline / intake) or `--lychee` (links).

## Next steps (proposed)

- Auto-augment `citation_index.json` by scanning inline citations across topic files
  (currently seeded with 8 high-value entries).
- Optional faculty-facing status page (open P0/P1 + "review overdue" pages) — can feed
  from `history/last_run.json`; only build if you want it surfaced on the site.
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
  PR body, for Dr. Moss to confirm the edit and re-stamp `reviewed.json`.

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
