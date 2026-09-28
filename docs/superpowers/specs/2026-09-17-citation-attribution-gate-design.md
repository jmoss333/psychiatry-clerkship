# Citation-attribution gate — design draft

**Status: DRAFT. Not wired into `verify.sh` or `ci.yml`.** One design question needs a ruling
before this becomes a gate — see [§4](#4-the-one-open-question-needs-a-ruling). Everything else
here is settled enough to implement.

Author: 2026-09-17 clerkship review session. Supersedes nothing; complements
`13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py`.

---

## 1. What went wrong, stated precisely

PR #672 shipped 85 citations. Of the 47 that were checkable, **43 were wrong** — misattributed or
fabricated. PR #640 was 50% wrong. Both passed every gate this repository had.

The full audit is committed at `13_Faculty_Resources/Handoffs/CITATION_AUDIT_2026-09-17.md`. Read
its verdict tables before changing anything here; the failure taxonomy below is derived from them,
not invented.

**The existing check could not have caught it.** `run_citation_check.py` extracts DOIs and PMIDs
and asks *does this identifier still resolve?* That is a liveness check. It answers "is there a
paper at the end of this string" and never "**is it the paper being claimed**". The two questions
come apart completely, and every #672 defect lived in the gap:

| Failure mode | Example from the audit | Identifier resolves? | Caught today? |
|---|---|---|---|
| Right author, right year, **wrong journal** | Sullivan JT 1989 CIWA-Ar cited to *Am J Psychiatry*; it is *Br J Addict* | n/a — no identifier | ✗ |
| Right author, right topic, **wrong year** | Marcantonio NEJM delirium review cited 2011; it is 2017 | n/a | ✗ |
| Real author, **wrong field entirely** | Singal AG (hepatology) cited for race-differential TSH, and again for OUD disparities | n/a | ✗ |
| **Invented journal** | "Journal of the American Psychiatric Association" — does not exist | n/a | ✗ |
| **Wrong person, same surname** | Pierce CM 1974 on racism → only real record is Pierce **HE** on keloid cryosurgery | n/a | ✗ |
| **Self-attribution** | "Moss, J." inserted as co-author on a paper he did not write | n/a | ✗ |

Note the third column. **Not one of these citations carried a DOI or PMID at all.** They were bare
Vancouver prose. `run_citation_check.py` found nothing to check and reported success — correctly,
by its own contract. It is not broken. It is answering a different question.

### 1.1 The library itself is clean — this is a two-PR event

The 2026-09-17 audit swept the whole library: **995 citations across 128 shipped pages, zero
fabricated, zero invented journals, zero "Moss, J." attributions.** The pre-existing corpus is
0.20% wrong.

This matters for the design. **The gate is a ratchet against a recurrence, not a cleanup tool.**
It should be tuned to fail loudly on newly introduced defects and to stay quiet on 995 citations
that are already correct. A design that generates a wave of findings against clean legacy content
will be switched off within a week, and then it protects nothing.

---

## 2. Reuse, don't invent: the ReConnect precedent

A working implementation of exactly this check already exists in the ReConnect repo:

- `rssm-manual/scripts/appendix_f_checks.py` — the comparison logic
- `rssm-manual/scripts/rssm_validate.py` — the harness that runs it
- `rssm-manual/evidence/citation_verification_cache.json` — **a committed resolved-metadata cache**
- `rssm-manual/scripts/refresh_citation_cache.py` — the network-touching refresher

It was built against the same defect class ("a resolvable DOI attached to a title it does not
belong to", plus fabricated author lists). Four of its decisions should be copied verbatim:

**(a) The cache is committed and CI never touches the network.** `rssm_validate.py` reads the
cache and makes zero HTTP calls. CI cannot flake on a Crossref timeout, and a run is reproducible
months later. This is the single most important property — a citation gate that fails randomly
gets marked `continue-on-error` and stops being a gate.

**(b) A missing cache entry FAILS; it does not skip.** From the cache's own header comment: *"An
entry whose DOI is missing here FAILS validation rather than being skipped."* Fail-closed. The
alternative — skip what you cannot resolve — reproduces the exact hole that let #672 through,
because the fabricated citations are precisely the ones that will not resolve.

**(c) Thresholded title similarity, not string equality.** Genuine variants (subtitle punctuation,
`&` vs `and`, British spelling, online-first pagination) score ~0.7–1.0. Equality would produce
constant false positives; a threshold tuned against the real corpus does not.

**(d) Author-list plausibility as an independent signal.** Three or more identical surnames in one
author block is a fabrication signature that needs no network call. Cheap, deterministic, and it
catches a defect class the DOI comparison cannot.

> There is one more source to fold in. A separate session that just completed the library-wide
> audit left **five working scripts** that resolve identifiers and compare resolved
> title/author/year/journal against the claim. They are proven against this incident. They live
> in that session's own outputs folder and were not reachable from here — **@jmoss333, please drop
> them into the repo (suggest `13_Faculty_Resources/_automation/surveillance/bin/`) and this draft
> should be rebased onto them rather than the other way round.** The draft implementation in this
> PR reimplements the same approach from the ReConnect precedent so the design is reviewable now;
> it is not a claim that reimplementation was the better path.

---

## 3. What the gate checks

Scope: curriculum markdown under the `CITATION_INCLUDE_PREFIXES` already defined in
`run_citation_check.py`. Reuse that list — do not introduce a second notion of "curriculum".

1. **Parse coverage.** Every Vancouver-style numbered reference must parse into
   author-block / year / title / container. A line that looks like a citation but does not parse
   is an **error**, never a silent skip. (#672's defects would all have parsed — this check exists
   so the checks below cannot be dodged by malformed input.)
2. **Identifier resolution.** For each citation carrying a DOI/PMID, look it up in the committed
   cache. Missing from cache → **fail** (fail-closed, per 2b).
3. **Attribution comparison** — the check that would have caught #672. Against the resolved record:
   - *title* — `title_similarity ≥ TITLE_FLOOR`
   - *container/journal* — normalised comparison, subtitle- and ampersand-tolerant
   - *year* — exact, ±1 tolerated only for online-first/print split
   - *first-author surname* — must match
   Any mismatch → **fail, naming the claimed value and the resolved value side by side.** The error
   message must print both. "Citation 7 is wrong" sends someone to guess; "claimed *Am J
   Psychiatry*, resolved *Br J Addict*" is immediately actionable.
4. **Author-list plausibility** (no network): repeated-surname runs ≥3, orphan initials, malformed
   surnames.
5. **Self-attribution guard.** Any citation listing the repository owner as an author of an
   external work is an **error**. #672 inserted "Moss, J." into a citation he did not write. This
   is cheap, exact, zero-false-positive, and specific to the incident. Implemented as a
   configurable name list, not a hardcoded string.

---

## 4. The one open question — needs a ruling

Everything above is determined. This is not, and it is the decision that shapes the whole gate.

### What does the gate do with a citation that carries no DOI or PMID?

Measured on `origin/main` today, over Vancouver-style numbered references in shipped curriculum:

| | count | share |
|---|---|---|
| references carrying a DOI or PMID/PMC | **247** | **91.5%** |
| references carrying **no resolvable identifier** | **23** | **8.5%** |
| files holding ≥1 identifier-less reference | 13 | — |

So ~92% can be checked deterministically today. The question is what happens to the remaining 8.5%
— and, more importantly, **to the next citation someone adds without an identifier**, which is
exactly the shape every #672 defect had.

The two coherent answers:

---

**Option A — require an identifier on new citations. Fail any new citation that lacks one.**

The gate checks only what carries a DOI/PMID, and separately fails if a *newly added or modified*
citation has no identifier. Legacy identifier-less citations are grandfathered via an explicit
allowlist that can only shrink.

- ✅ Fully deterministic. Cache-backed, zero network in CI, no flake, no threshold to argue about.
- ✅ **Catches #672 exactly** — its citations had no identifiers, so every one of them fails at the
  door, before any comparison logic runs.
- ✅ Cheap to implement and nearly free to run.
- ❌ Imposes an authoring burden: every new citation must be looked up before it can ship.
- ❌ Cannot retroactively verify the 23 legacy references; they are asserted-clean by the audit,
  not gate-verified.
- ❌ A determined author can satisfy it by pasting *any* resolvable DOI — check 3 then has to be
  what actually bites. (It does. But the door check alone is not sufficient.)

**Option B — search-and-judge for identifier-less citations.**

For a citation with no identifier, query NCBI by author + year + title, score the best match, and
fail below a confidence floor. This is what the human audit did.

- ✅ Covers everything, legacy included. Nothing is grandfathered.
- ✅ Would have caught #672 even had the authoring rule been ignored.
- ❌ Heuristic. Needs a confidence threshold that will be wrong at the edges in both directions.
- ❌ Fundamentally non-deterministic — results depend on PubMed's index at query time, so the same
  commit can pass today and fail next month.
- ❌ Requires network in CI, or a much larger and staler cache keyed on a fuzzy query rather than
  a stable identifier.
- ❌ Needs a human-adjudication lane for `ambiguous`, which is operational load that has to be
  staffed or the queue rots.

---

**My read, offered but not acted on:** A is the better ratchet and B is the better audit, and they
may not be the same tool. A is a gate; B is closer to what the surveillance job already is — a
scheduled sweep that files findings for a human. Splitting them that way would let A run on every
PR deterministically while B runs weekly and never blocks a merge. But that is a third option with
its own cost (two mechanisms to maintain), and **the call is yours.**

What I need from you is one of: **A**, **B**, or **A-as-gate + B-as-scheduled-sweep** — and, if A,
whether the authoring burden applies to *all* new citations or only those on `safetyKit` surfaces.

---

## 5. Not decided here

- Where the gate runs (pre-push via `verify.sh`, CI, or both) — follows from §4.
- Cache refresh cadence and who owns it.
- Whether guidelines/TIPs/DSM/textbooks (the audit's `UNCHECKED` class, ~15% of #672's citations)
  get a separate manual-attestation path. They are not PubMed-checkable by any mechanism, and
  pretending otherwise would add a category of permanent false positives.
