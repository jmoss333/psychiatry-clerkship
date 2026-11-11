# Decision delegation and the gate rule

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). Who decides what (Tier 0 always Josh; Tier 1 explicit go; Tier 2 the Friday batch; Tier 3 pre-approved by rule as a 30-day trial), how a recommendation must be evidenced before it reaches Josh, the re-ask rule, and the gate rule: every gate states the real property it checks and ships with a known-miss fixture that must fail it.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader. Everything on this page is `[judgment]` today — no check enforces it yet.

Approved by Josh on 2026-11-10: **F5-ADOPT** (decision delegation policy, as written) and
**F1-RULE** (gate rule). Effective 2026-11-10; Tier 3 is a 30-day trial, review 2026-12-10.
Source analysis: `~/Documents/F5_DECISION_DELEGATION_POLICY_2026-11-10.md` (section numbers
"§3", "§7" below refer to it) and `~/Documents/F1_VERIFICATION_GAP_MAP_2026-11-10.md`.
Rollout record and revert steps: `~/Documents/F5_F1_ROLLOUT_2026-11-10.md`.

### Standing rules — unchanged; nothing in this section loosens them — [judgment]
1. No merging, deploying, publishing, applying or removing labels, signing, settings changes,
   Netlify changes, or edits to crisis paths/data without Josh's own go.
2. Never start an expensive task on an ambiguous yes (definition and confirm phrase: R-14).
3. Crisis data is written only via the guarded writer (`promote_safety_corrections.py`).
4. No credential changes without an explicit go; PHI firewall and non-destructive data ops as
   stated elsewhere in this guide.
5. In this repo, crisis contacts live only in `crisis_resources.json` (invariant 7 in
   `CLAUDE.md`); any change to that file or to a page carrying `<!-- crisis-block -->` is T0.

### Where an existing rule is stricter, it wins (local overrides of the block below) — [judgment]
- **O-1 Labels.** T3-1's "add label stale-YYYY-MM" is NOT adopted: agents never add or remove
  any label, `stale-*` included. T3-1 is comment + close only (rollback `gh pr reopen N`).
- **O-2 Crisis paths.** No Tier 3 action (T3-1…T3-6) may create, edit or close a change that
  touches an R-1 path trigger (crisis*, aftercare*, protected_records*, withdrawn*, attest*,
  databases/**, netlify/**, …). Such work is prepared for Josh as T0/T1, never self-approved.
- **O-3 Merges.** Until Josh answers F5 §8 Q1, a Friday-packet "Go" does not authorize a merge.
  A merge needs Josh's own go naming the PR number (and head SHA); agents do not merge otherwise.
- **O-4 Settings.** Rulesets, branch protection, required checks, repo/Actions variables and
  secrets, Netlify, Cowork scheduled tasks and launchd jobs are always T1 and never part of a
  Tier 3 action or a Tier 2 bulk reply.
- **O-5 Missing infrastructure = refuse.** If the T3 audit-log directory (R-8) does not exist or
  is not writable, Tier 3 actions are refused (R-8), not improvised.

### Rule block (F5 §2, verbatim except the dates) — [judgment]
```
DECISION DELEGATION RULES — v0.1 (trial; effective 2026-11-10; review 2026-12-10)

R-1  CLASSIFY FIRST. Before asking Josh anything or acting, assign one tier:
     T0 Josh-always: clinical wording/labels/designations/crisis rulings/attestation/signing;
        merges; deploys; publishing; media; PHI-adjacent; external emails; research governance;
        anything a patient or learner can see.
     T1 Explicit-go: tokens, keys, Console/Netlify/DNS/env, budgets, repo vars/secrets,
        rulesets/required checks, public URLs, scheduled/launchd jobs that spend or write,
        any live paid API call, deleting settings.
     T2 Weekly batch: reversible, non-clinical, non-urgent, still needs a human call.
     T3 Pre-approved: only the actions in R-7, under their guardrails.
     Path triggers that force >= T1: databases/**, crisis*, aftercare*, protected_records*,
     withdrawn*, attest*, reviewed.json, netlify/**, netlify.toml, .github/workflows/* when it
     changes runs-on of a required check or a safety lane, rulesets, secrets, Cowork/launchd task
     definitions, tools-suite/** strings, topic_meta.json, *.pack.json.
R-2  TIE-BREAK: higher-risk tier wins. If unsure between tiers, pick the higher one and say why.
R-3  NEVER do at any tier without Josh's own go: merge, deploy, publish, label, sign, send,
     delete data, change a credential or Netlify setting, create/delete/enable a scheduled task,
     run a paid API job live, write crisis data outside promote_safety_corrections.py.
R-4  "Low-risk" is not a tier. If an action is not in R-7 it is not pre-approved, however small.
R-5  LABELS: never apply `clinical-reviewed`, `josh-approved`, `reviewed`, or any attestation
     label, and never recommend "label and merge" as one step. Present what the label would
     attest (what a patient/learner would see differently), then stop.
R-6  CRISIS SCOPE: "crisis" means crisis-in-function (lines, CSUs, mobile crisis, warm lines,
     DV/SA lines), not the `crisis` db key. Any claim "crisis unchanged" must state which
     definition was checked and name the designations-list status.
R-7  PRE-APPROVED ACTIONS (T3) and guardrails. Every action: check the kill switch
     (~/.cache/tier3/SUSPENDED absent), log to the audit file BEFORE acting, cap per day,
     never --force, never the primary checkout, never git stash.
     T3-1 CLOSE STALE DRAFT: PR is draft; author is an agent branch (codex/*, claude/*,
          jules/*, dependabot superseded) not Josh; last update > 14 d; title/labels/paths
          match none of: crisis, clinical, safety, withdraw, protected, warm-handoff,
          safety-plan, pg_suicide, attest, databases/, netlify/; not the base of another open
          PR; not listed in any Josh "keep" ruling. Action: add label stale-YYYY-MM, comment
          "Stale >14 d, reopenable: gh pr reopen N", close. NEVER --delete-branch. Cap 20/day.
          Rollback: gh pr reopen N.
     T3-2 REMOVE WORKTREE: not primary; git status --porcelain --untracked-files=all empty;
          every local commit present on origin (compare API) or bundled first to
          ~/Documents/Archive/Session-Artifacts-2026/<task>/bundles/ with `git bundle verify`
          OK; PR merged or closed; no file modified < 7 d; not locked (or lock reason read and
          recorded); no process cwd inside; salvage ignored non-rebuildable files to
          ~/Code/_archive/worktree-salvage-<date>/. Action: git worktree remove (no --force);
          never delete branches. Cap 10/day. Rollback: git worktree add <path> <branch>.
     T3-3 CI/CONFIG DRAFT PR: only advisory lanes; never required-check runs-on, never
          safety lanes (synthetic-monitor probe step, dead-man, crisis verification), never
          rulesets. Output is a DRAFT PR with rollback = revert commit. No merge, no ready.
     T3-4 DEPENDENCY PR PREP: rebase/update-branch Dependabot or agent bump PRs, run CI,
          report. No merge. Patch-level dev-only green bumps go to the T2 packet; anything
          runtime-scoped or clinical-path goes to T0.
     T3-5 CI HYGIENE: re-run a failed job at most once per head; cancel queued runs whose
          head is no longer the PR head. Never cancel a safety-lane run.
     T3-6 READ-ONLY WORK: verification, diagnosis, tests-only/docs-only draft PRs in fresh
          worktrees. A test-only PR may not weaken an assertion, add a skip/allowlist, or
          change --fail-on-flaky-tests; say so explicitly in the PR body.
R-8  AUDIT LOG (append-only JSONL, 0600):
     ~/Documents/Archive/Session-Artifacts-2026/tier3-audit/<YYYY-MM>.jsonl
     {"ts":ISO8601,"session":id,"model":name,"action":"T3-n","target":"<pr|path|run>",
      "preconditions":{"<check>":"VERIFIED|INFERRED|FAILED", ...},"evidence":["<cmd or url>"],
      "rollback":"<exact command>","salvage":"<path|none>","cap_used":"n/N",
      "kill_switch":"absent","result":"done|skipped|refused","reason":"..."}
     One line per target. Never edit or delete lines. A missing or unwritable log = refuse.
R-9  POST-HOC REPORT (weekly, <= 1 page, delivered with the T2 packet): counts by T3-n;
     list of targets with rollback commands; refused/skipped items and why; tripwire status;
     disk/queue effect; "what I did NOT check". No prose claims without the log line.
R-10 RE-ASK RULE: before presenting any ask, search the decision register. If decided:
     cite "DECIDED <id> <date>: <text>" and execute or hold per that decision; do not re-ask.
     Re-ask only with a block headed "NEW EVIDENCE:" naming what changed (new SHA, new
     finding, failed precondition). If pending: show it once per packet as one line
     "[id] <ask> — pending since <date> — default <no-op>"; after two packets, convert to
     "decide or drop" with the recommendation; never re-explain in full.
R-11 DECISION REGISTER: append one line per decision Josh makes, in the reply's own words:
     "D-YYYY-MM-DD-nn | <code> | <decision> | <source file> | <scope/conditions>".
     Conditions are part of the decision; if a precondition later fails, that is NEW EVIDENCE.
R-12 EVIDENCE STANDARD (§3) applies to every rec at every tier. A T0/T1 rec with any
     load-bearing INFERRED claim must say "NOT READY FOR DECISION" in its first line.
R-13 ESCALATION TRIGGERS (bump one tier, state the trigger): touches an R-1 path; conflicts
     with a register entry; irreversible step; any cost; any dependency on a bot review that
     has not finished on the exact head; a count or state that changed since the last ask;
     a public URL; a stacked PR; anything a learner or patient would see within 24 h.
R-14 AMBIGUOUS YES / EXPENSIVE TASKS: "expensive" = any paid API call > $1 per run or > $5
     cumulative per job-month, > 100 hosted CI minutes, any production deploy, any live run
     of a job marked disabled or dry-run-only, any credential rotation or deletion.
     Require the exact phrase `GO <CODE> <cap or target>` (e.g., `GO AC-PILOT-J2 LIVE $5`).
     "ok", "sounds good", "rec", "yes" to a multi-item message, or `ALL★` never satisfy this.
     T1 items must be excluded from every bulk reply string; list them separately.
R-15 BUNDLING: never bundle T0 clinical decisions into one checkbox. One line per clinical
     choice with old -> new text. Mechanical items may be grouped only if every member is
     T2/T3 and each is listed with its own rollback.
R-16 FACTS: numbers in recs come from the facts ledger or a cited command output; "about",
     "every", "nothing", "none" require the population and the instrument that could have
     found the exception.
R-17 KILL SWITCH: `touch ~/.cache/tier3/SUSPENDED` stops all T3 actions; any tripwire in §7
     creates it automatically and reports; only Josh removes it.
```

### Evidence standard (F5 §3) — every recommendation that reaches Josh carries this block — [judgment]
```
CLAIMS: each tagged VERIFIED (command/output/URL/SHA cited) or INFERRED (from what).
COUNT: numerator / denominator, with the denominator's definition and snapshot (SHA, time).
ROLLBACK: exact command or steps, or "IRREVERSIBLE" in caps.
BLAST RADIUS: who/what sees the change (patients, learners, CI, disk, a repo) and when.
COST: $, hosted minutes, runner minutes, Josh minutes.
PRIOR DECISIONS: register IDs this touches; "none" is a claim and must be VERIFIED by search.
WHAT WOULD CHANGE THE REC: the one observation that flips it.
NOT CHECKED: one line naming what was not verified (bot review pending, body not retrieved, etc.).
```
A rec is NOT READY FOR DECISION if a load-bearing claim is INFERRED, the denominator is
undefined, rollback is missing, or a bot review is still running on the head.
Tripwires T-1…T-10 (F5 §7) create `~/.cache/tier3/SUSPENDED`; only Josh removes it.
Decision register (R-10/R-11): `~/Documents/DECISION_REGISTER.md` (default from F5 §1).

### Gate rule (F1, adopted 2026-11-10) — [judgment]

```
GATE RULE — v1 (adopted 2026-11-10)

G-1  REAL PROPERTY. Every gate (CI job, workflow, check script, hook, validator, or test whose
     name says gate/guard/check/verify/required) states, in its file header and in a gate
     template entry (docs/GATE_TEMPLATE.md), the real property it checks: one sentence,
     phrased as a claim about the world ("no withdrawn number is callable from cache"), plus
     the predicate's inputs. Not the proxy it computes (count, label, substring, db key).
G-2  KNOWN-MISS TEST. Every gate ships with a known-miss fixture: a mutation built from a real
     past miss (or, for a new gate, the concrete failure it exists to stop) that the gate MUST
     fail on. CI runs it expecting red, or the PR body shows the red run. A gate that passes
     its own known-miss fixture is broken, whatever else is green.
G-3  NOT A GATE WITHOUT BOTH. Without G-1 and G-2 it is a report: name it "report"/"advisory",
     never call it required, never cite its green as evidence of the real property.
G-4  REQUIRED-NESS IS DECLARED. Each entry declares required: true|false; a job name or doc may
     not say "required"/"gate" if the declaration is false. Making a check required is a
     ruleset change = T1 (Josh's go).
G-5  IDENTITY OVER PROXY. A safety decision asserted on a count, label presence, substring or
     db key carries `# proxy: <why identity (SHA, hash, ID) is unavailable> (expires
     YYYY-MM-DD)`.
G-6  REPORT THE PROPERTY, NOT THE NAME. "X passed" is not evidence; write "X verified
     <property> at <SHA>; known-miss fixture <id> fails as expected".
G-7  Drafting a gate or its fixture is T3-3/T3-6 (draft PR only); merging it, making it
     required, or changing a safety lane stays with Josh.
```
