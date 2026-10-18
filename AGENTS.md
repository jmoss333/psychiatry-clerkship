# Agent Guide — Psychiatry Clerkship Library

Single source of truth for a six-week adult inpatient psychiatry clerkship (Joshua Moss, MD).
This repo is a **static-site builder**: one source tree publishes **two Netlify sites** —
`une-ms3-psychiatry` (MS3 students) and `mmc-psychiatry-residents-sanford` (residents) — plus a
serverless SP-interview proxy. Numbered `NN_Category/` dirs are **content source**; the build
assembles them into `_build/ms3` and `_build/res`.

> **Codex parity:** this repo is used by both Claude Code and Codex. `CLAUDE.md` is canonical;
> `AGENTS.md` is a **byte-identical copy** of it (Claude reads `CLAUDE.md`, Codex reads `AGENTS.md`).
> After editing `CLAUDE.md`, run `cp CLAUDE.md AGENTS.md` — CI fails the PR if the two diverge.
> (No symlink: this repo has `core.symlinks=false`, so a link would check out as broken text.)

## How this guide is organised

This file is an **index**. The rules live in `docs/agent-guide/`, one page per topic, and every
rule there is tagged with what enforces it: `[gate: …]` names the check that fails a build, a
push or a PR; `[report: …]` names a tool that reports but blocks nothing; `[judgment]` means
nothing enforces it — you have to read it. The split was made on 2026-10-16 (R1 of the
architecture review): every rule line of the previous 938-line guide was moved verbatim into a
topic page, and `python3 bin/check_agent_guide.py --migration-from <sha>` proves it.

Three rules about this file itself:
- **Read the topic page before touching its paths** (table below). The index is not enough.
- **A new rule goes in its topic page, tagged.** Only an invariant or a pointer goes here.
- **`CLAUDE.md` may only shrink.** `bin/check_agent_guide.py` pins its line count (a ratchet,
  `docs/RATCHETS.md`), checks that every topic page is linked from here, that every tag names a
  file that exists, and that every path in the table below matches a tracked file.

## Quick commands
```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3   # build + QA gate → _build/ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res   # → _build/res
node --test tests/*.test.mjs       # root contract tests (also run before every build)
bash bin/verify.sh                 # THE local gate; the hook runs `--push` (no site builds — CI has them)
python3 bin/coordination_report.py --prs   # who else is working here — run before you start
python3 bin/what_needs_josh.py             # what only the owner can do
```

## The invariants

One line each; the topic page holds the why, the how, and the incident that earned it.

| # | Invariant | Enforced by | Page |
|---|---|---|---|
| 1 | Policy and content never travel in the same commit; a PR cannot edit its own judge | `bin/check_policy_content_separation.py`; `bin/check_governance_separation.py` L1 | governance-separation |
| 2 | A content PR may register or demote an attestation; only the faculty console may promote one, only on `attest/pending`, only as `faculty@clerkship.local` | `bin/check_governance_separation.py` L2–L4 | governance-separation |
| 3 | An attestation is bound to a hash of the text it attested; drift renders as pending on every surface and never unplaces a page; an unbound reviewed row fails the build | `validate_attestation_consistency.py`; `bin/check_attestation_hashes.py` | attestation-hashes |
| 4 | "What ships" is ONE derived file, `site_build/shipped_pages.json`; never read the producers | `shipped_pages.py --check-build`; `tests/shipped-pages-readers.test.mjs` | content-and-pages |
| 5 | Learner sites publish from `release` through the release train, never from a merge to `main`; never push `release` by hand | `production-release-train.yml`; `maintenance-release-watch.yml` | build-and-deploy |
| 6 | Never commit an LFS pointer stub; anything that commits runs host-side, never in the Cowork sandbox | `check_lfs_media.py`; `.claude/hooks/lfs_guard.py` | build-and-deploy; branching-and-worktrees |
| 7 | Crisis contacts live in `crisis_resources.json` only; no dose literals in trainers; no PHI anywhere | `crisis_block.py`; `check-static-site.mjs`; `.claude/hooks/pre_edit_guard.py` | safety-content |
| 8 | The library teaches administration; it never reproduces a copyrighted instrument; scope is a faculty decision, not an agent's | `instrument-rights-gate.mjs`; hooks | safety-content |
| 9 | Every claim about a paper carries that paper's own words; every citation carries a DOI or PMID that resolves to the paper claimed | `validate_evidence_annotations.py`; `bin/check_citation_attribution.py` | content-and-pages; gates |
| 10 | A test may not depend on live governance state; a flag only tests pass is an untested production path | `tests/live-governance-state.test.mjs` | gates |
| 11 | `bin/verify.sh --push` is the pre-push hook (the two site builds are CI's, decision `prepush-builds-to-ci`); the full run is a superset of CI; a ratchet may only fall; exit 2 (could not check) blocks like exit 1 | `bin/check-verify-coverage.py`; `docs/RATCHETS.md` | gates |
| 12 | Never merge to `main` locally, never force-push, never `git worktree prune` from a sandbox; push the branch the day you create it, as a draft PR | ruleset *main protection*; `bin/check_ruleset_drift.py` | branching-and-worktrees |
| 13 | localStorage keys are `cw_*` or `rp_*`; usage analytics store integers from a generated allowlist | `check-static-site.mjs` | tools-and-frontdoor |
| 14 | Every live draft question is attestable from the phone; revised questions stage for faculty, not learners | `bin/check-qbank-drafts.mjs`; `qbank_public.py` | question-bank |
| 15 | The Interview Room's API key stays server-side; the red-team sign-off is retired and must not be re-added as a gate | `bin/redteam-offline.mjs` | interview-room |
| 16 | Adding a `ci.yml` step trips three contracts; a red node test silently aborts the build and leaves stale `_build/` | `validate_scheduled_workflows.py`; `tests/_build_freshness.mjs` | gates; build-and-deploy |

## Before you touch these paths, read this page

| Path | Read first |
|---|---|
| `13_Faculty_Resources/reviewed.json`; `topic_meta.json` (`facultyReview`); `question_bank.json` (`status`); `pharmacy.json` (`facultyReview`) | governance-separation; attestation-hashes |
| `13_Faculty_Resources/_automation/attestation_hash.py`; `13_Faculty_Resources/_automation/surface_governance.py`; `13_Faculty_Resources/_automation/validate_attestation_consistency.py`; `faculty-console/` | attestation-hashes; attestation-delivery-and-ledger |
| `13_Faculty_Resources/ledger/`; `13_Faculty_Resources/_automation/site_build/ledger_overlay.mjs` | attestation-delivery-and-ledger |
| `CLAUDE.md`; `AGENTS.md`; `.github/`; `bin/`; `.claude/`; `*.schema.json`; `decisions.json`; `docs/agent-guide/` | governance-separation; gates |
| `.github/workflows/ci.yml`; `bin/verify.sh` | gates |
| `13_Faculty_Resources/_automation/site_build/` (the build, `site_manifest.json`, `shipped_pages.json`, nav) | build-and-deploy; content-and-pages |
| `13_Faculty_Resources/_automation/site_build/frontdoor/`; `13_Faculty_Resources/_automation/site_build/spa_index.html` | tools-and-frontdoor |
| `0[0-9]_*/`, `1[0-4]_*/`, `99_Archive/` (curriculum markdown); root registries and their `*.schema.json` | content-and-pages; safety-content |
| `question_bank.json`; `faculty-console/qbank-rules.mjs`; `bin/qbank_desktop_only.json` | question-bank |
| `_prototypes/`; `tools/`; any single-file HTML tool | tools-and-frontdoor; safety-content |
| `crisis_resources.json`; any page carrying `<!-- crisis-block -->` | safety-content |
| `instrument_rights.json`; any instrument, scale or form | safety-content |
| `evidence_annotations.json`; `evidence_registry.json`; any `## References` list | content-and-pages; gates |
| `sp-proxy/`; `_prototypes/sp-interview/`; `sp-interview.pack.json` | interview-room |
| `.claude/agents/`; `.claude/hooks/`; `.mcp.json`; `bin/run_queue_task.py`; `13_Faculty_Resources/_automation/surveillance/` | automation-and-audit-tools |
| `.devcontainer/` | devcontainer |
| any worktree, branch, commit or push | branching-and-worktrees |

## The topic pages

| Page | What it holds |
|---|---|
| [build-and-deploy](docs/agent-guide/build-and-deploy.md) | the two sites and satellites, the release train and its tripwire, Git LFS and its quota, analytics gating, build freshness and the LFS-stub guard |
| [branching-and-worktrees](docs/agent-guide/branching-and-worktrees.md) | coordinating with other sessions, draft-PR claims, branch names, main protection, worktree pools and `lean_worktrees.py`, host-side commits, the pre-push hook |
| [gates](docs/agent-guide/gates.md) | what CI runs, `verify.sh` as a superset, the citation gate, ratchets, bash 3.2, per-step `TMPDIR`, visual baselines, live-state tests, the three contracts a CI step trips |
| [devcontainer](docs/agent-guide/devcontainer.md) | the VS Code dev container: preflight, the manual full gate, the receipt and the status bar |
| [content-and-pages](docs/agent-guide/content-and-pages.md) | `NN_Category/`, registries and schemas, `site_manifest.json` vs `shipped_pages.json` (ADR-002), evidence annotations, the curriculum-review loop |
| [tools-and-frontdoor](docs/agent-guide/tools-and-frontdoor.md) | the Front Door modules and The Essentials, the CSS class inventory, single-file tools, `cw-frame`, storage namespaces, analytics counters, the feedback banner |
| [question-bank](docs/agent-guide/question-bank.md) | phone-attestable drafts; review-only staging (2026-10-11) |
| [attestation-hashes](docs/agent-guide/attestation-hashes.md) | `contentHash` / `clinicalHash`, drift projection on every surface, the spent backfill, what the projection test pins and does not pin |
| [governance-separation](docs/agent-guide/governance-separation.md) | policy vs content commits; L1–L4; what a promotion is in each registry; pack-case review as registration; the stale-base hint; the limits |
| [attestation-delivery-and-ledger](docs/agent-guide/attestation-delivery-and-ledger.md) | the rolling `attest/pending` sweep and the delivery check; the dark Ed25519 ledger (ADR-003) |
| [interview-room](docs/agent-guide/interview-room.md) | `sp-proxy/`, the retired red-team sign-off, `bin/rotation_turnover.py` |
| [automation-and-audit-tools](docs/agent-guide/automation-and-audit-tools.md) | subagents, `.mcp.json`, session hooks, the `bin/` audit family and currency guards, the egress probe, the queue that cannot rot, `SILENT_SHRINK_CHECKLIST.md`, the nightly runner |
| [safety-content](docs/agent-guide/safety-content.md) | the crisis block and its two consequences, no PHI, instrument reproduction |

## Standing decisions and design records

- `decisions.json` — faculty decisions as data; `bin/check_decision_drift.py` catches code still
  enforcing a retired one. A rule that cites a decision id (`passcode-fixed`,
  `sp-redteam-signoff-retired`, …) means that decision, not an agent's inference.
- ADRs: `13_Faculty_Resources/_automation/surveillance/ADR-001-curriculum-surveillance.md`;
  `13_Faculty_Resources/_automation/site_build/ADR-002-shipped-pages-single-source.md`; ADR-003
  (the ledger) is described in `docs/agent-guide/attestation-delivery-and-ledger.md`.
- `docs/superpowers/{specs,plans}/` — dated design docs. `docs/SILENT_SHRINK_CHECKLIST.md` — the
  failure mode every gate here exists for. `docs/RATCHETS.md` — how the pinned counts work.
