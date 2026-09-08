# Autonomous queue runner — the runbook

Work the repository can prove is finishable gets finished nightly, without anyone scheduling it
by hand.

**The contract in one line:** the runner may only do work that a deterministic script performs
and a second command proves, and it may only ever open a **draft** pull request.

---

## 0. Where it runs, and why it moved

It runs as a GitHub Actions workflow: **`.github/workflows/maintenance-queue-runner.yml`**,
daily at 04:40 UTC, plus `workflow_dispatch` for a manual run. The whole decision procedure lives
in **`bin/run_queue_task.py`**, which is unit-tested by `tests/run-queue-task.test.mjs`.

It did not start there. The first version was a scheduled Claude session pointed at this file.
Its first firing (2026-09-08 04:08 UTC) reported **SUCCEEDED** and produced nothing at all — no
branch, no pull request — with 51 books of work still outstanding. The fired session had:

```
sources                 []     ← the repository was never cloned
mcp_servers             []     ← no GitHub tools
allowed_push_branches   []     ← no push target
```

Every step after "read the runbook" had nothing to act on, and even the degraded *push the branch
anyway* path was unreachable. A session that cannot see the repository also cannot notice that it
cannot see the repository, so no better prompt fixes this.

The fix follows from how autonomy is defined here. A task is eligible **only** because it carries
a deterministic `run` and a `verify` that can fail — which is exactly the property that makes a
model unnecessary to execute it. So the deterministic half moved to a runner that starts from a
checkout and holds a push credential, and the judgement half stayed with the human who reads the
draft. `create_trigger` exposes no `sources` parameter, so a Routine could not have been repaired
in place; this is not a workaround for that, it is the right shape.

---

## 1. What it may touch

```bash
python3 bin/what_can_i_do_today.py --next-autonomous
```

This prints **one** task as JSON, or **nothing**.

Nothing is the normal answer and it is a success, not a failure. The queue measures its own work
against the repository, so a task disappears the moment it is done. Empty output ends the run.

A task is offered only if it is `ready` in this environment *and* autonomous. Autonomy is
derived, never declared — `is_autonomous()` in `bin/what_can_i_do_today.py` requires the task to
carry both a `run` script that makes the change and a `verify` command that can fail. Anything
needing judgement therefore fails the test by construction:

| never autonomous | why |
|---|---|
| `coverage-unserved` | curation — what belongs in front of a learner is not mechanisable |
| `faculty-review` | an attestation is a person putting their name to a clinical page |
| anything network-gated | the environment decides, and the environment changes |

**Do not add `run`/`verify` to a task to make it eligible.** Widening the autonomy set is a
governance decision for Dr. Moss, and it belongs in a reviewed PR of its own.

Selection is never reimplemented. `run_queue_task.py` shells out to
`what_can_i_do_today.py --next-autonomous` rather than re-ranking the tasks itself: two rankings
that agree today and drift tomorrow would have the runner execute a task the queue did not offer.

---

## 2. The run, and the four guards

The workflow stands down before doing anything if **any** branch matching `automation/queue-*`
still has an open pull request. The branch name carries the date, so without that check an
unmerged draft would be duplicated every 24 hours — the task still measures as undone, because
the base branch does not yet carry the fix.

Then `bin/run_queue_task.py`:

1. Refuses a **dirty tree** or an `--out-dir` inside the checkout, so nothing unrelated — and no
   evidence file — can ride along in the commit.
2. Runs the task's own **`run`**. Never a hand edit: the diff must come from reviewable code,
   which is the entire reason the task qualified.
3. Runs the task's own **`verify`**. Non-zero ends the run.
4. Applies four guards, each with its own exit code so a red run names itself without the log:

| # | exit | refusal | the defect it exists for |
|---|---|---|---|
| G1 | 3 | the run changed no file | the queue offered work and produced an empty pull request |
| G2 | 4 | the count did not move (or cannot be measured) | the measurement does not track the work, so the task can never retire and the runner reopens the same PR forever — the `isbn-derive` defect, caught days before the first firing |
| G3 | 5 | a changed path is the attestation ledger, a clinical registry, Git-LFS media, or escapes the root | an unattended process editing a faculty signature |
| G4 | — | (reports, does not refuse) an attested page changed | an automated edit leaves the ledger byte-identical, so nothing else says the attestation went stale |

   G2 treats an **unmeasurable** task as a failure, never as a finished one. Zero means done, and
   reading a broken measurement as zero would retire real work silently.

   G4 reads `site_build/shipped_pages.json` — the one derived listing — not `site_manifest.json`.
   A page that ships from `cotw_registry.json` or `site_extras.py` is just as attestable, and
   reading a single producer is the exact defect ADR-002 exists to end.
5. Creates `automation/queue-<key>-<YYYY-MM-DD>` and **stages by name** — never `git add -A`,
   never `git add .`. Without git-lfs installed about 106 media files show as modified; that is
   the missing smudge filter, not a change, and committing the pointer stubs fails the deploy.

The workflow then runs the registry validators, the shipped-pages derivation check and the root
node suite, and only on a clean sweep pushes the branch and opens a **draft** pull request. It
never marks one ready, never merges, never approves, and never edits the attestation ledger.

---

## 3. What the pull request says

`render_pr_body()` composes it, so the provenance cannot be forgotten under time pressure. It
carries the task and the script that generated the diff, the `verify` a reviewer can re-run, the
measurement before and after, the files changed, and **any faculty attestation the change makes
stale**.

That last one is the one that would otherwise be missed. `13_Faculty_Resources/reviewed.json`
records `book_library.md` as `reviewed` by a named physician; an automated edit to that page
leaves the record byte-identical, so the page goes on asserting a human review of content a bot
wrote. `.claude/hooks/post_edit_validate.py` does detect exactly this — but it matches
`Edit|Write|MultiEdit` only, and these scripts write through Bash, **so the hook never fires
here**. The pull-request body is the only thing that can raise it.

The body also states plainly that GitHub does not start `ci.yml` on a pull request opened with
`GITHUB_TOKEN`. The workflow ran the validators and the node suite before pushing and the log is
the evidence, but a reviewer should know that the green checkmark they are used to is absent by
construction, not by luck.

**Never write provenance into the page itself.** A banner in the first eight lines matching
`pending.*review`, `pending.*attestation` or `AI-drafted` **hard-fails the build**. Provenance
belongs in the pull request; the page stays clean.

**Never edit `reviewed.json`.** The runner does not attest, un-attest, or re-date anything. Only
faculty do that.

---

## 4. When something goes wrong

The workflow is named `Maintenance — Autonomous Queue Runner` and is watched by
`.github/workflows/automation-failure-escalation.yml`, the deadman that upserts one rolling
marker-owned issue when a scheduled job goes red. A silently failing runner therefore surfaces
the same way every other steward here does, instead of going unnoticed for weeks.

A red run leaves the repository untouched: every guard fires **before** the commit. Read the exit
code first — it names which guard refused, and G2 in particular means *fix the measurement, not
the task*.

Because the workflow is enrolled in `validate_scheduled_workflows.py`, editing it means
recomputing its contract digest with the validator's own `_load`/`_contract_digest`. See
CLAUDE.md, "Adding a step to `ci.yml` trips three separate contracts".

---

## 5. Running it by hand

```bash
python3 bin/run_queue_task.py --dry-run                 # what would it pick?
python3 bin/run_queue_task.py --no-commit --out-dir /tmp/qr   # run and verify, stage nothing
```

`--no-commit` leaves the change in the working tree so you can read the diff before deciding.
`--out-dir` must be outside the checkout. The workflow itself can be started from the Actions tab
via `workflow_dispatch`.

---

## 6. Why this is the shape it is

Three sessions in a row picked a task, worked it for an hour, and only then discovered the
environment could not do it. `bin/probe_egress.py` answered *what can this machine reach*;
`bin/what_can_i_do_today.py` answered *what work does that enable, and how much is left*. This
runner is the third step: the queue stops being a report and starts being a worker.

It is deliberately the smallest possible version of that. One task is eligible today. Everything
that needs judgement is excluded by a rule rather than by a reviewer's memory, the refusals are
tested rather than described, and the only thing the runner can produce is a draft pull request
that a human still has to read.
