# Architecture decision records — the index

One place to find every standing architectural decision. ADR files live where the code they
govern lives (moving them would churn the references and the policy/content classifier);
**this index is the contract**: `tests/adr-index.test.mjs` fails when an `ADR-NNN` is referenced
anywhere in the repository and is not listed here, or when a listed path does not exist.

Faculty (clinical and governance) decisions are a different registry: `decisions.json`, checked
by `bin/check_decision_drift.py`. An ADR says how the system is built; a decision says what the
faculty ruled. When one implies the other, each links the other.

## Numbered ADRs

| ADR | Decision | Status | File |
|---|---|---|---|
| ADR-001 | Curriculum surveillance: scheduled monitors (citations, links, guidelines, resource intake) file findings as issues; humans action them | Accepted, live | `13_Faculty_Resources/_automation/surveillance/ADR-001-curriculum-surveillance.md` |
| ADR-002 | `shipped_pages.json` is the single derived source of "what ships"; every producer feeds it and the build checks it against real output | Accepted, live (PR #522; reader migration complete 2026-09-06) | `13_Faculty_Resources/_automation/site_build/ADR-002-shipped-pages-single-source.md` |
| ADR-003 | Attestation ledger: Ed25519-signed, hash-chained sign-offs on an orphan branch, projected into each build | Accepted 2026-09-25, **dark** — activate or remove is open (review §6-a) | `docs/adr/ADR-003-attestation-ledger.md` |

## Decisions that function as ADRs but were recorded as specs or rulings

| Decision | Where | Date |
|---|---|---|
| Attestations are bound to a hash of the attested text; drift renders as pending; unbound fails closed; v2 clinical fingerprint keeps a citation-only change | `docs/agent-guide/attestation-hashes.md` (rule), `13_Faculty_Resources/Handoffs/CONTENTHASH_BACKFILL_2026-09-18.md` (the one-time backfill) | 2026-09-16 → 09-26 |
| Governance/content separation (L1–L4) and policy/content separation | `docs/agent-guide/governance-separation.md`; `bin/check_governance_separation.py`, `bin/check_policy_content_separation.py` | 2026-09-17 → 09-27 |
| A citation must carry a DOI or PMID that resolves to the paper claimed | `docs/superpowers/specs/2026-09-27-citation-attribution-gate-ruling.md` (design: `2026-09-17-citation-attribution-gate-design.md`) | 2026-09-27 |
| The learner sites publish from `release` through a scheduled train with a spend tripwire | `docs/agent-guide/build-and-deploy.md`; `13_Faculty_Resources/_automation/NETLIFY_COST_REDUCTION_PLAN.md`, `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md` | 2026-09-25 |
| The live red-team sign-off is retired; offline probes gate every PR | `docs/superpowers/specs/2026-09-27-red-team-signoff-retired.md`, `2026-09-27-red-team-governance-simplification-design.md`; `decisions.json` `sp-redteam-signoff-retired` | 2026-09-27 |
| Revised questions stage for faculty, not learners | `docs/superpowers/specs/2026-10-11-qbank-review-only-staging.md` | 2026-10-11 |
| CLAUDE.md is an index; rules live in tagged topic pages | `bin/check_agent_guide.py` (the contract), PR #1079 | 2026-10-16 |
| Audience-as-data is deferred until a third learner audience is scheduled | `docs/superpowers/specs/2026-10-17-audience-as-data-deferral.md`; `decisions.json` `two-audience-copy-accepted` | 2026-10-16 |

## Adding one

Number the next ADR, put the file beside the code it governs (or here if it governs the whole
system), add its row above, and run `node --test tests/adr-index.test.mjs`. An ADR that changes
how work is reviewed or gated is a policy change: its own PR, no content in the diff
(`docs/agent-guide/governance-separation.md`).
