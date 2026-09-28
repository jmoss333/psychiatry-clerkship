# Citation-attribution gate — the ruling, and what shipped

**Status: RULED and WIRED.** This supersedes §4 of
[`2026-09-17-citation-attribution-gate-design.md`](2026-09-17-citation-attribution-gate-design.md),
which left one question open and therefore shipped nothing. Everything else in that document
still stands and should be read first; this records the decision, the implementation, and two
places where the draft's own numbers turned out to be wrong.

Ruled by Josh Moss, 2026-09-27. Implemented the same day.

---

## 1. The decision

> **A is the gate. B is a scheduled audit. The legacy debt is grandfathered on a named,
> capped list that can only shrink.**

Concretely, three things:

**1. `--require-identifier` is ON BY DEFAULT.** A reference with no DOI or PMID fails the
check. This is deliberate and it is the whole reason A was chosen over B: *every one of
#672's fabricated citations carried no identifier at all.* A stops that entire wave at the
door, before any comparison logic runs. B would have had to correctly adjudicate 47
fabrications one at a time, and would have got some of them wrong.

**2. The existing identifier-less references are NOT forced through it.** They are
grandfathered on an explicit, named allowlist — `bin/citation_identifier_allowlist.json` —
one entry per reference, each with a written reason, **capped at its current size**. Anything
new must carry an identifier. This is the ratchet pattern already proven here
(`docs/RATCHETS.md`), with the two properties that make it a ratchet rather than a list of
excuses:

- **the debt can only shrink** — an addition past the cap fails;
- **an entry that stops reproducing fails as stale until it is deleted** — so a grandfather
  clause cannot outlive the thing it grandfathers.

It is explicitly **not** a blanket "legacy citations are exempt" rule. A category exemption
regrows, because nothing stops the next citation from joining the category. A named, capped
list cannot.

**3. Option B is a scheduled sweep, not a CI gate.** `bin/audit_citation_allowlist.py` runs
weekly from `surveillance-citations.yml`, searches PubMed for each grandfathered citation, and
proposes an identifier so the entry can be retired. It is allowed to be wrong because it
blocks no one, and it is kept out of the merge path on purpose: it is heuristic and
non-deterministic, so the same commit can pass today and fail next month as PubMed's index
moves. A flaky gate gets marked `continue-on-error` within a week and then protects nothing.

---

## 2. Two corrections to the draft's measurements

### 2.1 The legacy debt is 3, not 23 — so the cap is 3

The draft reported 270 references, 247 with an identifier, **23 without (8.5%)**. Re-measured
on 2026-09-27 over the same corpus, the figures are 270 references in 29 files, **267 with an
identifier (98.9%), 3 without (1.1%)**. The same measurement at the draft's own base commit
(`69281ac`, 2026-09-17) also gives **3**, so this is not twelve days of cleanup — the draft's
23 is not reproducible under any reference-section scope.

The likely cause is visible in the draft implementation: its `looks_like_reference` predicate
accepted *any* numbered line over 60 characters, anywhere in a curriculum page. Run over
today's tree that collects **853 lines**, of which 582 carry no identifier — reading-list rows
("2. Rosenhan — 'On Being Sane in Insane Places' (1973)"), prose bullets ("2. **Verbal
de-escalation, first.** …"), and planning checklists. The draft's 23 sits between 3 and 582 and
matches neither; whatever it counted, it was not the reference corpus.

**The cap is set from the measurement, at 3.** Setting it at 23 would hand the next author
twenty slots of unearned headroom, and a ratchet with slack in it is not a ratchet.

The three grandfathered references are all guidance documents that genuinely have no DOI and
no PubMed record: NICE CG113, NICE CG178, and an NHS Specialist Pharmacy Service article. Each
entry says so in a sentence a reviewer can check.

### 2.2 Scope is reference sections, and that is what makes the count precise

The gate reads numbered lines under a markdown heading whose text is exactly **`References`**,
in the curriculum prefixes `run_citation_check.py` already defines. That yields exactly the 270
the draft names, which is the evidence that the draft intended this scope even though its code
did not implement it.

**Known and deliberate gap:** `- **Key paper:** Author, Journal Year.` lines — 97 of them in
`07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` alone — are **out of scope**.
They are prose attributions, not references; almost none carry an identifier, so putting them
behind the door check would demand ~100 allowlist entries and turn the ratchet into the blanket
exemption §1 rejects. This gap is not theoretical: Q93 of that file cited the USPSTF's 2022
*screening* statement for FDA-approved eating-disorder pharmacotherapy — a paper that mentions
neither fluoxetine nor FDA approval — and survived four peer-review waves that edited the file
around it (#763, #769, #773, #776, #813). It is fixed in this PR by hand. Closing the surface
properly is the obvious next work package, and it needs its own ruling, because the honest
options are "give 97 prose lines identifiers" or "accept a second, looser check".

---

## 3. What each check does, and why the comparison is containment

| code | what it catches | #672 example |
|---|---|---|
| `citation.no_identifier` | no DOI/PMID and not allowlisted | **all 85** |
| `citation.uncached` | identifier absent from the committed cache — fail-closed | — |
| `citation.unresolved` | the service answered "no such paper" | — |
| `citation.title_mismatch` | the identifier resolves to a paper the line does not name | Pierce CM on racism → Pierce HE on keloid cryosurgery |
| `citation.journal_mismatch` | the line does not name the resolved journal | CIWA-Ar → *Am J Psychiatry*; it is *Br J Addict* |
| `citation.year_mismatch` | no year within ±1 of the resolved year | Marcantonio NEJM delirium → 2011; it is 2017 |
| `citation.author_mismatch` | the line does not name the resolved first author | Singal AG (hepatology) cited for thyroid and for OUD |
| `citation.authors` | ≥3 identical surnames in one author block | fabricated author lists |
| `citation.self_attribution` | the owner as author of an external work | "Moss, J." |
| `allowlist.*` | over cap, stale, malformed, key not derived, cap desynced | — |

**The comparison is containment, not field parsing, and that was a correction made during
implementation.** The first cut parsed each reference into author / title / journal / year by
splitting on `". "`, the way the draft implementation did. Run against the live corpus — which
has **no known defects in it** — that reported **37 findings**: titles containing full stops
("Catatonia. I. Rating scale") truncated at the stop; `[DOI](https://doi.org/…)` links read as
journal segments; tussenvoegsel and two-word surnames ("van Dis", "Bastos Maia") reduced to
"van" and "Bastos"; Crossref markup (`<i>2018 CANMAT</i>`) compared as text.

Thirty-seven false positives on a clean corpus is not a tuning problem, it is the failure the
draft itself named: *"a design that generates a wave of findings against clean legacy content
will be switched off within a week, and then it protects nothing."* So the question the gate
asks was changed from *"does the parsed journal field equal the resolved journal"* to **"does
this citation line name the paper this identifier resolves to"** — measured as the fraction of
the resolved title's content words present in the line. It needs no segmentation, cannot be
dodged by malformed prose, and separates the classes by a wide margin: genuine citations score
0.75–1.00, the Pierce fabrication scores 0.00. The floor is 0.60, which sits in empty space
rather than on a boundary. **The live corpus now reports zero findings**, which is what makes a
single new finding mean something.

---

## 4. Where it runs

| | |
|---|---|
| `bin/verify.sh` | self-test **and** gate — the pre-push hook, so a red gate blocks the push |
| `.github/workflows/ci.yml` | self-test **and** gate, in `build-test-validate` |
| `surveillance-citations.yml` | the Option-B sweep, weekly, blocking nothing |

**It is wired into CI, and that is the point of this PR.** This gate had been designed twice —
PR #694 (+1,205 lines) and the Option-B branch (+10,959 lines) — and shipped zero times. The
draft deliberately wired only the self-tests, pending this ruling. Adding a gate step to
`ci.yml` trips five contracts (`CLAUDE.md`, "Adding a step to `ci.yml`"), all five updated
here: `check-verify-coverage.py` (mirrored in `verify.sh`), the step inventory, the whole-file
digest, `CRITICAL_STEPS` (which pins each step's exact `run:` body so a later agent cannot
clear a red by blessing a step that no longer runs anything), and the maintenance unit tests.

`docs/RATCHETS.md` says none of the three ratchet tools is in `ci.yml` and that adding one
trips those contracts. That remains true and the contracts are paid here rather than dodged.
The reason this one belongs in CI and the other three do not: `verify.sh` is a **pre-push**
hook, and the defect being gated arrives *in a pull request from an agent session*, which is
exactly the path a local hook does not cover.

---

## 5. Refreshing the cache

`bin/data/citation_attribution_cache.json` is committed and the gate never touches the
network. Refreshing is a deliberate human act:

```bash
python3 bin/refresh_citation_attribution_cache.py          # resolve what is missing
python3 bin/refresh_citation_attribution_cache.py --force  # re-resolve everything
```

It asks Crossref for each DOI, asks NCBI for that DOI's PMID, and stores every journal-name
variant either service returns, because the abbreviation PubMed prints ("Br J Addict") is the
form the curriculum uses and Crossref usually carries only the expansion. An identifier a
service could not be *reached* about is left out of the cache entirely rather than written with
any status — the gate fails closed on a missing entry, and writing "unknown" would launder an
outage into a record. 175 unique identifiers, all resolved, as of 2026-09-27.

---

## 6. Still not decided

- The `Key paper:` prose surface (§2.2). Needs its own ruling.
- Cache refresh cadence and who owns it. Today it is on-demand; the weekly sweep is the
  natural place to add a staleness note, once there is evidence about how often a record
  actually changes.
- Guidelines/TIPs/DSM/textbooks beyond the three allowlisted: unchanged from the draft's §5 —
  they are not PubMed-checkable by any mechanism, and the allowlist is how they are handled
  one at a time rather than by category.
