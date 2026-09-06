# Autonomous queue runner — the runbook

A scheduled Claude session follows this file, nightly. It exists so that work the repository
can prove is finishable gets finished without anyone scheduling it by hand.

**The contract in one line:** the runner may only do work that a deterministic script performs
and a second command proves, and it may only ever open a **draft** pull request.

This file is the whole instruction set. The Routine's prompt says "read
`13_Faculty_Resources/_automation/AUTONOMOUS_QUEUE_RUNNER.md` and follow it", so the guardrails
live in version control where they can be reviewed and changed like anything else — not buried
in a scheduled trigger nobody can see.

---

## 1. What it may touch

```bash
python3 bin/what_can_i_do_today.py --next-autonomous
```

This prints **one** task as JSON, or **nothing**.

Nothing is the normal answer and it is a success, not a failure. The queue measures its own work
against the repository, so a task disappears the moment it is done. **If the output is empty:
stop. Do not look for something else to do. Do not report anything. End the session.**

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

---

## 2. The run

1. **Start from a fresh base.** `git fetch origin main && git checkout -B claude/auto-<key>-<date> origin/main`.
   A new branch per run: last night's branch may still be open and unmerged.
2. **Stop if the work is already proposed.** Check for an open PR whose branch starts with
   `claude/auto-<key>-`. If one exists, end the session — the previous night's proposal is still
   waiting on a human, and a second copy helps nobody.
3. **Run the task's own `run` command.** Never hand-edit the files it owns. The diff must come
   from reviewable code, which is the entire reason this task qualified.
4. **Run the task's own `verify` command.** Non-zero means stop and change nothing further.
5. **Run what CI runs**, and do not push unless all of it is clean:
   ```bash
   node --test tests/*.test.mjs
   python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
   python3 13_Faculty_Resources/_automation/validate_topic_meta.py
   python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
   python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check
   diff -q CLAUDE.md AGENTS.md
   ```
6. **Confirm the task retired.** Re-run `--next-autonomous`. It must now print nothing for this
   task. If it still offers the same task, the measurement does not track the work — **stop, push
   nothing, and open an issue instead.** That exact defect shipped once: the task was measured by
   a number the work could not move, and the runner would have opened an empty pull request every
   night for the rest of time.
7. **Stage by name.** `git add <the specific files>` — **never `git add -A`, never `git add .`**.
   Without git-lfs installed, about 106 media files show as modified; they are the missing smudge
   filter, not a change, and committing the pointer stubs fails the deploy.
   `.claude/hooks/lfs_guard.py` denies bulk staging, but do not rely on a hook to save you.
8. **Push and open a DRAFT pull request.** Never mark it ready. Never merge. Never approve.

   **If your session has no GitHub PR tool**, push the branch anyway and say so. A scheduled
   session may fire without connectors, in which case `git push` still works — the credentials
   are environment-level — but `mcp__github__*` is absent. A pushed branch is still a visible,
   reviewable artifact and GitHub offers a "Compare & pull request" banner on it. What is not
   acceptable is leaving finished work only on disk in a container that is about to be reclaimed.
   Push, then report the branch name and the one-line command a human needs to open the PR.

---

## 3. What the pull request must say

The body is the only place the provenance can live, and it **must** carry all of:

- that a scheduled runner produced it, and which script generated the diff;
- the `verify` command a reviewer can run to check every line mechanically;
- **any faculty attestation the change makes stale.**

That last one is not optional and is easy to miss. `13_Faculty_Resources/reviewed.json` records
`book_library.md` as `reviewed` by a named physician. An automated edit to that page leaves the
record byte-identical, so the page goes on asserting a human review of content a bot wrote.
`.claude/hooks/post_edit_validate.py` does detect exactly this — but it matches `Edit|Write|
MultiEdit` only, and these scripts write through Bash, **so the hook never fires here**. The
runner is the only thing that can raise it, and it raises it in the PR body.

Say it plainly, for example:

> `book_library.md` is recorded as reviewed by Joshua Moss, MD on 2026-07-03. This change edits
> that page, so the attestation is now stale and needs re-attesting in the faculty console.

**Never write provenance into the page itself.** A banner in the first eight lines matching
`pending.*review`, `pending.*attestation` or `AI-drafted` **hard-fails the build**. Provenance
belongs in the PR; the page stays clean.

**Never edit `reviewed.json`.** The runner does not attest, un-attest, or re-date anything. Only
faculty do that.

---

## 4. When something goes wrong

Follow the house pattern rather than inventing a channel: automation here reports failure by
upserting one rolling, marker-owned issue, never by closing anything
(`13_Faculty_Resources/_automation/maintenance/maintenance_issue.py`). If the runner cannot
complete cleanly, it leaves the repository untouched and says so in one issue.

A red CI on a branch the runner pushed is the runner's to fix on its next wake, under the same
rules — it may not widen the change to get green, and it may never skip or disable a test.

---

## 5. Why this is the shape it is

Three sessions in a row picked a task, worked it for an hour, and only then discovered the
environment could not do it. `bin/probe_egress.py` answered *what can this machine reach*;
`bin/what_can_i_do_today.py` answered *what work does that enable, and how much is left*. This
runner is the third step: the queue stops being a report and starts being a worker.

It is deliberately the smallest possible version of that. One task is eligible today. Everything
that needs judgement is excluded by a rule rather than by a reviewer's memory, and the only thing
the runner can produce is a draft PR that a human still has to read.
