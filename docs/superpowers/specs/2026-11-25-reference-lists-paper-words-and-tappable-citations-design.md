# Reference lists: the paper's own words, citations you can tap, and a changed-page notice

2026-11-25 · status: built, awaiting owner review (draft PR) · audience: both learner sites

## Why

Josh asked for 2–3 features that make the library a more polished clinical education tool. A
read of the repo, its gates and the 42 open PRs ranked eight candidates; these two scored highest
on learner value against effort, and both are code over data the library already verifies, so
neither adds teaching text that needs faculty sign-off.

| Rank | Idea | Verdict |
|---|---|---|
| 1 | Verified source excerpt under each reference ("In the paper's own words") | **Built** |
| 2 | Tappable `[n]` citations plus a reference-integrity test | **Built** |
| 3 | "Updated since you last opened it" notice for pages corrected mid-rotation | **Built** (author-set `content-updated` marker, revised 2026-11-25; device-only; no progress-store change) |
| 4 | `<abbr>` expansions for abbreviations | Deferred: only 52 in-text definitions; the frequent ones (CBC, PE, ED) are undefined or ambiguous, so it needs a faculty-reviewed registry |
| 5 | Sign-off triage ranker (risk × exposure × changed words) | The console's change-history view covers most of it |
| 6 | Citation-cache refresh date that stops conflicting on every PR | Developer ergonomics, not learner-facing |
| 7 | Learner glossary page | New teaching content; needs review |
| 8 | Colour-contrast audit | `theme_audit.js` and `contrast-check.mjs` already exist |

## Feature 1 — "In the paper's own words"

**Problem.** A reference names the paper; on a phone between patients nobody opens it. Every
source in `evidence_annotations.json` already holds a verbatim span the evidence gate checks the
library's claims against, but learners only see those spans on the How We Know page.

**Design.** `site_build/evidence_excerpts.py` projects the annotations into
`evidence_excerpts.json` (spans, span kind, date checked; lookups by PMID and DOI). A source with
no span, or an identifier two sources claim, is left out rather than guessed. The build writes it
next to `evidence_registry.json`; the resident build inherits it and the service worker precaches
it. `frontdoor/fd_ref_evidence.js` finds each list item on a reading that cites a known PMID or
DOI and appends a collapsed `<details>`: the span, labelled as the paper's words, with the date it
was checked. It never shows the library's `claimText`. A list item citing two different sources
gets nothing. The index is fetched once, only on a page that cites something; offline or failed,
the page renders as before.

**Acceptance (machine-checked, `tests/fd-ref-evidence.test.mjs`).**
- Identifier parsing: PubMed and doi.org links, `PMID:` text, bare DOIs, trailing punctuation.
- Ambiguity yields nothing; inherited object keys never match.
- Output is escaped, collapsed by default, labelled and dated.
- The index carries spans verbatim and no claim text except a claim that quotes its own span.
- Corpus floor: ≥120 citations on ≥25 shipped pages resolve, each to the paper the line cites
  (measured 2026-11-25: 160+ on 30+).
- Both render paths (learner reader and faculty preview) mount it; the build writes the index.

## Feature 2 — tappable citations and reference integrity

**Problem.** Case pages cite `[2,4]`; on a phone the learner scrolls the whole case to find
reference 4 and loses their place. Nothing checked that `[n]` names an entry that exists. And one
MS3 case keeps its Resident twin's numbering for the subset it cites (1, 2, 4, 5): markdown renders
any ordered list as 1..N, so learners saw "3." beside the paper the text cites as `[4]`.

**Design.** `fdRefCiteMarkup(html, markdown)` reads the numbers the author wrote on the closing
reference list, ids each rendered entry `fd-ref-N` (adding `value="N"` where markdown would show a
different number), and turns each bracketed number above the heading that names an entry into an
inline `<button class="fd-cite">`. Text inside links, code, headings and buttons is never touched,
nor anything after the heading. A page whose written and rendered lists disagree is left exactly
as it was. A tap opens a collapsed section if needed, scrolls the entry to the middle of the screen
and focuses it.

**Acceptance (machine-checked, `tests/reference-citations.test.mjs` + unit tests).**
- Every shipped reading's reference list starts at 1 and rises with no repeat.
- Every in-text `[n]` names an entry the list has.
- Entries the text never cites are frozen in a shrink-only allowlist (4 pages on 2026-11-25).
- In the reader, ≥90 % of source citations become buttons on every cited page, entry ids follow
  the author's numbers, and the library carries ≥500 tappable citations.

## Feature 3 — "Updated since you last opened it"

**Problem.** Pages change mid-rotation, and some changes are corrections (2026-11-24: a Case of the
Week question taught the wrong dialysis threshold for lithium and was rewritten after learners had
read it). A learner who marked the page read never returns to find out.

**Design (revised 2026-11-25, after release).** The first version fingerprinted each reading's whole
text, so every typo fix re-prompted every learner who had marked the page read. A notice that fires
on copy edits teaches learners to ignore the one that matters, and only the author knows which edit
matters. So the author marks it:

    <!-- content-updated: 2026-11-24 -->

An HTML comment anywhere in the page source (invisible in the reader), at most one per page, set to
the day of the change. **Set it** for a change a learner who already read the page should come back
for: a corrected number, threshold or dose; a changed recommendation or answer; a new or removed
safety step. **Leave it** for a typo, a re-wrap, a link repair, a citation renumber or a new
reference. When unsure, set it: a needless notice costs a skim, a missed correction costs a wrong
answer on the wards.

`frontdoor/fd_page_changed.js` stores, per reading, the marker it last saw and the day it was last
opened (`cw_page_seen_v1`, ref → `{v, at}`, capped at 400 pages, oldest dropped). When a page the
learner marked read (`cw_progress_v1`, read only) opens with a marker that differs from the one the
device last saw on it, one status line goes under its title: "This page was updated on {marked day},
after you last opened it on {last open}. You marked it read, so skim it again for what changed." It
shows once; the next open is silent. Only the marker decides, never its date against the open date:
the author's date is not the day the change reached learners (the release train or a delayed merge
can ship an 11-24 correction on 11-26), so a learner who read the old page in between is still told
(Codex review on #1312). The accepted cost: a marker added after the fact, for a change the learner
already read, prompts one needless skim. Rows the first version wrote (`{h, at}`) are read as "no
marker seen", so a page that gains its first marker notifies every learner who marked it read
before, and an unmarked page never notifies. It never writes canonical progress, never sends anything, and never runs in the
faculty preview. "Erase everything" clears it with every other `cw_` key. Storage that throws or
holds junk yields no notice, never an error, and a row that cannot be saved shows no notice (it
would otherwise repeat forever).

**Limits.** The notice says *that* the page changed, not *what* changed. An author who forgets the
marker leaves a correction silent; the marker is the author's (and the reviewing faculty's) call,
and nothing can infer it from the diff, because a one-character edit can be a typo or a dialysis
threshold. A misspelt marker or an impossible date is caught at PR time.

**Acceptance.** `tests/fd-page-changed.test.mjs`: the parser reads only the marker (a typo or an
unmarked edit is no change, a calendar-invalid date is none); first visit is a silent baseline;
notice once, then silence, then again for the next marked update; never for a page not marked read;
a correction shipped after its marked day still notifies; first-version rows migrate; junk and blocked storage never throw or
notify; the store caps at 400; wired into the learner reader for readings only.
`tests/content-updated-marker.test.mjs`: on every shipped reading source, anything that looks like
the marker is the marker, real-dated, at most one, and the reader's parser reads the same date.

## Human review gates

- No teaching text changed; no page drifts from its signature (no curriculum source edited).
- Owner review of the draft PR, and the deploy previews, before merge. Merging is the owner's call.
