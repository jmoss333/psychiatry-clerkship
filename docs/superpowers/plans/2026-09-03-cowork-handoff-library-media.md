# Handoff — Library Media Work (for a Claude Cowork session)

**Written:** 2026-09-03 · **By:** the Claude Code session that shipped PR #478
**Read this first.** It is written for an agent starting cold, in a different environment,
with none of the prior conversation. Everything you need to resume is here or linked from here.

**Recommended model: Claude Opus 5 (`claude-opus-5`) at `high`–`xhigh` effort.** Reasoning in §7.

---

## 1. Where things stand

PR **#478 is merged** to `main`. Three files shipped, none of them learner-facing:

| File | What it is |
|---|---|
| `docs/superpowers/plans/2026-09-03-library-gap-scan-podcasts-books-audiobooks.md` | the gap scan + candidate slate |
| `docs/superpowers/plans/2026-09-03-pairings-registry-implementation-plan.md` | implementation plan for the pairings registry |
| `13_Faculty_Resources/_automation/library_coverage_scan.py` | report-only coverage scanner |

**Nothing student-facing changed.** No content page, no `site_manifest.json` entry, no nav item.
Both are proposals awaiting Dr. Moss's decisions.

Read both documents before doing anything. This handoff does not restate their content.

---

## 2. The one decision that gates everything

**Does a pairing block belong on the six weekly pages at all — and if so, at what density?**

A rendered preview was produced on the real Week 5 page, switchable between
**off / one-line / full internal-only / full with-external**:
<https://claude.ai/code/artifact/6887eb56-ec46-431e-b56e-31ced3c7f232>

The prior session's recommendation was **"full — internal only"**. Until Dr. Moss answers, do
not build pairings P0/P1. Ask once, plainly, and wait — this is a curricular judgement about
what every learner sees weekly, not an engineering call.

---

## 3. What the scan actually found (headline, corrected)

The first version of the scan was **wrong** and Codex caught it. It looked at only the podcast
and book pages and declared the acute inpatient spine an audio desert. It is not: `12_Media/audio_oe/`
ships **50 landmark briefs** covering delirium, catatonia, lithium, clozapine, ECT, metabolic
monitoring and suicide.

Corrected, over all three surfaces:

- **6 topics have nothing anywhere** — agitation/restraint, medical workup, consult-liaison,
  documentation/oral presentation, case formulation, discharge/disposition.
- **23 of 25 scanned topics have no book.**
- **The gap is books, plus the missing join** between audio that already ships and the topic
  pages that need it. A student on `delirium.md` is never told a 1:47 HELP-trial brief exists.

Regenerate any time: `python3 13_Faculty_Resources/_automation/library_coverage_scan.py`
(`--json` for machine-readable). It is report-only and gates nothing.

**Carry the lesson, not just the number:** if you extend the scan, extend it over *shipped
surfaces*, and re-run it rather than quoting this table from memory.

---

## 4. Environment constraints that will bite you

These cost the prior session real time. Check which apply to yours before planning work.

| Constraint | How it shows up | What to do |
|---|---|---|
| **Egress blocked except web search** | `WebFetch` and `curl` return `EGRESS_BLOCKED` / `CONNECT tunnel failed, 403` on every domain — Apple Podcasts, Spotify, publishers, Wikipedia, OpenLibrary | **Test this first.** If your environment *can* fetch, the highest-value unblocked task is the link check (§5.2). If it cannot, say so rather than pretending the slate is verified. |
| **`git-lfs` absent** | All ~106 media files show as modified; `build_and_check.sh` fails at `lfs-media: ERROR — 105 pointer stub(s)` | Trap 1 in `.claude/skills/clerkship-deploy`. **Never stage or checkout-restore them.** A local build failing *only* at that gate is a sandbox artifact, not a defect — the assembler ran fine. |
| **Workflow/subagent path broken** | Schema-bearing agents die on `StructuredOutput retry cap (5) exceeded`; subagent tool calls rejected with `permission handler returned updatedInput ... required parameter missing` | The prior session lost 10 of 12 agents this way and redid everything in the main loop. **Try one small delegated call before planning a fan-out.** If it fails, work solo; it is not worth debugging. |
| **Netlify MCP is wrong-account** | 404s both clerkship sites | Trap 3 in the same skill. You cannot re-run a Netlify deploy from an agent session. |

---

## 5. Work queue, in priority order

### 5.1 — Upstream DB diff *(blocked here; needs machine access)*

The ReConnect pools are **~6–10× larger than what shipped**: 481 podcast records across ~51
shows vs. one show; 345 book titles vs. 51. Those DBs are **not in this repo**.

Diff the candidate slate against them **before approving any external candidate**. A meaningful
share of what the scan calls "missing" may already be curated and merely unshipped. This is
cheaper than more discovery and will change the slate.

*Acceptance:* a list of slate items that already exist upstream, and the genuinely new remainder.

### 5.2 — Link check the slate *(blocked here; needs egress)*

**No external URL in the gap scan was ever opened.** Every link, ISBN, edition, narrator and
runtime is search-attested only. The doc marks this in §0.2 and makes the click-through a
gating step, not a nicety.

Pair it with fixing the **7 unresolved "▶ search channel"** links already on the podcast page.

*Acceptance:* a CSV mirroring `13_Faculty_Resources/Handoffs/podcasts_handoff.csv` with a
`verified_date` column; every tier-1/tier-2 item either confirmed or struck.

### 5.3 — Pairings P0/P1 *(unblocked, but gated on §2)*

Uses **only internal assets** — topic pages, tools, and the 50 `audio_oe` briefs — so it needs
no link verification and carries no verification debt. This is the only substantial piece an
egress-blocked session can actually finish.

Follow the plan exactly; it was corrected under review and three of its original claims were wrong:

- **Audience scoping is not free.** `resident_section.py:20` is `shutil.copytree(MS3, OUT)` —
  the resident site is a copy of the *built* MS3 site. Since injection consumes the marker, a
  naive audience-scoped registry ships MS3's block to residents. Two passes are required;
  `crisis_block` already does this (`resident_section.py` ~lines 77–95). **P1 ships one pairing
  set for both audiences.**
- **P0 must seed all six weeks**, or its own gates reject it.
- **The renderer test needs real CI wiring.** Nothing globs `site_build/test_*.py`; `ci.yml` and
  `verify.sh` each name exactly two tests. That means a `ci.yml` step, a `verify.sh` mirror, and
  a recomputed workflow digest — the one place this work pays the three-contract cost.

*Acceptance:* both sites build; block renders on all six week pages on both; build is
byte-reproducible; the six smoke baselines regenerate via the workflow_dispatch, not locally.

### 5.4 — Two structural repairs *(no new content needed)*

- Add `isbn13` to book entries — currently **51 of 51 links are Amazon `/dp/`, zero ISBNs**, so
  no entry is edition-identifiable or library-findable.
- Add an RSS/Apple canonical beside each YouTube link on the podcast page.

Both need lookup access, so they inherit §5.2's blocker.

---

## 6. Repo rules that are easy to violate

`CLAUDE.md` is canonical (`AGENTS.md` is a byte-identical copy — `cp CLAUDE.md AGENTS.md` after
editing, CI fails on divergence). The ones this work touches:

- **The library teaches administration; it never reproduces instruments.** A "pocket compendium
  of rating scales" is an attractive trainee-shelf candidate and is exactly what the rule
  forbids. Scope is a governance decision — **stop and ask**, never infer an exemption.
- **Crisis contacts live only in `crisis_resources.json`.** Never propose a resource whose value
  is a list of crisis numbers.
- **Registering a new page** requires `site_manifest.json` **and** a nav entry in
  `build_deploy.py`, or the QA gate's orphaned-source check hard-fails the build.
- **A red node test silently aborts the build.** `build_and_check.sh` is `set -euo pipefail` and
  runs `node --test tests/*.test.mjs` *before* `build_deploy.py` — `_build/` then serves stale
  output while the script merely looks "failed". If an edit isn't showing up, run the node suite first.
- **Everything is suggested, not required.** No PHI. Educational framing throughout.

**Before pushing**, run what CI runs:

```bash
node --test tests/*.test.mjs
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
diff -q CLAUDE.md AGENTS.md
```

Note: the node suite reports **two false failures** until `pip install -r requirements.txt` —
the draft-7 contract test and the `post_edit_validate` hook test both need `jsonschema`. That is
the sandbox, not a regression.

---

## 7. Which model to use, and why

**Use Claude Opus 5 (`claude-opus-5`).** 1M context, $5/$25 per MTok.

This work is a poor fit for a cheaper tier, for reasons specific to it:

- **The repo punishes shallow reads.** The three errors Codex caught were all *plausible* — they
  came from reasoning about the build pipeline without reading `resident_section.py`, `ci.yml`
  and `verify.sh` line by line. The `copytree` finding in particular would have shipped wrong
  content to residents. That is exactly the failure mode a stronger model avoids.
- **Governance contracts are interlocking and silent.** Adding one `ci.yml` step trips three
  separate pinned contracts. Getting that wrong fails the build in a way whose error message
  does not name the cause.
- **Context is genuinely large.** `topic_meta.json` is ~265 KB, `question_bank.json` ~600 KB,
  `evidence_registry.json` ~305 KB, and the build pipeline spans several files that must be held
  together at once. The 1M window matters here.

**Effort:** `high` for ordinary edits, **`xhigh` for the pairings implementation** — it is the
recommended setting for coding and agentic work, and this task spans build wiring, a new
registry, a semantic validator and CI contracts simultaneously. Reserve `max` for a
correctness-critical pass where cost genuinely doesn't matter.

**Where a cheaper model does fit:** if you fan out the §5.2 link check across many URLs, the
per-URL "open this page, confirm title/edition/ISBN, report" step is mechanical and well suited
to **Claude Haiku 4.5** workers, with Opus 5 doing the judging and the writing. Do not use a
cheaper model for the pairings build or for any judgement about what belongs in front of learners.

**Not Fable 5.1** unless Dr. Moss asks for it. It is the more capable model and would do this
well, but at $10/$50 it costs double, and nothing here is at the frontier of difficulty — the
hard parts are *care and repo-specific reading*, which Opus 5 at `xhigh` covers.

---

## 8. What not to do

- **Don't re-run the discovery sweep.** It is done and committed. The unfinished work is
  *verification* (§5.2) and *diffing against upstream* (§5.1), not more searching.
- **Don't ship external candidates before the link check.** The whole slate is unverified.
- **Don't quote the old "no audio" finding.** It was retracted; the doc carries the correction.
- **Don't add a rating-scale compendium** or any instrument reproduction (§6).
- **Don't build pairings before §2 is answered.**
- **Don't chase a fast-moving `main`.** It advanced three times in one afternoon. Merge it in
  when you are actually about to land, not on every advance.

---

*Joshua Moss, MD | Psychiatry Clerkship Library. Handoff prepared 2026-09-03.
Educational; no PHI; no instrument text; no crisis contacts outside `crisis_resources.json`.*
