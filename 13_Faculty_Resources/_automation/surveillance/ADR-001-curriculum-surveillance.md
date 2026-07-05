# ADR-001 — Apify-backed Curriculum Surveillance System

- **Status:** Accepted (design), pending first-run validation
- **Date:** 2026-07-03
- **Owner:** Joshua Moss, MD
- **Scope:** `13_Faculty_Resources/_automation/surveillance/`
- **Supersedes:** the loose plan targeting `13_Faculty_Resources/Surveillance/*.json|csv`

## Context

The clerkship library cites external authorities (FDA drug-safety, APA practice
guidelines, DSM-5-TR, USPSTF, SAMHSA, AACAP) and links out to many resources. Two
risks accumulate silently: (1) links rot, and (2) authoritative guidance changes
while our teaching pages keep asserting the old version. We want a scheduled system
that **detects** drift and **routes it to a human**, and that never edits clinical
teaching content automatically. This mirrors the ethos already encoded in
`topic_meta.json` ("AI-drafted … pending faculty attestation") and `reviewed.json`
(explicit MD sign-off).

## Decision

Adopt **three independently scheduled jobs**, not one combined job:

| Job | Cadence | Primary tool | Output tier |
|---|---|---|---|
| `link-source-monitor` | Weekly | GitHub Action (lychee) — Apify fallback for JS/blocked hosts | `link_audit_YYYY-MM-DD.csv` |
| `guideline-surveillance` | Monthly | `apify/website-content-crawler` → own semantic diff | `guideline_delta_YYYY-MM-DD.json` |
| `resource-intake` | On-demand / monthly | `apify/website-content-crawler` (scoped) | `resource_intake_YYYY-MM-DD.csv` |

Rationale for three: independent failure domains, independent cadence, and clean
per-job datasets. A link-check flake must never mask a guideline change.

### Build-vs-reuse (concrete)

- **Link checking is better as a GitHub Action than an Apify Actor** — free, runs in
  this repo, version-controlled, no dataset round-trip. Use Apify only for hosts that
  block simple checkers or require JS rendering.
  - Apify fallback: `logiover/bulk-url-status-checker` (bulk HTTP status + redirect
    chains, CSV/JSON, no browser). Note: observed success rate ~74% — treat transient
    failures with retry-before-flag.
- **Guideline surveillance = the one job worth custom logic.** Use the official,
  high-trust `apify/website-content-crawler` (FREE tier, ~137k users, 97% success,
  Markdown + file download incl. PDFs, `respectRobotsTxtFile`, sitemaps) to fetch and
  clean content, then run our own normalize → hash → diff.
  - Evaluated `muhammad-bilal/web-drift-detector` (built-in `enableSemanticDiff`,
    severity scoring, snapshots, webhooks). Feature-perfect on paper, but ~12 total
    users / low ratings → **maintenance risk unacceptable for the patient-safety job.**
    Keep as a prototype option only; do not depend on it for FDA/REMS monitoring.
- **Resource intake** reuses `website-content-crawler` with strict `includeUrlGlobs`
  + dedup against the existing library; highest-noise job, so keep it manual-trigger
  first.

### Placement & Netlify (changed from original plan)

Machine artifacts live under `_automation/surveillance/`, **not** a top-level
`Surveillance/` folder, because:

1. It matches the existing `_automation/oe_scanner/` convention (scanner + manifest +
   staging + runbook).
2. Two Netlify sites share this repo. Dated JSON/CSV committed on a schedule must not
   trigger production rebuilds. **Action:** extend `_automation/site_build/netlify-ignore.sh`
   so changes confined to `_automation/surveillance/**` cancel the rebuild (same
   pattern already used for `_automation/*.md`).

### Human gate (non-negotiable)

Findings become **GitHub issues** (P0/P1) or a **batched digest** (P2). Nothing writes
to curriculum files. After a human acts, attestation is recorded in the existing
`reviewed.json` (`{status, at, by}`), re-stamping the affected page as reviewed. The
`affects[]` field on each finding maps a source change to specific teaching files via
`config/citation_index.json` — this is the highest-value link in the chain.

## Consequences

**Positive:** clear separation, cheap (all jobs sit in free/near-free tiers),
auditable (dated artifacts give a git-native history), and defensible for accreditation
(every finding carries source URL, timestamp, and a content snapshot).

**Negative / costs:** the guideline actor needs occasional selector maintenance;
someone must triage issues (mitigated by severity tiers + digesting P2); PDF/paywalled
sources may be `signal_only` (metadata/version monitoring, not content) for copyright
reasons, which reduces diff granularity for those sources.

**Risks & mitigations:** see `REVIEW_RULES.md` (alert fatigue, dead-scraper alarm,
duplicate-issue idempotency, false sense of currency).

## Alternatives considered

1. **One combined Actor, three modes** — rejected: couples failure domains, harder to
   test, a link flake obscures a guideline delta.
2. **No-code Apify tasks only** — rejected: weak version control and clinical
   governance; poor GitHub/Netlify integration.
3. **Everything in GitHub Actions (no Apify)** — viable for links, but weak for
   JS-rendered/PDF guideline sources and anti-bot hosts; Apify earns its place on the
   guideline job specifically.

## Open item (only blocker to full data-flow design)

Per-source **modality** classification (open HTML vs PDF vs login/paywalled). Unknown
sources default to `signal_only` in `config/source_registry.yaml` until classified;
the first `link-source-monitor` run confirms reachability and content type.


---

## Addendum — Phase 2 (AI-drafted suggestions + citation validity)

**Decision.** Extend the "detect → attestation PR" loop with two *advisory* capabilities that
never bypass the human attestation gate.

**AI-drafted edit (`lib_ai_draft.py`).** An attestation PR may carry an LLM-drafted *suggested*
edit. We accepted the value (faculty start from a concrete diff, not a blank page) only because
the design makes autonomy impossible **by construction**, not by prompt discipline: the module has
no write path to teaching content or `reviewed.json`; its only output is text appended to a PR body;
the draft is banner-labelled advisory, collapsed, and fence-neutralized against markdown injection;
and absence of `ANTHROPIC_API_KEY` yields a byte-identical Phase-1 PR. Stdlib `urllib` call (no SDK)
keeps the zero-install ethos. Temperature 0, bounded input (page/diff truncation) and output tokens.
This preserves the ADR's core invariant: **surveillance never edits teaching content** — a *draft
suggestion for a human* is not an edit.

**Live citation validity (`run_citation_check.py`).** The lychee link-monitor crawls links in
built HTML/markdown; it cannot see the authoritative source URLs that live in `source_registry.yaml`,
nor validate DOIs/PMIDs as citations. A dedicated weekly job checks both (doi.org / NCBI eutils),
emitting the same `finding` schema so it reuses `sync_findings.py` unchanged. To avoid alert fatigue
(a known risk in `REVIEW_RULES.md`), a *no-HTTP-response* result — commonly datacenter-IP bot-blocking
rather than a dead page — is capped at P1 so it can never page as a false P0; a definitive HTTP 4xx/5xx
keeps the registry severity. Idempotency (fingerprint dedup across open **and** closed issues) means a
dismissed false positive never reopens.

**Human gate unchanged.** Both features still terminate at Dr. Moss reviewing and re-attesting.
The only new operational input is an optional `ANTHROPIC_API_KEY` repo secret to enable drafting.
