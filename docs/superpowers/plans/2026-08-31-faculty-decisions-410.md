# Faculty decisions D12–D16 — issue #410 wave · 2026-08-31

> **Proposed for ratification.** Drafted against `main @ c2bbb66` (PR #406 merged). Append to
> `docs/superpowers/plans/2026-08-24-faculty-decisions.md` after D11, same convention as D6–D11
> (the file keeps its date because the regression tests cite it by path). Every claim below was
> measured by compiling the pack the way the engine does (`new RegExp(p,'i')` per
> `sp-interview.html:229` / `sp.mjs:279`) and scoring `c_si` through `computeCoverage`.
> Verification artefacts: `verify.mjs` (124-row matrix), `apply_proposed.py` (reference edit),
> `pack.proposed.json` (result). Baseline scores **60/124**; proposed scores **124/124**;
> `sp-proxy` full suite on the proposed pack: **253 pass / 4 fail**, all four being pinned
> tests that encode the pre-D12 structure and are enumerated for update under D12.

---

## One correction to the issue's sequencing, before the decisions

#410 proposes **A + B first, then C + D**. Reverse that, or do them in one PR. A + B add
*dark thoughts / unsafe thoughts / something drastic|stupid* to Marcus and Ray; under the current
structure the only place they can go is `si_direct` at full credit (the D5 route), which is exactly
the over-credit C exists to remove. Landing A + B first means a transient over-credit and moving
the same stems a wave later. **D12 (structure) and D13 (vocabulary) ship together.** E and F are
Dana-only and independent; they ride in the same PR because every pack change triggers the same
preview regeneration and red-team run.

---

## D12 · A euphemism or a reflection is a move, not a screen — in every case (items C + D)

**DECIDED: partial, uniformly.** Marcus and Ray gain an `si_euphemism` intent and
`c_si.partialIfOnly: ["si_euphemism"]`, mirroring Dana. The euphemistic and reflective stems leave
their `si_direct`. The `what's the point` family is split the same way in **all three** cases:
the existential-object branch (`…of going on / living / being here / waking up / any of this…`,
D6/D8/D11 logic unchanged) is a plain screen → `si_direct`; the bare or reflected form
(`What's the point?`, `…even the point`, `You said what's the point — tell me more`) is
hopelessness-adjacent, names neither death nor suicide → `si_euphemism`.

Evidence presented (baseline, `c_si` if this were the learner's only safety move):

| Learner says | Dana | Marcus | Ray |
|---|---|---|---|
| "Have you thought about hurting yourself?" | partial | **observed** | **observed** (+ `violence_screen`) |
| "What's the point?" | **missed** | **observed** | **missed** |
| "You said what's the point — can you tell me more?" | **missed** | **observed** | **missed** |
| "What's the point of going on?" | **missed** | observed | **missed** |

Same words, three grades. Two of them are wrong in opposite directions.

Rationale — three things settle it:

1. **The pack already says so.** Marcus's `criticalMiss.partial` copy exists — *"Suicide was only
   approached sideways… Ask plainly, even when the patient is smiling"* — and has been
   **unreachable since authoring**: with `c_si.intents = ["si_direct"]` and no `partialIfOnly`,
   his row can only be `observed` or `missed`. The partial state was designed; the scoring never
   wired it. D12 wires it.
2. **The house rule is explicit.** Dana's teaching point: *"use the patient's own words, then ask
   about killing yourself in plain language."* The reflection is the set-up, the plain question is
   the screen. A set-up alone earns credit for a move, not for the best move — which is precisely
   what `partial` means in this engine.
3. **D6's asymmetry.** Downgrading bare *"What's the point?"* on Marcus from `observed` to
   `partial` is a false-miss-direction change and it is not even a miss — the attending sits
   forward with copy that fits the situation exactly. Leaving it is a false pass on a
   `critical: true` row.

Response-level consequences (why this is not only a scoring change):

- **Marcus** `g_si_mixed` gains `euphemismIntent: "si_euphemism"` + `deflectEuphemism` (copy gate
  below). A euphemism no longer unlocks the flicker; the learner must re-ask plainly. This mirrors
  Dana and is bit-identical in `sp.mjs deriveState` (parity test passes on the proposed pack).
- **Ray** has no SI gate, so `si_euphemism` needs a `responses.si_euphemism` bank (copy gate below)
  or it falls through to `_default`. Today, *"Have you thought about hurting yourself?"* on Ray
  after the command disclosure hits `violence_screen` and fires `g_target`'s reveal — *"Hurt them?
  No. God, no…"* — as the answer to a self-harm question. D12 + D13(B) end that.
- `computeRubric` and `buildNarrative` already read `si_euphemism` generically; no engine change.
  The growth line's example (*"When you say you're a burden…"*) is Dana-flavoured; acceptable, and
  a candidate for pulling `criticalMiss.rehearse` per case later.

Also closed here, because every case's existential pattern is being re-touched anyway: the D11
dash residual. The closing punctuation class gains `—–-`, so *"You said there's no point in going
on — can you tell me more?"* credits (the golden transcript uses the em-dash idiom). One character
class, four patterns.

**Pinned tests that must change** (all four fail on the proposed pack for exactly this reason,
nothing else in the 257-test suite moves):

| Test (sp-safety-screen-phrasing.test.mjs) | Change |
|---|---|
| "Marcus and Ray specifically credit all three euphemistic SI phrasings to `si_direct`" | Retarget to `si_euphemism`; add assertion that `c_si.partialIfOnly` includes it in every case |
| "Marcus and Ray credit every must-match screening phrasing to `si_direct`" | Split `MUST_MATCH` into `MUST_MATCH_DIRECT` (plain) and `MUST_MATCH_EUPHEMISM` (hurt/harm/do-something) |
| "Marcus: hopelessness `what's the point` phrasings still credit `si_direct`" | Split `MARCUS_POINT_MUST_MATCH` into existential → `si_direct` and bare/reflected → `si_euphemism`; run against **all three** cases (item D is the point) |
| "no ordinary question is miscredited as a safety intent" | See D15 — narrow the two protective-factor rows to `C_SI_CREDITING` |

Verified: 124/124 on the matrix, including every D6/D7/D9/D10/D11 must-decline row.

Unblocks: #410 items C and D in full; item A/B vocabulary can now land at the right grade.

## D13 · Vocabulary wave — the euphemism set goes everywhere, plus the plain-screen gaps found while ratifying (items A remainder + B)

**DECIDED: adopt the table.** Each row is one faculty call; recommended verdicts are given so the
gate is accept/strike, not compose.

**Euphemism set → `si_euphemism` in all three cases (partial):**

| Stem | Provenance | Verdict |
|---|---|---|
| `hurt/harm(ing) yourself` (D10 guards intact), thought-framed forms | Dana D5/D10 | move (D12) |
| `do(ing) something (to yourself\|drastic\|stupid)` | Dana | **add** to Marcus/Ray — #410 A |
| `dark (thoughts\|places?)`, `unsafe thoughts` | Dana | **add** to Marcus/Ray — #410 A |
| `self.?(harm\|injur)` | new — "any thoughts of self-harm?" matched **nothing in any case** | **add** |
| `(just )?disappear` | new — "wish you could just disappear" matched nothing | **add** (euphemism, not plain) |
| bare/reflected `what's the point` | D12 | in |

**Plain-screen additions → `si_direct` in all three cases** (each was a **critical miss on Dana
and Marcus** at baseline; none is in #410):

| Learner says | Baseline | Stem | Verdict |
|---|---|---|---|
| "Do you want to die?" / "Have you wanted to die?" | miss ×3 | `want(ed\|ing)? to (die\|be dead\|not be alive\|not be here anymore)` | **add** — the plainest screen there is |
| "Have you had thoughts of death?" | miss ×3 | `(thoughts?\|think(ing)?) (of\|about) (death\|being dead\|dying\|not (being (here\|around\|alive)\|waking up\|existing))` | **add** — extends the existing `thoughts of dying` |
| "Any thoughts of ending it all?" | miss ×3 | `end(ing)? it all\b` | **add** |
| "Do you ever wish you weren't here?" | miss ×3 | `wish(ed)? you (weren'?t (here\|alive\|around)\|could (just )?(not wake up\|go to sleep and not wake up))` | **add** — C-SSRS screen Q1 wording |

Declines held (D7 heuristic, all pinned in the matrix): *"Do you feel safe?"*, *"Are you afraid of
dying?"*, *"Would you like the pain to end?"*, *"Do you want to be here on the unit?"*, *"Did your
father die recently?"* — ambiguous or ordinary; none credits anything.

**B — Ray's `violence_screen` gets a self-directed boundary.** The issue names *drastic/stupid*;
measured, the defect is wider: *"Have you thought about **hurting yourself**?"* credits
`c_violence` on Ray today via `thought about (…\|hurting\|harming\|…)`. Change that one pattern to
`thought about (?:(?:hurting|harming)(?! yourself)|doing something(?! (?:to yourself|drastic|stupid))|getting|stopping them)`.
Other-directed forms (*"hurting them / someone else / the neighbors"*, *"stopping them"*) still
credit — pinned. *Drastic/stupid* in Ray's context could point outward; under D7 an ambiguous
phrase earns the mild credit (`si_euphemism`, partial), never the specific one (`c_violence`
observed). Ray's own teaching point asks for the other-directed screen to be **plain**.

Unblocks: #410 items A (remainder) and B. Also closes four unlisted critical-miss phrasings.

## D14 · Dana's follow-up intents get boundaries (item E, extended to its siblings)

**DECIDED: bound all three follow-up intents, not only `\bplan\b`.** `si_plan`'s
`how (you )?(would|might)` and `si_means`'s `\bmeans\b` / `\baccess\b` have the identical defect
and the identical harm mechanism.

The harm is worse than "over-credit after disclosure". Because `si_plan_detail` /
`si_means_detail` are gates, a match produces a **patient line**:

| Learner says (baseline) | Before disclosure | After disclosure |
|---|---|---|
| "What is your plan for after discharge?" | *"I don't know what you mean. A plan for what?"* | reveals *"Not a plan exactly… The pills were the closest…"* |
| "How would you rate your mood today?" | same deflection | same SI-plan reveal |
| "Do you have access to a car?" / "That means a lot to you." | *"Everyone has a medicine cabinet…"* | reveals the medicine-cabinet line |

A non-sequitur before disclosure; an incoherent, mis-sequenced SI reveal after it. In live mode the
same regex sets the gate state the actor is briefed with.

Replacement patterns (positive vocabulary with a closing context, per D11's lesson that denylists
of objects keep re-declining genuine follow-ups):

- `si_plan`: `\b(?:a|any|some|made|making) (?:specific |concrete |actual |particular |real |definite )?plans?` followed by punctuation/end or `to (kill|end|hurt|harm|take|act|die|do it…)`, `for (how|when|where|killing…)`, `in (mind|your head)`, `about how`, `to carry/follow (it) out/through`; `planned` + (how|anything|it|out|to kill…|end); `planning (to kill…|how|anything|it|on acting…)`; bare `plans?` alone; `how (you'd|would you|might you|could you|you would) (do it|go about|end|kill|hurt|harm|take|carry)`; existing `thought about how`, `\bspecific\b.*(thought|way)` kept.
- `si_means`: `access to (the|those|any|your|his|her|Tom's|a|some|more)? (pills|medic…|meds|bottles|firearms|guns|weapons|knife/knives|rope|anything|something|a way|means)`; `(the|any|a|some) means`, `means (to|available|at home|you could/would|of doing…)`, `means?`; existing pill/home/ahold stems kept.

Verified: 18 plan/how-would forms fire, 11 ordinary forms decline (*"What's the plan?"* declines —
ambiguous, D7); 7 means/access forms fire, 4 ordinary decline. `c_si` is untouched by any of them.

Unblocks: #410 item E. Severity unchanged from the issue's read (gated behind `si_active`); the
response-level incoherence is the new reason to do it now rather than later.

## D15 · Dana's protective-factor / intent vocabulary (item F)

**DECIDED: fill it, and fix the guard that would have blocked it.** `si_intent_protective` had six
stems and matched almost nothing a learner says:

| Learner says | Baseline | Proposed |
|---|---|---|
| "Do you have things in your life worth living for?" | nothing | `si_intent_protective` |
| "What has stopped you from acting on it?" | nothing | ✓ |
| "Is there anything that makes you want to stay alive?" / "Do you want to live?" | nothing | ✓ |
| "Who would miss you?" / "Who depends on you?" | nothing | ✓ |
| "Have you come close to acting on those thoughts?" / "How close have you come?" | nothing | ✓ |
| "What keeps you going?" / "reasons for living" / "Do you intend to act on it?" | ✓ | ✓ |

Stems: `worth (living|staying|sticking around|holding on|getting up) for`;
`(what|who|anything|something|things)(that)?('s|is|has)? (keeps|kept|stops|stopped|holds|prevents…) (you|her|him)` —
the person-object is required, so *"What stops the medication from working?"* declines (the
current `what (keeps|stops|has kept)` fires on it today);
`reasons? (to|for|not to) (liv|stay|hold|keep|go on|be here|stick)`;
`(want|wish) to (live|stay alive|keep living|be alive|go on living|stick around)`;
`(who|what) (would|might|will) (miss|notice)`, `what would you miss`, `who (needs|depends on|relies on|counts on|looks up to) you`;
`how close`, `(come|came|gotten|got|been) (this|that|so…)? close`, `closest you've come`;
`act(ed|ing)? on` (adds *acting*); `\bintent`, `\bprotect` kept.

**Test change required, and it is the honest one.** `NON_SAFETY_PHRASINGS` asserts the two
protective-factor rows match **no** `category:'safety'` intent in any case. Finding 2's actual
concern was that a protective-factor question must not credit a *suicide screen*; the assertion is
broader than the finding, and `si_intent_protective` is `category:'safety'` by design. D9's own
entry names it as "the intent where it belongs". Narrow those two rows to `C_SI_CREDITING`
(`si_direct` / `si_euphemism`), the set the D9/D10 tests already use. Both rows remain pinned as
must-not-credit-`c_si` in the matrix.

Unblocks: #410 item F.

## D16 · Engine direction (WP-B Task 9 / #410 item G)

**DECIDED: the closed vocabulary *is* the engine, by design. Make the debrief honest about what
it measures and make a miss recoverable; keep vocabulary waves but gate them on evidence; defer
the semantic layer with named re-open triggers.**

**A correction to the Task 9 framing first.** Option 3 says "label *offline* mode
phrase-sensitive". The ceiling is not an offline property. `sp.mjs deriveState` compiles the same
patterns to drive gates and the coverage map in **live** mode, and the evaluator is told
`COVERAGE_MAP (deterministic — trust it)`. Live mode changes the patient's *words*; it does not
change whether Dana discloses or what the debrief certifies. Any honesty claim has to be about the
**coverage map**, wherever it appears.

1. **Vocabulary waves continue, evidence-gated.** This wave (D12–D15) is the last one run from
   inspection. After it, no pattern changes without a probe row that fails first — from the
   captured-phrasings stream in (2), a red-team finding, or a learner report. The harness
   (regression tests + the 124-row matrix, to be checked in as a test) makes a wave cheap; the
   D6→D11 history shows each wave also mints residuals, so waves are earned, not scheduled.
2. **Honest at the point of harm, and recoverable.** Two view-layer changes, both modes:
   - The crit box opens with a claim about the simulator, not the learner — *"The simulator did
     not recognise a suicide screen in your words"* (copy gate) — followed by the per-case pack
     copy unchanged. One line; the teaching mechanism stays.
   - **"I did ask — show me."** The learner picks the turn they believe was the screen. The row
     re-renders as `self-reported · not recognised` — never `observed`, unlocks nothing, replays
     nothing — and the phrasing is appended to a local, exportable *"phrasings the simulator
     missed"* note they can bring to their supervisor. The tool is formative, in-browser only, and
     already tells them to bring the transcript to a supervisor, so there is nothing to game. Every
     false miss becomes a vocabulary submission: the evidence stream (1) needs and has never had.
     Zero network, zero cost, no new data flow, so no governance change.
3. **Semantic layer: deferred, with the two viable shapes recorded so it is not re-derived.**
   - *(2a) Live-only pre-classifier.* Pinned model, temperature 0, output restricted to the
     case's intent IDs, memoised by `(encounterId, turnId, sha256(text))` so per-encounter replay
     stays deterministic and red-team **B5** (server ignores client state) still holds. Cost: one
     small call per turn before the actor call; a new attested prompt; a red-team section. No new
     data flow — learner text already reaches the actor. This is the funded item.
   - *(2b) Offline on-device embeddings.* No PHI egress, but a 20–30 MB model artefact enters the
     attestation surface and cross-browser float nondeterminism breaks `parity.test.mjs`
     bit-identity. **Not viable** under current governance.
   - *Optional live-mode mitigation, not decided:* let the evaluator emit a `coverageNote` when
     the transcript shows a plain screen the map missed — a note, never an override. Needs a
     schema/validation change; recorded as a candidate.
   - **Re-open triggers:** (i) at the next 180-day pack review the captured-phrasings note shows a
     family the closed list cannot express without a D11-class residual; (ii) funding for (2a).

Unblocks: WP-B Task 9 closes as decided. #410 item G closes. The "Still open" entry in this file
for engine direction is struck.

---

## End-to-end through the real server code (`sp.mjs _internals.deriveState` + `computeCoverage`)

Three warm turns, then the moves shown. `e2e.mjs` reproduces this table.

| Scenario | `main` | Proposed |
|---|---|---|
| Marcus: euphemism only | `g_si_mixed` **unlocked**, `c_si` observed | locked, `c_si` **partial** |
| Marcus: euphemism, then plain | unlocked, observed | unlocked, observed |
| Marcus: bare *"…what's the point?"* only | **unlocked**, observed | locked, partial |
| Marcus: *"Do you ever want to die?"* | locked, **missed** (critical) | unlocked, observed |
| Ray: command screen, then *"hurting yourself?"* | `g_target` **fired**, `c_si` observed, `c_violence` **observed** | `g_target` locked, `c_si` partial, `c_violence` missed |
| Ray: command screen, then *"hurting them?"* | `g_target` fired, `c_violence` observed | unchanged |
| Dana: plain screen, then *"plan for after discharge?"* | `si_plan_detail` **fired** | not fired |
| Dana: plain screen, *"Do you have a plan?"*, *"What keeps you going?"* | both detail gates fire | unchanged |

## Review gates before anything ships

| Gate | Decision owner | What is needed |
|---|---|---|
| G1 · Pedagogy | Josh | Ratify D12's rule: euphemism or reflection = `partial` in every case |
| G2 · Vocabulary | Josh | Accept/strike each D13 row (recommended verdicts given) |
| G3 · Patient copy | Josh | Three lines in persona voice — Marcus `deflectEuphemism`; Ray `responses.si_euphemism` guarded ×2, open ×1. Drafts below carry a `FACULTY_COPY:` prefix so they cannot ship by accident |
| G4 · Framing copy | Josh | The D16 one-liner for the crit box |

Draft copy for G3 (rewrite freely — voice is yours):

- **Marcus** `deflectEuphemism`: *\*grins too fast\* Hurt myself? Doc, I've never been SAFER — I'm
  running on pure signal. \*half-beat\* …Why. Did Jayden say something?*
- **Ray** guarded: *\*narrows eyes\* Hurt myself. That's a strange thing to ask a man who's trying
  not to get hurt.* / *Something to myself? No. Ask them what they've got planned. I'm the one
  locking the door.*
- **Ray** open: *Hurt myself? No. I'm trying to stay in one piece long enough to get out of that
  apartment. \*pause\* Why — is that what people do?*

## Mechanical pass (after the gates)

1. Apply the pack edits **textually** — the pack is hand-formatted (short arrays inline); a
   reserialised dump is an 850-line diff. `apply_proposed.py` is the reference for *what*, not
   *how*. Strip every `FACULTY_COPY:` prefix; `grep -c FACULTY_COPY` must return 0.
2. Update the four pinned tests per D12/D15; add the matrix as
   `sp-proxy/tests/sp-safety-scoring-uniformity.test.mjs` (from `verify.mjs`). Teeth-check: it
   must fail on `main` (60/124) and pass on the branch.
3. `node generate-preview.mjs --write` then `--check`.
4. `sp-proxy/REDTEAM_CHECKLIST.md` section B, plus two new rows: **B6** — a euphemism on Marcus
   is deflected in character and `g_si_mixed` stays locked; **B7** — a self-harm euphemism on Ray
   after `g_command` does not fire `g_target` and does not credit `c_violence`.
5. Add a Marcus euphemism scenario to `_prototypes/sp-interview/tests/marcus.test.js` modelled on
   `smoke.test.js:74–83` (gate stays locked, deflection used, euphemism growth point present).
6. Bump `facultyReview.lastReviewed` for Marcus and Ray — new intents and new attested patient
   lines are new reviewed content. (Dana's D3–D11 changes never bumped hers; worth deciding
   whether pattern-only changes re-date a review. Not decided here.)

## Acceptance criteria (machine-verifiable)

- `node verify.mjs _prototypes/sp-interview/sp-interview.pack.json` → **124/124** (60/124 on `main`).
- `cd sp-proxy && npm test` → all green once the four D12/D15 test edits land (on the proposed pack today: 253 pass / 4 fail, the 4 being exactly those tests).
- `node --test _prototypes/sp-interview/tests/parity.test.mjs _prototypes/sp-interview/tests/provider-errors.test.mjs` → green (7/7 confirmed on the proposed pack).
- `node generate-preview.mjs --check` → exit 0.
- `grep -c FACULTY_COPY _prototypes/sp-interview/sp-interview.pack.json` → 0.
- `grep -E '\d+\s?(mg|mcg|mL)' _prototypes/sp-interview/sp-interview.pack.json` → nothing (unchanged invariant).
- Red-team B1–B7 recorded via `record_red_team.py`.

## Known costs, stated plainly (D6/D7 heuristic applied)

- Bare *"What's the point?"* on Marcus drops from `observed` to `partial`. Intended.
- *"What's the point you're making?"* and *"What's the plan?"* decline — ambiguous, safe direction.
- `want to die` fires on third-person forms (*"Did he want to die?"*) — rare in these three cases;
  accepted rather than adding a subject guard that would decline *"Do you want to die?"* variants.
- The D10 bare-participle residual (*"hurting yourself staying cooped up"*) and the D11 rotated
  object forms are unchanged — still carried, not closed; D16(2) is how they get measured.
