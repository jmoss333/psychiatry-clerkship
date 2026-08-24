# Taplinger UX Decision Packet — read-only review, 2026-08-23

Spec for `2026-08-23-taplinger-ux-remediation.md`. Independent reproduction of the learner-UX
audit, assessed against Kaitlin Taplinger, DO's feedback of 2026-08-20.

Rendered version: https://claude.ai/code/artifact/086ca570-08e9-4661-83f2-8d1a4c8a6b3f

**Scope of this review:** read-only. No files edited, nothing committed, no PR, no deploy, no
message sent, no faculty approval claimed. Verified against HEAD `59f59dc`.

---

## Verification baseline

| Check | Result |
|---|---|
| `node --test tests/*.test.mjs` | **1413 / 1413 pass**, 0 fail |
| `build_and_check.sh ms3` / `res` | exit 1 — **sole cause: LFS media preflight** |
| Git-LFS pointer stubs | 105 in build output (all 316 media files are 132-byte pointers) |
| Repo dirty files after review | 0 |

Everything upstream of the LFS gate passes: validators, contract tests, WCAG contrast tokens,
static-QA sweep, both sites. **There is no code failure behind the red exit.**

**Worktree drift:** HEAD was 4 commits behind `origin/main`. Those commits touch
`evidence_annotations.json`, four spec docs, and `bin/verify.sh` only — none of the audit surface
(`spa_index.html`, `fd_search.js`, `curriculum.json`, the therapy pages). Findings are current.

**Hosted live-mode verification: UNAVAILABLE.** Live mode requires `SP_STUDENT_PASSCODE`. No
passcode was requested, used, or stored, so **no claim is made that live mode works**.

---

## Kaitlin's feedback (verbatim source: Gmail thread `19f6551b3557d00d`, 2026-08-20)

Liked: practice questions, psychopharmacology, weekly/longitudinal organisation.

Two constructive comments:
1. *"I worry students could get a bit lost in the website. Do you explain to them that this is a
   starting point? ... I would also want to make sure they are diving deeper into each topic."*
2. *"Do you think the therapy section could be built up some? ... more info, examples,
   worksheets, etc."*

On the simulation: *"For both OSCE cases — I couldn't get the live function to work, only offline.
When it's offline, I do get responses to my text, but the AI responses don't advance the interview
despite different attempts at questioning."*

Two of her questions remain unanswered: how the practice questions were produced ("Were they AI
generated with you then proofreading them?"), and her offer to share a CL reading list and a
cohort of 5–6 MS3s per six weeks plus MS4s.

---

## Findings

| # | Finding | Reproduction | Decision | Pri | Type | Effort |
|---|---|---|---|---|---|---|
| F1 | Resource navigation retains previous scroll | CONFIRMED | Address now | P1 | mechanical | small |
| F2 | Search unreliable — misses exact titles **and** `"therapy"` | CONFIRMED · worse | Address now | P1 | mechanical | small–med |
| F3 | New therapy pages in **no** path, either audience | CONFIRMED · broader | Address now | P1 | faculty-gated selection | small |
| F4 | Both new pages are total link dead-ends | CONFIRMED · worse | Address now | P1 | mechanical + content | small |
| F5 | Learner entry contract ambiguous | CONFIRMED | Plan separately | P2 | faculty-gated | small |
| F6 | Offline sim misses paraphrases incl. a standard SI screen | CONFIRMED (was PARTIAL) | Faculty package | **P0** | clinical | large |
| F7 | Governance contradiction — **badge is stale, not the pack** | CONFIRMED · polarity reversed | Address with sign-off | P1 | faculty-gated | small |
| F8a | Long-page disclosure is **non-functional**, not just unstyled | CONFIRMED · worse | Address now | P1→P0 mobile | mechanical | small |
| F8b | Resident extensions in MS3 view | **NOT a defect** | Reject as bug | — | by design | — |
| F9 | Library exposes 83 (ms3) / 92 (res) at once | CONFIRMED | Plan separately | P2 | learner-content | medium |

### F1 — scroll retention
The shipped 750 KB bundle contains **exactly one** scroll call: `scrollTo(0,0)` at
`spa_index.html:1066`, in the faculty-preview path a comment says learner navigation never
reaches. No `scrollTop`, `scrollIntoView`, or `scrollRestoration`. `scrollPos` is declared in
`FD_KEYS` (`fd_state.js:20`) but never read or written — dead state.
**Measured:** ms3 665.5 → 665.5, title 368 px above viewport. res 820 → 820, title 522 px above.

### F2 — search
Two compounding defects. (a) `fdSearchHits` accepts any expanded word > 1 char, so `on` matches
**70 of 83** items and `the` **59** — including as substrings inside other words. (b) Items are
ordered by `refs.sort()` (alphabetical filename), then `.slice(0,8)`.
The exact phrase matches precisely the 2 correct pages — that signal is computed then discarded.
`"therapy on the unit"` → target ranks **71st of 75**. `"therapy"` → both new pages rank 10th/11th
of 11 and are cut. Live results matched a node harness prediction item-for-item.

### F3 — learning paths
Absent from **every** week of **both** MS3 (6 weeks) and resident (4 weeks) paths. MS3 Week 3 ships
exactly five items. Both pages *are* correctly registered in `site_manifest.json`.

### F4 — link dead-ends
Both pages contain **zero markdown links of any kind**, in source and build output. The "Go deeper
(verified reading — the rail)" section closes by telling the learner to "see the Therapy Reading
Room page" **as unlinked prose**. `brief_psychotherapy.md:40` has a five-link "Pair with" rail
naming neither new page.

### F5 — learner contract
`MS3_Inpatient_Rotation_OnePager.md:29`: *"nothing here is required reading."* The front door shows
"0 of 5 done", a 0% ring, "~12 min left", and a next-unread pointer.
**Not mechanical** — the wording is a course-expectations claim to enrolled students.

### F6 — offline simulation (P0)
The engine compiles each intent's literal phrases to `new RegExp(p,'i')`
(`sp-interview.html:230,239`). 8 of 16 clinically reasonable phrasings deflected.

| Probe | Result |
|---|---|
| "My name is Sam and I'm a medical student." (exact) | advances richly |
| "Tell me more about what brought you in." (exact) | full history disclosure |
| "I'm Sam, a third-year student working with Dr. Chen." | *"I don't really know what you're asking."* |
| "What made you decide to come to the hospital?" | *"I'm not sure. Can you say more…"* |
| "That sounds incredibly hard." | *"Huh. Nobody's asked me that."* — statement treated as question |
| **"Have you had any thoughts that life isn't worth living?"** | **not recognised as an SI screen** |

**Why P0:** coverage is scored by matched intent IDs. A learner who screens correctly in
guideline-concordant language is recorded as not having screened — the gated disclosure never
unlocks and the debrief tells them they missed it. The simulation teaches that a correct question
is wrong.

### F7 — governance (polarity reversed vs. the original audit)
The whole chain says **reviewed**: pack `status`, all three cases' `facultyReview` (Joshua Moss, MD
— 2026-07-13, 07-22, 08-12), `reviewed.json`, `governance.json` (2026-08-11). The sole dissenting
artifact is a hard-coded badge at `sp-interview.html:840` — in a file whose own header at line 6
declares `status="reviewed"`. Both claims are visible ~85 px apart.

### F8a — disclosure is dead, not ugly
The reader wraps long pages into 12 collapsible sections and injects an Expand/Collapse toolbar.
Every `.sec-*` rule is scoped `.md-body` (`spa_index.html:277-288`) but `fd_reader.js` renders into
`.fd-article__body`. **Measured on both sites:** `insideMdBody:false`, `.sec-b` display `block`
before *and* after clicking Collapse all (`collapseHadEffect:false`), `.sec-all` computed
`border-radius:0px` / `Arial` / `#efefef` against an intended 999 px accent pill.
**Precedent for the fix already exists in the same file** — lines 126–131 dual-scope the table
rules as `.md-body X, .fd-article__body X`. The `.sec-*` rules were missed in that migration.

### F8b — rejected
"Learner level: **MS3 core**, with labeled **Resident extension** blocks (shown on both sites)" is
printed on the page's own third line and renders as a labelled aside. Stated design intent, not a
defect. Whether the intent is *right* is a curricular question.

### F9 — Library density
83 items / 5 columns (ms3); **92** (res). Today and Path are markedly clearer, so Library is now
the weakest surface for Kaitlin's concern.

---

## Also found, not in the original audit

- **The embedded tool iframe clips its own start controls.** `.toolframe` is
  `height:calc(100vh - 46px)` (≈879 px) while tool content is ≈2629 px, and `#content.toolmode`
  does not apply inside the reader. Begin buttons sit at y ≈ 903, 994, 1668, 1759. All **three**
  attested cases ship, but **Ray** (reviewed 2026-08-12) is below the clip — which is why Kaitlin
  reported "both OSCE cases".
- **Self-check answers are printed inline** on the therapy page, with no disclosure control in
  source. With F8a dead there is no mechanism hiding them.
- **Crisis-block injection and two-site separation are intact.** 988 / Crisis Text Line / Maine
  Crisis Line render from `crisis_resources.json` at build time on both sites. No regression.
- **The Interview Room passcode is circulating in plaintext** in the forwarded email chain, sent to
  a nine-person distribution list and onward. Operational decision, not a code change.

---

## Protect / keep

Regression targets for any work package:

- Practice questions and the question bank (her named favourite); keep attested-only-by-default.
- Psychopharmacology resources (named); untouched by all recommendations.
- Weekly / longitudinal organisation (named); the remediation *adds* to Week 3, never restructures.
- The two-question setup flow with its "Not on rotation — just browse" escape hatch.
- The therapy content itself — objectives, 30-second summary, bedside toolkit, span-verified
  citations. The problem is reachability, not quality.
- The proxy's governance gate — per-case attestation, canonical hashing, privacy and rate-card
  checks.
- Crisis-resource injection and the no-PHI posture.

---

## Decisions requiring Joshua Moss, MD

1. Is the Interview Room reviewed or pending? (F7)
2. Which phrasings count as a suicide screen? (F6 — blocks student use)
3. What is the learner contract? (F5)
4. Does Week 3 gain the therapy pages, or do they replace the older one? (F3)
5. Should MS3 learners see resident-extension blocks? (F8b)
6. How should the passcode be handled — rotation and distribution route?
7. Two unanswered questions from Kaitlin: question-bank provenance, and her reading-list /
   pilot-cohort offer.
