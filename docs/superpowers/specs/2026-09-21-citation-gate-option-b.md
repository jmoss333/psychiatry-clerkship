# Citation gate — Option B, search and judge against NCBI

**Status: implemented, not wired in.** `bin/verify_citations.py` is on disk and green;
it is deliberately absent from `bin/verify.sh` and `.github/workflows/ci.yml`. Adding a
CI step trips three to five separate pin contracts (see `CLAUDE.md`), so that is its own
PR and its own decision about what exit 2 should mean there.

Supersedes the open question in PR #694, which stays as the design record. #694's
`bin/check_citation_attribution.py` is the ancestor of this tool — its defect taxonomy,
its fail-closed cache principle, its `containers_agree` tolerance and its
"print the claimed and the resolved value side by side" rule are all carried over.
#694's `bin/check_policy_content_separation.py` is superseded by
`bin/check_governance_separation.py`, which shipped in #698; nothing was taken from it.

---

## 1. The ruling

Joshua Moss, MD, 2026-09-21:

> **Option B: search-and-judge against NCBI.** A citation is NOT failed merely for
> lacking a DOI or PMID.
>
> 1. **Cache the verdict** — matched PMID, score, resolution date — and re-search only
>    changed or uncached citations, so B is deterministic per commit.
> 2. **Calibrate the confidence floor** against the identifier-carrying references as
>    positives and #672's fabrications as negatives.
> 3. **Record the decision in `decisions.json` after #718 merges**, under schema v2.

And, on the one thing #694 left open, the same day:

> `matched` passes. `ambiguous` **passes and files a finding for faculty adjudication**.
> `mismatch` **hard-fails** — the gate's teeth live there. `unavailable` (the search
> could not run) is exit 2, could-not-check, does not block, and must never be reported
> as clean or collapsed into `ambiguous`.
>
> The gate's teeth belong on findings, not on uncertainty: 23 legacy references
> legitimately carry no identifier, so `ambiguous` will be common, and blocking there
> would hand a non-deterministic external service a veto over the merge queue — the
> #642 decay pattern ("a verdict that fires on every PR is not a verdict").

Option A (require an identifier) was rejected as the primary behaviour. It survives only
as `--require-identifier`, off by default, and the tool's `--help` says it is not the
ruled behaviour.

**Still owed:** ruling note 3. `decisions.json` is untouched by this change; the record
goes in after #718 merges under schema v2.

---

## 2. What the tool does

`bin/verify_citations.py`, one citation at a time:

| | | |
|---|---|---|
| **matched** | the resolved record agrees on every field the citation claims | pass |
| **mismatch** | the resolved record **contradicts** the claimed title, first author, year or journal | **fail** |
| **ambiguous** | the search ran and could not decide | `AMBIGUOUS_POLICY` (ruled: `report`) |
| **unavailable** | the search **could not run** — not a verdict | exit 2, never clean |

Exit 0 every citation examined and none contradicted · 1 at least one `mismatch` · 2
could not check. There is no exit code that means "did not look".

### 2.1 The verdict is per field, not by composite

The first cut scored each citation as a weighted mean of title, author, year and journal
agreement and failed below a floor. That cannot work, and the reason is the dominant
#672 defect itself: a citation right about everything except the journal scores

    0.45x1.00 + 0.20x1.00 + 0.15x1.00 + 0.20x0.00 = 0.80

so any floor low enough to spare real citations also waves that one through. **A
contradiction in one hard field is a contradiction.** The composite survives only as a
reported number and as the ranking used to pick the best search candidate.

### 2.2 Anchored versus searched

* **Anchored** — the citation carries a PMID, or a DOI that resolves to exactly one
  PubMed record. The record *is* the one being claimed, so any contradicted field is a
  mismatch. This is the shape the ruling names: a real, resolvable identifier paired with
  an invented title.
* **Searched, titled** — no usable identifier, but a title. If the best candidate's title
  is below the identity floor, PubMed cannot be said to hold this paper either way:
  `ambiguous`. At or above it, we have found the paper, and a disagreement in year,
  journal or first author is a mismatch. (Marcantonio's NEJM delirium review cited to
  2011 when it is 2017.)
* **Searched, untitled** — the #640/#672 bullet shape: author, year, journal, prose. The
  discriminator is the audit's own: does PubMed hold **any** record by that author in
  year +/- 1, and is any of them in the journal claimed?
  * no record by that author in the window -> `ambiguous` (a book, a guideline, or an
    author PubMed does not index);
  * a record by that author in that journal in that window -> `matched`;
  * every one of the author's in-window records examined and none in that journal ->
    **mismatch**;
  * more records than `AUTHOR_WINDOW_CAP` -> `ambiguous`, naming how many of how many
    were examined. A contradiction is never claimed over a set the tool did not open.

  The journal comparison is done **locally**, against the records themselves, not by
  asking PubMed for `"<journal>"[Journal]`. That query is an exact match against NLM's
  journal table and answered zero for "New England Journal of Medicine", "Cochrane
  Database of Systematic Reviews" and "Social Science & Medicine" — three correct
  citations the first cut then called fabrications. `containers_agree()` folds
  abbreviations itself and does not care what NLM calls a journal.

### 2.3 What is never a mismatch

A container that is not a journal claim. Books and grey literature end up in the journal
slot constantly — *The Body Keeps the Score*, *Motivational Interviewing: Helping People
Change* (3rd Ed.), *TIP 41*, DSM-5, "American Psychiatric Association" — and flagging
those would retire the gate in a week. A container counts as a journal claim only when it
reads as one: it carries a journal word, no book/edition/manual marker, and is not a
publishing body without a journal head-word ("American Psychiatric Association" is not,
"Journal of the American Geriatrics Society" is). An invented journal still reads as one
("Journal of the American Psychiatric Association"), which is the case this distinction
has to keep. The cost is stated in §4: a fabricated journal whose name uses none of those
words, and every abbreviated journal name, lands in `ambiguous`.

The same test is a positive one on purpose. Defaulting to "journal unless it looks like a
book" reads *Cognitive-Behavioral Treatment of Borderline Personality Disorder* as a
journal and calls a real book a fabrication.

Two more rules earned the same way, both in §5: **a parse artifact must never become a
fabrication finding**, and **an abbreviation borrows words while an invented title
introduces them**.

---

## 3. Scope: what counts as a citation

Three shapes, because **the incident did not use the shape the first draft read**:

1. numbered Vancouver — `1. Authors. Title. Journal. Year;vol(iss):pp. doi:…`
2. title-less Vancouver bullets carrying an identifier — `- Authors, et al. Journal.
   Year;vol:pp. doi:…`
3. `(YYYY)` bullets — `- Sullivan, J.T. et al. (1989) — *American Journal of
   Psychiatry* — prose`

Shape 3 is what PRs #640 and #672 actually wrote. **A gate that read only shape 1 would
have reported a clean corpus while never opening one of the 85 citations that caused the
incident** — `docs/SILENT_SHRINK_CHECKLIST.md`, a check reporting success over a set
smaller than the one it claims to check. Shape 2 is 132 real citations in
`07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` that the first draft
also missed.

A line is in scope when it sits under a references / sources / further-reading heading,
**or** carries a DOI or PMID anywhere in curriculum markdown (an identifier settles what
a line is on its own). Teaching prose in numbered lists is deliberately excluded: an
ambiguous queue full of teaching bullets is a queue nobody reads.

Lines inside a reference section that do **not** parse as a citation are counted and the
first few printed. That count is the anti-shrink signal — a new citation shape shows up
there as a rising number rather than as silence.

---

## 4. Calibration

Two labelled sets, both already in the repository.

* **Positives** — the identifier-carrying references on `origin/main`. The 2026-09-17
  audit swept 995 citations across 128 shipped pages and found 0.20% wrong, so a
  `mismatch` here is a false positive until shown otherwise, and each one was read.
* **Negatives** — every citation PRs #672 (`8b8ccd9`) and #640 (`0009ad6`) added,
  recovered from git and joined to the per-citation verdicts in
  `13_Faculty_Resources/Handoffs/CITATION_AUDIT_2026-09-17.md`
  (MISATTRIBUTED / NOT_FOUND = wrong, VERIFIED = right, UNCHECKED = book or guideline,
  must never be a mismatch).
* **Untitled positives** — there are no `(YYYY)`-bullet citations on `main` today,
  because #640/#672 were reverted, so that path has no live positives. Each real
  identifier-carrying reference was therefore re-expressed in exactly that shape (first
  author, year, journal, no title, no identifier) and run through the same path. Every
  `mismatch` there is a false positive.

### 4.1 The matrix

Measured 2026-09-21 against NCBI, cache `RESOLVER_VERSION = 3`, `TITLE_ID_FLOOR = 0.85`,
`AUTHOR_WINDOW_CAP = 120`.

**Set A — every citation on `origin/main`** (370 citations across 179 files; 365 carry a
DOI or PMID, 5 do not):

| | matched | ambiguous | **mismatch** | unavailable |
|---|---:|---:|---:|---:|
| 370 | 364 | 6 | **0** | 0 |

**False positives: 0 of 370.** The six `ambiguous` are four APA practice resources, one
NICE clinical guideline, and one paper in *Cognitive and Behavioral Practice*, which
PubMed does not index. None is a defect; all six are the adjudication queue working.

**Set B — the 79 citations PRs #672 and #640 added**, each joined to its audit verdict:

| audit verdict | n | matched | ambiguous | **mismatch** |
|---|---:|---:|---:|---:|
| MISATTRIBUTED + NOT_FOUND (**wrong**) | 53 | 9 | 15 | **29** |
| VERIFIED (**right**) | 12 | 6 | 6 | **0** |
| UNCHECKED — books, TIPs, DSM (**grey**) | 14 | 0 | 14 | **0** |

* **True positives 29. False negatives 24**, of which **9 read as clean (`matched`)** and
  15 file a finding. That 9 is the gate's real-world miss rate under the ruling, because
  `ambiguous` merges with a finding and `matched` merges silently.
* **False positives 0** — over the 12 correct and 14 grey citations in the same set.
* Precision 29/29 = 100%. Recall 29/53 = 54.7%.

**Set C — the untitled path's own false-positive rate.** No `(YYYY)`-bullet citations
exist on `main`, so the path that carries the teeth has no live positives. Each of the
257 real references that claims an author, a year and a journal was therefore
re-expressed in exactly the #640/#672 shape — author, year, journal, no title, no
identifier — and run through it:

| | matched | ambiguous | **mismatch** |
|---|---:|---:|---:|
| 257 | 114 | 143 | **0** |

**False positives: 0 of 257.** The 143 `ambiguous` are mostly abbreviated journal names
("N Engl J Med", "Bipolar Disord") that the journal test does not recognise — the
conservative direction, and the cost of §2.3.

**Across all three sets: 653 correct or unverifiable citations judged, 0 false
positives.**

### 4.2 Why 0.85, and what the floor actually does

`TITLE_ID_FLOOR` is swept below with both other knobs fixed:

| floor | FP on `main` | FP on VERIFIED | FP on UNCHECKED | wrong caught |
|---|---:|---:|---:|---:|
| 0.60 | **1** | 0 | 0 | 29/53 |
| 0.70 – 1.00 | 0 | 0 | 0 | 29/53 |

The table is flat above 0.70, and that flatness is the finding, not a failure to tune:

* **Every anchored title on `main` scores exactly 1.000** (231 of them). Real citations
  quote their titles, and where they abbreviate, §5's abbreviation rule scores the
  abbreviation as agreement. So no floor below 1.0 costs a false positive on the
  anchored side.
* The floor's real job is the **search-title identity gate**. The single false positive
  at 0.60 is a correct citation to a paper in a journal PubMed does not index, whose best
  candidate scored **0.667** against a longer, different paper's title. Accept that
  candidate as "the same paper" and its year and journal then contradict.
* So the observed separation is 0.667 (a wrong paper) against 1.000 (every right one).
  **0.85 sits between them**, with 0.18 of margin below and 0.15 above. 1.00 would also
  score 0 here, with no margin at all.

`TITLE_ID_FLOOR` is not the knob that moves the matrix on this corpus, because every
#640/#672 citation is untitled. The knob that does is `AUTHOR_WINDOW_CAP`:

| cap | FP (all sets) | wrong caught | reads clean | files a finding |
|---|---:|---:|---:|---:|
| 10 | 0 | 14/53 | 7 | 32 |
| 20 | 0 | 20/53 | 9 | 24 |
| 50 | 0 | 25/53 | 9 | 19 |
| **120** | **0** | **29/53** | **9** | **15** |
| no cap guard | 0 | 32/53 | 9 | 12 |

Monotone, and free of false positives throughout, so the cap is a cost dial: each step up
is more `esummary` calls per untitled citation. 120 is the shipped value. **The last row
is not an option** — it is what removing the "examined fewer than the author has" guard
would score, and those extra three are contradictions claimed over a set the tool never
opened, which is the exact failure `docs/SILENT_SHRINK_CHECKLIST.md` exists for. Raising
the real cap to 300 would win them honestly; that is one constant and a `--refresh`.

### 4.3 What the nine silent misses are, and why no floor fixes them

Every one is an untitled citation whose author **does** have a paper in the journal
claimed, in the year claimed — just not the paper being described. Marcantonio 2011
*NEJM* is the clearest: his delirium review is 2017, but he has an unrelated *NEJM* record
in the 2010-2012 window, so "Marcantonio ER (2011) — *New England Journal of Medicine*"
is true of some paper. Ely 2010 *Crit Care Med* (20 records), Pandharipande 2013
*Intensive Care Med* (2), Breitbart 2002 *J Palliat Med* (1) and five others are the same
shape.

**This is a property of the citation, not of the threshold.** Author, year and journal
with no title and no identifier is often satisfiable even when the attribution is wrong,
and no confidence floor recovers information the citation does not carry. Two things
close it and neither is this tool: requiring an identifier on new citations (Option A,
rejected as a gate, still available as `--require-identifier`), and
`evidence_annotations.json` + `bin/verify_spans.py`, which check the *claim* against the
paper's own words rather than the citation against the record.

---

## 5. The false positives that were fixed, and why they matter

The first full run flagged 16 of 370 citations on a corpus known to be 99.8% clean. Every
one was read; none was a real defect. They are recorded because each is a class:

| Class | Count | What it was |
|---|---:|---|
| PMCID read as a PMID | 3 | `(Free full text: PMC4170907.)` anchored a Cochrane review to PMID 4170907 — a 1968 *Lancet* paper on germfree isolators. Anchoring to the wrong namespace is the worst false positive: confident, specific, and completely wrong. |
| a year inside the title taken as the publication year | 4 | "…the **2020** ASAM clinical practice guideline…" cut the citation in half, so the journal became a fragment of its own title. |
| container taken from the first emphasis rather than the last | 2 | a title with italics of its own. |
| an abbreviated title read as a different one | 5 | reading-list pages cite by short title; "Good Psychiatric Management: foundations" scores 0.58 against the record's full title. |
| a journal whose own name contains a full stop | 1 | "Canadian Journal of Psychiatry. Revue Canadienne De Psychiatrie." dot-splits into a title plus a container. |
| a corporate author | 1 | "Joint Clinical Practice Guideline on Benzodiazepine Tapering (ASAM…)" — the dot-split makes its first word look like a surname. |

Two rules came out of this and are worth stating separately:

* **A parse artifact must never become a fabrication finding.** Where the parse cannot
  honestly claim a field — a non-personal author block, a "title" that is really the
  journal, a "title" ending in a colon — the field makes no claim and cannot contradict.
* **An abbreviation borrows words; an invented title introduces them.** A claimed title
  whose every content word appears in the record's own title is a short form, not a
  contradiction. This tolerance applies only when the record is **anchored**: when the
  title is what *finds* the paper, a token subset can match a longer, different paper,
  and it did.

---

## 6. Determinism, and how the cache can lie

`bin/data/citation_resolution_cache.json` stores what NCBI answered per citation, keyed
by a hash of the citation's own text: the gate reads it and never touches the network, so
the same commit and the same cache always produce the same answer, and editing a citation
invalidates its entry.

The key hashes the citation, but the answer also depends on **what the tool asked**.
When the PMCID bug was fixed, three citations kept their old, wrong anchored records
because their text had not changed. Entries therefore carry `resolver`
(`RESOLVER_VERSION`), and an entry written by a different resolver is **not examined** —
it reads as `unavailable` and exits 2 until `--refresh` re-resolves it.

**Uncached is never clean.** `bin/verify_spans.py` once printed
`0 clean, 0 flagged, 49 uncached` and exited 0 because a wrong cache path made every row
uncached. Here an uncached citation, an entry whose status is `unavailable`, and an entry
from an older resolver are all counted as not examined: named in the report, excluded
from the clean count, and — with no mismatch present — exit 2. A mismatch still exits 1,
so could-not-check cannot mask a real finding.

---

## 7. The ambiguous switch, and where the findings go

`AMBIGUOUS_POLICY` at the top of `bin/verify_citations.py`. Ruled default `report`;
`block` and `block-new-only` exist and are tested. `block-new-only` without a resolvable
`--base` is exit 2, never a silent pass — without a base every citation reads as legacy
and nothing would block.

Because `ambiguous` passes, **the filing path is load-bearing**: an ambiguous verdict
that passed silently would make the gate vacuous for the slice #672 exploited. Three
places carry it, and none of them is a new mechanism:

1. every open finding is printed on every run, with the verbatim citation, the reason,
   and a link to the record PubMed returned;
2. `--findings-out FILE` writes them in the shape
   `docs/curriculum-review/findings/findings.json` uses — id, file, locus, severity,
   verbatim `quote`, `problem`, `verification` — so a faculty sitting reads them the way
   it reads every other finding here;
3. `bin/data/citation_adjudications.json` is the do-not-refile list, in the shape of that
   lane's `rejected.json`: a named person, a date, a reason, keyed by citation. It stops
   applying the moment the citation's text changes, and it **cannot** suppress a
   `mismatch` — a contradicted citation is fixed, not adjudicated.

`bin/what_needs_josh.py` gains a `citation-adjudication` row measuring exactly the
un-adjudicated count, so the queue cannot rot unseen. It obeys that file's three
contracts: it retires itself at zero, it reports `unknown` rather than zero when the
measurement fails, and its predicate is satisfiable only by the human act — no agent
output writes an adjudication.

The surveillance findings lane was considered and rejected: its `finding.schema.json`
pins `job` to three values and `source_id` to a foreign key into
`source_registry.yaml`, so using it would mean editing a `*.schema.json`, which this
change is not permitted to do.

---

## 8. Known limits

* **Only NCBI.** A citation in a journal PubMed does not index (Cognitive and Behavioral
  Practice, for one) can only ever be `ambiguous`. doi.org answers 403 from this
  environment (`bin/probe_egress.py`), so Crossref as a second opinion is a later change.
* **Extraction recall is not 100%.** Of the 85 citations the two commits added, this
  extractor recovers 79; the rest are in shapes it does not read. The unparsed-line count
  is the honest signal for that, not a claim of completeness.
* **The untitled path's live false-positive rate is estimated, not observed.** There are
  no untitled bullet citations on `main` today, so §4's third set is a reconstruction.
* **`ambiguous` merges.** By ruling. The false-negative count in §4 is what that costs.
