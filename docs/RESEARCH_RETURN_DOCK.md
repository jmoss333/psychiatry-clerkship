# The research-return dock — runbook

**Built 2026-09-10.** Companion to `13_Faculty_Resources/_automation/oe_scanner/EVIDENCE_INBOX_RUNBOOK.md`.
Short instruction card for Dr. Moss: `Evidence Inbox/_research-returns/README.md`.

## What problem this solves

A deep-research answer from OpenEvidence, ChatGPT or Claude arrives in a browser tab. It gets
skimmed, it informs two edits, and then it is gone. Six months later nobody can say why a page
says what it says, and the same question gets asked again.

The dock closes that loop. Every answer ends in one of exactly two states:

- **a curriculum change backed by a verbatim span from a primary paper**, or
- **a recorded decision not to use it.**

There is no third state, and the checker enforces that.

## What it is not

It is **not** a second evidence gate. `evidence_registry.json` + `evidence_annotations.json`
remain the gate; `validate_evidence_annotations.py` remains the validator. The dock is the step
*before* the gate — the one the Evidence Inbox runbook assumes has already happened when it says
"decide what kind of document this is."

It is **not** a third drop folder. Return documents live in `Evidence Inbox/_research-returns/`,
a subfolder of the existing inbox. `oe_scan.py` discovers candidates with `os.listdir` — not
recursive, and it skips directories — so the scanner never sees them and the two systems share
one folder without fighting. There are still two drop folders and one scanner.

## The pieces

| Path | What it is |
|---|---|
| `research_returns.json` | The registry: standing questions + every return + per-finding routing |
| `research_returns.schema.json` | Its schema, in the `decisions.json` / `instrument_rights.json` house shape |
| `bin/research-dock.py` | The only command. `status` · `check` · `new` · `--self-test` |
| `Evidence Inbox/_research-returns/` | The verbatim returns, one file each |
| `docs/_planning/DEEP_RESEARCH_PROMPTS_2026-09-10.md` | The prompts each question is asked with |
| `docs/_planning/DEEP_RESEARCH_AGENDA_2026-09-10.md` | Why each question exists and what it unblocks |

## The invariants the checker holds

These are the reason the dock is code and not a spreadsheet. `bin/research-dock.py check --strict`
exits non-zero on any of them.

1. **`sourceKind` is always `secondary`.** Hardcoded, not a field anyone chooses. A model
   synthesis licenses nothing on its own — the same rule the Evidence Inbox runbook applies to
   reviews, guidelines and OpenEvidence summaries. The dock makes it unwritable.
2. **`adopt` / `cite` / `supersedes` require `primary.citation` AND an independent identifier** —
   either a `pmid`/`doi`, **or** a custodian `url` + `retrievedAt` + `archivedCopy`. You may not
   cite the model. This is the invariant that would have caught the August 2026
   `modini-large-2026` failure, where a viewpoint was cited for a time-course statistic at four
   call sites including a quiz answer. See "Two kinds of primary" below for why the web variant
   exists and what it costs.
3. **`adopt` / `cite` / `supersedes` require `landedIn`** once the change is made — the page path
   or the `evidence_registry.json` source id. A finding marked adopted that never landed anywhere
   is a lie the registry can detect.
4. **`reject` / `no-action` require a note.** A rejection without a reason is indistinguishable
   from neglect, and it means the next person re-litigates it.
5. **`returnFile` must exist on disk, and must carry no invisible characters.** A registry row
   pointing at a missing answer is worse than no row — and a return full of private-use or
   zero-width characters is a trap in a repo that verifies verbatim spans. See "Invisible
   characters" below.
6. **A `triage` return older than `graceDays` (21) with unrouted findings is STALE**, and so is one
   with no findings at all. This is the anti-rot rule and the only one that fires on the passage
   of time.
7. **A `closed` return has zero `needs-primary` findings, a `closedOn`, and at least one finding.**
   A return that turned up nothing closes with one `no-action` finding saying so.

`needs-primary` is the only unfinished disposition. Everything else is a decision.

## Important: the returns are local-only, by design

`.gitignore` line 97 ignores `/Evidence Inbox/*` (all but its own `README.md`), the same way
`/OPENEVIDENCE RAW FILES TO REVIEW/` is ignored. So **return documents never leave this machine.**
That is right — they are unvetted third-party content, and some are long — but it has one hard
consequence:

**`bin/research-dock.py check` is a LOCAL gate, never a CI gate.** Invariant 5 (`returnFile` must
exist on disk) passes here and would fail in GitHub Actions, where the file was never checked in.
`bin/verify.sh` runs in the pre-push hook on this machine, so wiring it there works. Wiring it into
`ci.yml` would break the build.

## Where it runs

`bin/verify.sh` carries two steps, and they are the only place this tool is wired:

```
step "unit — research dock"                 python3 bin/research-dock.py --self-test
step "research return dock"                 python3 bin/research-dock.py check
```

The first step **blocks**; the second **reports**. That asymmetry is deliberate — see below.

verify.sh is the pre-push hook, so both run on every push, on the machine where the return files
actually exist. Not optional: `bin/check_vacuity.py` fails the run if a `--self-test` no gate
invokes ships at all, so the falsification and the wiring land together or not at all.

`ci.yml` stays untouched, and must. `bin/check-verify-coverage.py` maps ci.yml **onto** verify.sh —
every CI gate needs a local counterpart, never the reverse — so a verify.sh-only step is free there.
A step in `ci.yml` would instead fail invariant 5 on a file Actions cannot see, and trip three
contracts on the way: `check-verify-coverage.py`, `EXPECTED_STEP_INVENTORIES`, and
`EXPECTED_WORKFLOW_CONTRACT_DIGESTS`.

### Why `check` runs without `--strict`

The wiring landed at `check --strict` first, and was deliberately relaxed to report-only before the
branch shipped. The reasoning is a priority inversion, and it is worth stating plainly because the
strict form is otherwise the more principled-looking choice.

The pre-push hook is the **only** gate this repo has — CI is blocked at the account level, and the
hook says so in its own header. A blocking `check --strict` therefore means an undispositioned
research return can stop **any** push: a crisis-block correction, a high-safety attestation, an S4
remediation fix. Research-admin hygiene must never be able to hold a clinical correction hostage,
and no amount of documenting that hazard makes it acceptable when the alternative costs nothing.

So the dock reports STALE loudly on every push and blocks nothing. `--self-test` still blocks,
because it is a genuine falsification and `check_vacuity.py` requires it. This is the same posture
`bin/check_path_coverage.py` already takes — report-only by design, with `--strict` available for
deliberate use — and for the same reason: a low number is not a defect, an undecided item is, and
the two deserve different enforcement.

**Where the teeth belong instead:** `check --strict` in the scheduled maintenance/steward job, on
the same footing as the surveillance alarms, so a rotting return raises an issue rather than
blocking a push. That is the follow-up, and it is the only remaining one.

Either way, the way to clear a STALE line is to disposition the return — never `--no-verify`.

`research_returns.json` itself IS tracked — so the questions, the findings, the dispositions and the
primary-source citations are all in version control and reviewable in a PR. Only the raw answer
stays local. If a specific return ever needs to be shareable, copy it to a tracked path and point
`returnFile` there deliberately.

Note also that `docs/_planning/` is excluded in `.git/info/exclude`, so the prompts and agenda files
are local too. `promptRef` in the registry points at a path that exists on this machine only.

## Two kinds of primary

`adopt` / `cite` / `supersedes` need an artifact that exists **independently of the model**. There
are two shapes, and the checker accepts either:

| | Required fields | Why it is trustworthy |
|---|---|---|
| **Published source** | `citation` + `pmid` or `doi` | The identifier is stable and resolves forever |
| **Custodian web source** | `citation` + `url` + `retrievedAt` + `archivedCopy` | A dated local capture of what the page said |

The web variant was added after RQ-10, and not as a rights special case. Count what this project's
standing questions actually point at: ACGME Milestones and Program Requirements, the ABPN content
outline, AAMC Core EPAs, CLER Pathways, CMS Conditions of Participation, CSWE EPAS, APNA/ANA
competencies, INACSL simulation standards, instrument custodian permission pages. **None of them
carry a DOI.** Five or six of the ten standing questions have no DOI-bearing primary source at all.
A pmid-or-doi-only rule would have forced most of the agenda into `no-action` — a mis-calibration
produced by a journal-shaped mental model, surfaced by the first return that ran.

The web variant is not a loophole. A DOI is stable; a web sentence is not — the PHQ Screeners
permission is one sentence on one page that can change without notice. So the web variant demands
what a DOI gets for free: a read date and a dated capture, checked to exist on disk. In exchange it
is arguably *more* checkable than a DOI, because the capture records what the source said on the
day the claim was made.

`landedIn` for a web-sourced finding points where the change actually landed — commonly an
`instrument_rights.json` entry or a `decisions.json` id rather than an `evidence_registry.json`
source, since a rights or standards fact is governance, not evidence.

## Invisible characters

RQ-10's first return arrived carrying **378 invisible characters** — U+E200 x99, U+E201 x99,
U+E202 x180 — the private-use delimiters a deep-research tool wraps its citation markers in. They
render as nothing, they make `citeturn39view0` ungreppable as the string `citeturn`, and none of
the 56 unique citations they wrap resolve to anything.

In most repos that is cosmetic. Here it is a live hazard: `bin/verify_spans.py` checks
`sourceSpan` text character-for-character against the paper. A span copied out of an uncleaned
return would carry an invisible character, match nothing, and give no visible reason why.

So `check` counts them and reports; `python3 bin/research-dock.py clean <return-id>` strips them
in place and prints exactly what it removed, by codepoint. The visible text is never altered.
Run it on every return before quoting anything out of it.

## Procedure

### 1 · Ask
Copy the prompt from `DEEP_RESEARCH_PROMPTS_2026-09-10.md` into the tool that prompt routes to.
Then `python3 bin/research-dock.py new RQ-n`. This creates the return record, stamps the question
`asked`, and writes an empty return file with a header.

### 2 · Save verbatim
Paste the complete answer into the created file. Unedited. Its evidentiary value is that it is
what the tool actually said — including where it was wrong, which matters if we ever publish
about this method.

### 3 · Triage
An agent reads the return and proposes findings; Dr. Moss decides. Each finding is one sentence
of claim plus a disposition. Draft everything as `needs-primary` first and promote only what
survives a look at the actual paper — never the other way round.

The classification fork from the Evidence Inbox runbook §2 still governs what the *primary* paper
can license: primary licenses its own results; secondary licenses nothing; a viewpoint licenses
only its own argument, attributed as an argument, never a number.

### 4 · Land it
For every `adopt` / `cite` / `supersedes`, follow `EVIDENCE_INBOX_RUNBOOK.md` step 5 unchanged —
registry entry, annotation with a verbatim `sourceSpan` from the primary paper's results retrieved
from PubMed/Europe PMC, page edit in the same change, then
`validate_evidence_annotations.py` and `bin/verify.sh`. Record where it landed in `landedIn`.

New registry sources ship `facultyReviewStatus: pending`. If the page edit lands before
re-attestation, tag the page's review-status line as the runbook requires.

### 5 · Close
When no finding is `needs-primary`, set `status: closed` and `closedOn`. Set the question's status
to `answered` — or leave it `open` if the return did not actually answer it, which is a legitimate
and informative outcome.

## Two habits worth more than the tooling

**Run the high-stakes questions on two tools and compare.** Disagreement between two independent
returns is the cheapest available signal that a question is genuinely unsettled rather than merely
unfamiliar. Log both as separate returns against the same question id — the registry supports it,
and the disagreement itself is a finding.

**Never let an agent promote a finding past `needs-primary` on its own.** The agent that read the
return is the worst-placed reader to judge whether the return is right. Promotion is a human step
with the actual paper open.

## Follow-ups, deliberately not done in this change

- **Register as a root registry.** `validate_registry_schemas.py` needs the pair added to its pairs
  tuple *and* `test_validate_registry_schemas.py` needs it in `PAIRS` — miss the second and the
  maintenance tests go red. Not done here because it edits shared files that carry other sessions'
  in-flight work.
- **A `decisions.json` entry.** The "a model synthesis is always secondary, and an adopted finding
  must carry a primary pmid/doi" rule is a standing decision governing `bin/research-dock.py`. It
  should be registered with a `DECISION:` marker so `check_decision_drift.py` can hold it.
