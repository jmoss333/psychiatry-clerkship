# Cowork Project Setup — Psychiatry Clerkship Library

**Date:** 2026-08-31 · **Author:** Claude (session audit, revised after verification) · **For:** Joshua Moss, MD

Scope: how to configure the **Cowork project layer** so a cold session is immediately useful —
plus what the verification pass actually found.

Baseline: branch `feat/410-d12-d16`, verified against the Mac and against `origin` via `gh`.

---

## 0. Corrections to the first draft of this document

The first pass was written from the Cowork sandbox and got four things wrong. Recording them
because the *reason* they were wrong is itself a durable lesson about this project.

| First draft said | Actually |
|---|---|
| `gh` and `git-lfs` are not installed; GitHub work is blocked | Both are installed on Josh's Mac (`gh` 2.92.0 authed as `jmoss333`, `git-lfs` 3.7.1). The Cowork shell is an isolated Linux VM that only *mounts* the repo — the missing tools and the 41 phantom `.m4a` diffs are sandbox artifacts. `git status` on the Mac is clean. **GitHub work is fully available via Desktop Commander.** |
| `.claude/` has no skills — the repo has zero native skills | Two tracked skills exist: `clerkship-deploy` and `topic-meta-author` (the latter with evals and four reference files). The first draft's `find` was truncated by a `head -80`. `clerkship-deploy` already documents the LFS-phantom trap in detail. |
| No OpenEvidence intake pipeline; 31 dormant `.docx` reviews | `_automation/oe_scanner/` exists with a runbook, manifest, staging dir, and an `--attest` sign-off workflow. **30 of 30 files are already processed**, 0 new/changed, 0 pending attestation. Josh attested a batch on 2026-07-31. |
| 37 pages needing re-review, 34 never attested — live clinical risk | Stale artifact. `STATUS.md` was generated 2026-07-13; `reviewed.json` has been updated since (most recently today). Regenerating gives **P0 = 0, P1 = 0, pages needing re-review = 0** — "all affected pages attested since their last change." |

**The lesson, worth keeping:** in this project, a report file's *contents* and its *generation date*
are different facts. Several of the alarming numbers in the tracked artifacts describe a July world.
Always regenerate before reacting.

---

## 1. What the verification pass found instead

### THE FINDING — every scheduled workflow has been failing for weeks

Confirmed via `gh run list` against `origin`:

| Workflow | Cadence | Recent runs |
|---|---|---|
| `maintenance-heartbeat.yml` | daily | failure 8/31, 8/30, 8/29 |
| `surveillance-citations.yml` | weekly | failure 8/31, 8/24, 8/17 |
| `surveillance-link-monitor.yml` | weekly | failure 8/31, 8/24, 8/17 |
| `surveillance-guideline.yml` | monthly | failure 8/1, and back to 7/29 |

Two distinct failure modes, both diagnosed:

1. **Surveillance jobs die at `gh pr create`.**
   `subprocess.CalledProcessError: Command '['gh', 'pr', 'create', '--base', 'main', '--head',
   'automation/surveillance-inbox', ...]' returned non-zero exit status 1.`
   The workflow files declare the right permissions (`contents: write`, `issues: write`,
   `pull-requests: write`), the branch exists and is 1 commit ahead of main, and no open PR
   is blocking it. That points at a **repository or organisation Actions setting** —
   "Workflow permissions" set to read-only, "Allow GitHub Actions to create and approve pull
   requests" disabled, or a `main` ruleset — rather than at the code. Note `settings.local.json`
   shows recent work on `ruleset-main.json` / `ruleset-main-v2.json`; that is the first place to look.

2. **The heartbeat cannot see the runs it monitors.** `workflow_heartbeat.py` exits 2 with
   `gate: blocked` and every workflow `state: unavailable`, despite `actions: read` being declared.

The compounding problem: **the job whose entire purpose is to notice that the other jobs stopped is
itself one of the failing jobs, and nothing escalates when it fails.** Seven weeks of silence read
exactly like seven weeks of health.

Downstream consequences, all now measured:
- `history/` last updated 2026-07-13; `last_run.json` frozen at the same date.
- **All 385 tracked DOI/PMID citation IDs are stale** (last check 2026-07-08).
- **6 sources stale** against their registry cadence.
- `STATUS.md` — the primary faculty view — showed a July P0/P1 that no longer exists.

**This is not something an agent should fix unassisted.** `validate_scheduled_workflows.py` pins
each workflow by exact step inventory *and* a sha256 of the whole file, and `check-verify-coverage.py`
requires a mirror in `bin/verify.sh`. Changing a workflow trips three contracts. The likely fix is a
GitHub settings toggle, not a code change.

---

## 2. What is already strong — do not rebuild

| Layer | State |
|---|---|
| Agent guide | `CLAUDE.md` (9.4 KB), byte-mirrored to `AGENTS.md` for Codex parity. |
| CI | Path-lint → validators → build+QA gate (ms3 & res) → Playwright smoke. Mirrors Netlify. |
| Repo skills | `clerkship-deploy` (deploy/LFS/Netlify traps), `topic-meta-author` (with evals — mandatory for any `topic_meta.json` edit). |
| Evidence gate | 46 sources / 46 claims, each with a verbatim `sourceSpan`; policy enforces "rewrite the claim, never the span"; 730-day expiry; a 16-source legacy backlog that may only shrink. |
| OpenEvidence intake | `oe_scanner/` — scan, extract, stage, and an `--attest` audit trail. Current: 30/30 processed, 0 pending. |
| Red team | Tiers 1–2 scripted (`bin/redteam-live.sh`, `bin/redteam-offline.mjs`); tier 3 a runbook. |
| Pack waves | `bin/apply_pack_wave.py` — id-keyed structural diff, formatting-preserving, round-trip verified. |
| Rotation readiness | Now live (§3). |

---

## 3. Phase 1 — completed 2026-08-31

| Item | Status |
|---|---|
| **Rotation blocks populated** | `rotation_blocks.json` now carries the six MS3 psychiatry blocks from the UNECOM confirmation. Validator passes; passport reads **`active`**. |
| **Toolchain claim corrected** | No installs needed — see §0. The fix was documentation, not software. |
| **Surveillance status regenerated** | `STATUS.md` + `status.html` rebuilt from current `reviewed.json`: P0 0, P1 0, pages needing re-review 0, stale sources 6, citations 385/385 stale. |
| **Project instructions drafted** | `docs/superpowers/plans/PROJECT_INSTRUCTIONS.md` — paste block, now including the two-machines rule and a "check what exists first" section. |
| **Repo hygiene** | Assessed, not executed — see §5. |

### Rotation calendar now in the system

Six-week blocks; the schema rejects `name`/`email`/`learnerId`, so **no learner identities were
written to the repo**. MS4 blocks are 4 weeks and would fail the validator's 35–49 day rule —
they are deliberately excluded, which is a design question for Josh (§6).

| Block | Dates | Status on 2026-08-31 |
|---|---|---|
| 2 | 2026-08-17 → 2026-09-27 | **active** (day 15 of 42) |
| 3 | 2026-09-28 → 2026-11-08 | planned — readiness flips to `due` on 2026-09-21 |
| 5 | 2027-01-04 → 2027-02-14 | planned |
| 6 | 2027-02-15 → 2027-03-28 | planned |
| 7 | 2027-03-29 → 2027-05-09 | planned |
| 8 | 2027-05-10 → 2027-06-20 | planned |

**A rotation is running right now**, and its readiness checklist — which includes "run the Interview
Room red-team checklist and golden transcript" — was never evaluated, because the config was empty
when it started.

---

## 4. Phase 2 — the real queue

| # | Item | Why |
|---|---|---|
| 1 | **Unblock the scheduled workflows.** Check repo Settings → Actions → Workflow permissions, and any `main` ruleset. | Everything else downstream is frozen behind this. |
| 2 | **Re-run citation + link surveillance** once #1 is green. | 385/385 citation IDs stale; 6 stale sources. |
| 3 | **Escalation for the heartbeat.** Fix `actions: read` visibility, then make heartbeat failure notify — not just go red. | The silent-failure mode is the actual defect. |
| 4 | **Red-team receipt.** Run tier 3 live for the #410 wave, then `record_red_team.py`. `receipts/` still does not exist. | The active rotation's checklist asks for it; monthly review flags operations without it. |
| 5 | **PR 2 (#410 D16 view layer)** and post the #410 issue comment — `gh` works, so this is unblocked. | Carried from the last wave. |

---

## 5. Repo hygiene — assessed, deliberately not executed

`.gitignore` already covers more than it appeared to: `*.pdf` is globally ignored (so the vendor
invoice in `410 decision to review/` is not at risk of being committed), `OPENEVIDENCE RAW FILES TO
REVIEW/` is ignored with an explanatory comment, and `tmp/` and most of `outputs/` are ignored.

`410 decision to review/` is untracked but **not** ignored, and is referenced by name in
`bin/apply_pack_wave.py`'s documented invocation. Renaming it would break that path for no
functional gain, so it was left alone. Recommendation: add it to `.gitignore` and move the invoice
out by hand — a two-line change Josh should make, not an agent.

---

## 6. Open questions — yours, not an agent's

1. **Actions settings.** Which toggle or ruleset is refusing `gh pr create`?
2. **MS4 blocks.** Four-week blocks fail `rotation_readiness.py`'s 35–49 day rule. Widen the rule,
   add a second config, or accept that readiness tracks MS3 only?
3. **COWS waiver.** Status of the Taylor &amp; Francis letter. Still the one item blocking Wave 4.
4. **Publish "How We Know"?** (§7) — it teaches critical appraisal using this library's own
   corrections. Publishing means showing learners faculty-authored errors on purpose.
5. **British vs. American spelling** in the ratified G4 crit-box opener. Flagged 2026-08-31.

---

## 7. "How We Know" — built, unregistered

`_prototypes/how-we-know/how-we-know.html` — single-file, Clinical Warm, light + dark.

Turns the `sourceSpan` gate into a critical-appraisal teaching object using **real** material:

- **The ledger.** 46 sources / 46 claims, and the direction split — 17 mixed, 14 positive,
  9 descriptive, 6 negative. Only 14 of 46 claims are cleanly positive. That distribution is the
  argument against reading abstracts, made with the library's own data.
- **Correction 1 — the paper with no number in it.** `modini-large-2026` is a *viewpoint* reporting
  no time-course statistic, cited for one at four call sites, worst of them a quiz answer. Students
  see Modini's actual words on reveal, then the Chung 2017 / Chung 2019 replacements. Includes why
  the automated check was blind to it: PubMed types it "Journal Article", and the claim carried no
  numeral, so neither trigger fired.
- **Correction 2 — right numbers, wrong sentence.** "The strongest evidence base of any single
  psychological intervention" sat beside Cochrane's own "hospital-based studies of limited quality"
  and "the true size of effect is likely to be less than demonstrated." Reveal shows the full span
  with those clauses bolded; the rewrite keeps the NNTs and restores n = 206 of 5,142, the caveat,
  and the 2010 search date.
- **The five rules**, including the one that does the most work: on a mismatch the *claim* changes,
  never the span.
- **A three-option exercise** on a Chung 2019 span, where the wrong answers are the two real failure
  modes — dropping the uncertainty, and adding an unlicensed superlative.

Gate-checked: no `localStorage`, no hard-coded crisis numbers, no dose literals, no external network
references, well-formed HTML.

**Deliberately NOT registered** in `site_manifest.json` or `build_deploy.py`. Registering it is a
scope decision — it involves publishing faculty error to learners on purpose, and it would trigger
the crisis-block scope question, since the page quotes post-discharge suicide rates. Reading those
rates in an appraisal exercise is not "doing risk work" under CLAUDE.md's scope rule, so a crisis
block is probably not required — but that is Josh's call to record, not an agent's to infer.
