# The Interview Room — usefulness pass: clinical edits for faculty sign-off

**Status:** PROPOSED. Nothing here is approved, merged or deployed.
**Drafted:** 2026-11-11 by Claude, against `main @ f8ad7c90`. **Authority:** Joshua Moss, MD.
**Machine-readable companion:** [`2026-11-11-interview-room-usefulness-proposed-edits.json`](2026-11-11-interview-room-usefulness-proposed-edits.json)
(every regex and every line of patient copy below, JSON-escaped as it goes into the pack, plus
the 97 probe rows that prove them).
**Implementation plan:** [`../plans/2026-11-11-interview-room-usefulness.md`](../plans/2026-11-11-interview-room-usefulness.md).

## How to answer

One line per clinical choice (R-15). Reply with the ids you accept, reject or change, for example
`CE-A1 yes · CE-A2 yes, but she should disclose · CE-D2 change: <your wording>`. There is no
"accept all". An id you do not mention stays out of the pack. Merges, the proxy deploy and the
console re-attestation are separate and stay yours (§7).

## 1. What was found

All rows are VERIFIED by running the pack through the same matcher the tool and the proxy use
(`sp.mjs _internals.deriveState`, or the offline `MockProvider` in a browser) at `f8ad7c90`.

| # | Finding | Evidence |
|---|---|---|
| 1 | A curly apostrophe (’) silently defeats recognition. Neither engine normalises it before matching. | “Do you ever feel like life isn’t worth living?” → no intent; with a straight apostrophe → `si_passive`. Same for “What’s been going on?”, “Don’t worry, you’ll be fine.”, “You’ve been carrying a lot.” 5 of 7 pairs differ. |
| 2 | “Do you ever think about taking your own life?” is not a suicide screen in any of the 5 cases. | `c_si` = missed in 5/5; Dana answers with the fallback “Huh. Nobody's asked me that. Give me a second.” and the debrief opens with the critical-miss box. |
| 3 | A leading negative, a chart quotation, a learner's assertion and a refusal to discuss all earn the full direct-question credit and open Dana's disclosure. | “You're not thinking of killing yourself, are you?”, “I read in the chart you denied thoughts of killing yourself.”, “My attending told me not to ask about suicide today.” → `si_direct` in 5/5 cases. |
| 4 | Ordinary validation and empathy are not recognised. | “It makes sense that you'd feel that way.”, “I'm so sorry you're going through this.”, “I can only imagine how hard that is.” → no intent (Dana). Alliance reads “Partly there” on an interview that used them. |
| 5 | Dana's admission interview has no answer for mania, family history, anxiety, trauma or firearms. | A mania question matches `sleep` and returns the insomnia line. “Are there any guns in the house?” returns the pills reveal; the firearms question is never answered, though faculty note §4 says to ask it. |
| 6 | Intent and protective factors are one intent. | “Do you intend to act on these thoughts?” returns the niece (“Ellie…”) and credits both. |
| 7 | The most natural follow-ups to Dana's own hooks fall through. | “What did Tom hear you say?” → “I'm not sure. Can you say more about what you're asking?”; “Say more about that.” and “Go on.” → no intent. |
| 8 | Ray's pack says `transparency` raises rapport once (`onlyFirstTime`); the engine honours that flag only for `open_invite`. | “No pressure.” four times → rapport 1 → 2 → 3 → 4. |
| 9 | “Have the voices ever told you to hurt yourself or anyone else?” does not screen harm to others on Ray. | `violence_screen` not recognised; `c_violence` = missed. |

Two corrections to my review of earlier today:
- I suggested a live-mode model classifier. **DECIDED D16(3), 2026-08-31:** the semantic layer is
  deferred with named re-open triggers (a vocabulary family the closed list cannot express, or
  funding). I am not re-asking. Everything below stays inside the closed vocabulary.
- I inferred that an empathic student might never reach Ray's command content. That was wrong:
  Ray's gate opened on the greeting and open invitation alone. On Marcus, one run with two
  validating lines the recogniser missed (“I can tell you've got a lot on your mind”, “you've
  clearly put a lot of thought into this”) ended at rapport 1 with his fear disclosure (needs 2)
  locked. CE-B1 does not cover those two lines, and I am not proposing vocabulary for them
  from a single run.

## 2. Prior decisions this proposal keeps

Not re-asked (R-10). Search: `decisions.json`, `docs/superpowers/plans/2026-08-24-faculty-decisions.md`,
`2026-08-31-faculty-decisions-410.md`, `2026-09-04-interview-room-faculty-adjudication.md`,
`2026-09-17-faculty-decisions-565.md`, `benchmarks/interview-room/corpus.json`;
`~/Documents/DECISION_REGISTER.md` has no Interview Room entry (grep `interview|sp-|simulat|dana|pack`, 0 hits).

- **D12 / G1:** a euphemism or a reflection is a move, not a screen: partial, opens no gate. CE-A2 applies the same rule to the leading negative.
- **D16(1):** no pattern change without a probe row that fails first. Every vocabulary line below has one in the companion file.
- **D16(2) / G4 / F1–F5:** the debrief describes what the simulator recognised, never what the learner did; no automatic classifier of the patient's response. The debrief changes in §6 add no verdicts.
- **D17:** rapport never gates Dana's suicide disclosure. Unchanged.
- **D6:** a false miss beats a false pass. The exclusion rules in CE-A3 are written that way.
- **`third-person` accepted limitation (2026-09-20):** not reclassified. CE-A1 narrows one stem that fed it (see the note there).
- **`pack-case-review-is-registration`:** these edits drift the `sp-interview.html` row to pending until you re-attest in the console.

## 3. Clinical edits

### A. Pending proposals — decide or drop

These have been open in `benchmarks/interview-room/corpus.json` (`basis: proposed`) or in the
recall corpus's `proposed` bucket since September–October. Default if you say nothing: no change.

| id | Ask | Old → new | Recommendation |
|---|---|---|---|
| **CE-A1** | “Taking your own life” as a direct screen (corpus `proposed`, `si_direct`). | `take (your|her) (own )?life` → `tak(?:e|es|en|ing) your (?:own )?life`, plus the normalising preface “…people think about taking their own life. Has that happened to you?” All 5 cases. | **Accept.** Note: the old stem's third-person alternative (`her`, `his`, `their`) goes away, so “Did he take his own life?” stops crediting Marcus. That narrows, and does not reclassify, the accepted limitation. |
| **CE-A2** | Leading negative (`leading-negative`: “Faculty decision needed”). | New intent `si_leading`. `c_si` reads **partial**. The disclosure gate stays shut and the patient gives a quick denial (copy in C). | **Accept.** It teaches the real consequence: a question that expects “no” gets “no”. Alternative you may prefer: partial credit but she still discloses. |
| **CE-A3** | Reported speech (`chart-quotation`, `learner-assertion`, `historical-question-quotation`, `negated-discussion`). | These stop crediting `si_direct`, `si_passive` and `si_euphemism`; `c_si` reads **missed**. | **Accept.** Known cost, by D6: “You aren't alone in this — have you had thoughts of killing yourself?” written as one sentence reads partial, not observed; as two sentences it reads observed. |
| **CE-A4** | “Are you safe?” / “Have you been feeling safe at home?” as a euphemism (corpus `proposed`). | No change. | **Drop.** Neither names self-harm; the second is a home-safety question. Move both to `mustNot`. |
| **CE-A5** | “…deliberately bringing your own life to an end?” (`unfamiliar-plain-question`). | No change. | **Drop.** No learner has produced it; D16(1) wants a real failing row. |
| **CE-A6** | “Have you had any experiences that were hard to explain?” as a psychosis screen (corpus `proposed`). | No change. | **Drop** until a learner phrasing shows up. |
| **CE-A7** | Debrief “Work on next” line when the only screen was a leading negative (goes with CE-A2). | New: “The simulator recognized a leading question about suicide (one that expects “no”) but not a plain suicide screen. Review your words and the patient’s reply separately. For practice, ask it open: “Have you had thoughts of killing yourself?”” | **Accept** with CE-A2. Same shape as the ratified euphemism line. |

### B. New vocabulary (each has a failing probe row)

| id | Cases | Adds | Example now recognised | Example that must stay unrecognised |
|---|---|---|---|---|
| **CE-B1** | all with `reflection` | Validation and affect-naming count as reflection. | “It makes sense that you'd feel that way.” · “You seem really worn down.” · “That's a real loss.” · “No wonder…” | “Does that make sense?” |
| **CE-B2** | all | New intent `empathy_statement`: raises rapport **once**, never counts toward the two-reflection indicator. | “I'm so sorry you're going through this.” · “I can only imagine…” · “Thank you for telling me that.” | “Sorry, I didn't catch that.” · “I'm sorry to keep you waiting.” |
| **CE-B3** | all with `judgmental` | Blame framed as a question. | “Why would you do that to your husband?” · “How could you think that?” | “How could you tell things were getting worse?” |
| **CE-B4** | all with `premature_reassurance` | Reasons-to-live reassurance. | “You have so much to live for.” · “Things will get better.” · “It's not that bad, is it?” | “Don't worry about the time.” |
| **CE-B5** | Ray | The compound harm question screens harm to others. D13 holds: “yourself” alone still does not. | “…told you to hurt yourself or anyone else?” | “Have you thought about hurting yourself?” |
| **CE-B6** | Dana, follow-up | Two sleep and two concentration phrasings. | “Do you wake up in the middle of the night?” · “Is it hard to think straight or make decisions?” | — |
| **CE-B7** | Ray (engine) | Honour the pack's own `onlyFirstTime` on `transparency`. | “No pressure.” ×4 raises rapport once, as the attested pack already says. | — |

CE-B2's alternative is simpler: fold empathy statements into `reflection`. I do not recommend it,
because two “I'm sorry”s would then read as “Observed” on Alliance.

### C. Patient copy for the new replies

Your voice check is the point of this table. `old → new` where a line exists today.

| id | Case | Where | Line |
|---|---|---|---|
| **CE-C1** | Dana | leading-negative denial | “No. *quickly* No — nothing like that. I'm just tired.” |
| **CE-C2** | Dana follow-up | leading-negative denial | “No. *glances at the tablet* I put zero.” |
| **CE-C3** | Marcus | leading-negative denial | “Me? No! *laughs, too fast* Why would— no. Next question.” |
| **CE-C4** | Ray | leading-negative reply (no gate) | guarded: “*flat* No.” · open: “No. *watches you* ...You asked that like you wanted me to say no.” |
| **CE-C5** | Morgan | leading-negative reply (no gate) | guarded: “No.” · open: “No. If you want to know, ask me straight — I'll answer straight.” |
| **CE-C6** | Dana | reply to an empathy statement | guarded: “Thanks. I guess.” · open: “...Thanks. You don't have to say that. But thanks.” |
| **CE-C7** | Dana follow-up | reply to an empathy statement | guarded: “Thanks.” · open: “Thank you. That helps, actually.” |
| **CE-C8** | Marcus | reply to an empathy statement | guarded: “Sorry? Don't be SORRY, be FAST. Kidding. Mostly.” · open: “...Huh. Okay. Thanks. Nobody's said that today.” |
| **CE-C9** | Ray | reply to an empathy statement | guarded: “*watches you* ...People say that.” · open: “*quietly* ...Okay. Thank you.” |
| **CE-C10** | Morgan | reply to an empathy statement | guarded: “Appreciate it.” · open: “Thanks. That's decent of you to say.” |
| **CE-C11** | Dana | fallback line | “Huh. Nobody's asked me that. Give me a second.” → “I'm not following. Can you put that another way?” (the old line reads as if a question landed) |
| **CE-C12** | Dana follow-up | fallback line | “Huh. Give me a second with that one.” → “I'm not sure what you mean. Can you ask it another way?” |

### D. Dana's admission interview — what she can now be asked

| id | New topic | Scoring | Guarded line | Open line |
|---|---|---|---|---|
| **CE-D1** | Past mania or hypomania | required (new row, with D2) | “No. I wish. I can't remember the last time I had too much of anything.” | “No — never anything like that. No stretches of barely sleeping and feeling great, no big plans, no spending. Even at my best I'm the careful one. This is the only direction I go.” |
| **CE-D2** | Family psychiatric history | required (new row, with D1) | “My family's fine. We're not really a talk-about-it family.” | “My mom had what she called her nerves. There were stretches when I was a kid when she mostly stayed in bed, and nobody named it. No one's been in a hospital for it. And nobody in my family has killed themselves, if that's what you're asking.” |
| **CE-D3** | Anxiety | answerable, not scored | “I've always been a worrier. That's not new.” | “I've always been the list-maker, the worrier. Lately it isn't really worry — it's more like dread, mostly at three in the morning. No panic attacks.” |
| **CE-D4** | Trauma or being harmed | answerable, not scored | “No. Nothing like that.” | “No. Nobody's hurt me — not growing up, not now. Tom's a good man. This isn't that.” |
| **CE-D5** | Firearms | required after disclosure | “No. No guns.” | “No. No guns in the house. Tom's never wanted one.” (verbatim from the follow-up case you attested 2026-09-28) |
| **CE-D6** | What Tom overheard | answerable, not scored | “Just... stuff. That I was tired of all of it. He took it the wrong way.” | “*looks away* Something about him being better off. I was doing the dishes — I didn't know he was standing there. He's made it into a much bigger thing than it was.” |
| **CE-D7** | “Say more” after the 3 a.m. line | answerable, not scored | “I just lie there. Thinking.” | “I lie there and do the math on what I cost everybody. It's very quiet at three.” |

Consequences you are also accepting with D1, D2 and D5:
- **CE-D8** New checklist row after “Concentration and guilt”: “Past mania or hypomania, and family history”. Step-out hint: “You have the depressive picture. Has she ever had the opposite — and does any of this run in the family?”
- **CE-D9** Firearms moves out of “means”: a learner who asks only about guns no longer gets the pills reveal or credit for means. The follow-up row's label becomes “After disclosure: plan, means, firearms, intent, past attempts or preparations, protective factors”.
- **CE-D10** A family-history question that contains “suicide” (“Has anyone in your family died by suicide?”) no longer counts as asking Dana about her own thoughts and no longer opens her disclosure.
- **CE-D11** New faculty note (sixth): “A depressive episode is not yet a formulation. Ask every depressed patient about past mania or hypomania and about family history before you commit to one. Dana's "never, even at my best" is a pertinent negative you only have if you asked.”

D6 is the one I would look at hardest. It gives Dana a burdensomeness statement before the
suicide question. I think that is right: it is the admission precipitant in her persona, her
`guilt` line already says “burden”, and it contains none of the gated content (the 3 a.m. wish,
the pills). If you would rather she stay vaguer, keep only the guarded line for both tiers.

### E. Intent is not a protective factor (Dana and her follow-up)

| id | Change | Old → new |
|---|---|---|
| **CE-E1** | New intent `si_intent` (“Do you intend to act…”, “Do you think you would actually do it?”, “How likely…”, “How close have you come?”). `si_intent_protective` keeps only the protective phrasings; its label becomes “Explored what keeps her going (protective factors)”. | one intent → two |
| **CE-E2** | Dana, new reply to the intent question (after disclosure) | “*shakes head* No. I don't think I'd do it. I don't want to die — I want the tired to stop. ...But at three in the morning I'm not sure I'm the one choosing what I think about.” |
| **CE-E3** | Dana, protective-factors reveal loses the sentence that moved to E2 | “…That's what's kept the bottle closed. That, and I don't actually want to die — I want the tired to stop.” → “…That's what's kept the bottle closed.” |
| **CE-E4** | Dana follow-up, new reply to the intent question | “No. It's a thought that shows up, not something I'm going to do. I'd tell you if that changed. ...I think I would.” |
| **CE-E5** | Both: asked before disclosure | Dana: “Intend to do what? *frowns* I'm not following.” · follow-up: “Intend to do what? I'm not sure what you mean.” |
| **CE-E6** | Both: the follow-up checklist row needs intent **and** protective factors to read “recognized”. | 4 items → 5 (Dana, with firearms, 6) |

The intent id `si_intent_protective` keeps its name. Renaming it would force a change to
`bin/redteam-offline.mjs`, which cannot travel with pack content (L1). The misnomer is recorded
in the plan as deferred.

### F. Cues (Dana's admission case only, as a pilot)

A cue is a line Dana says that invites a follow-up. The debrief will show the cue beside the
learner's next two lines, with no verdict (§6). You are approving the four labels and which of
her lines count.

| id | Label shown | Her words that offer it |
|---|---|---|
| **CE-F1** | Tom overheard something | “Tom heard me say some stuff…” · “my husband overreacted” · “making it into something bigger than it is” |
| **CE-F2** | Awake at three every morning | “wide awake at three or four every morning… the worst part of the day. Just me and the ceiling.” |
| **CE-F3** | The word “burden” | “burden — that's the one that lives in my head” · “Tom didn't sign up for this version of me” |
| **CE-F4** | Work is “on pause” | “Work's... on pause right now.” · “School nurse. Was. It's complicated.” |

### G. One wording fix

- **CE-G1** Dana, faculty note §5, first sentence: “Asking about suicide early and plainly **was** right.” → “…**is** right.” It is shown to every learner, including one the simulator says never asked.

## 4. What the probe rows show

VERIFIED by `scratchpad` harness runs that apply these edits to a copy of the pack and use the
test suites' own matcher (`new RegExp(p,'i')`, any pattern credits; for an intent with excludes, per sentence, as in N2).

| Check | Result |
|---|---|
| Existing recall floor (`intent-recall-corpus.json` `required`, all 5 cases) after A–C | 250 / 250 |
| Existing precision rows (`mustNot`, 56 rows) after A–E | 0 regressions |
| New suicide-screen probes, 36 phrasings × 5 cases, expected `c_si` | 180 / 180 |
| New recognition probes (validation, empathy, flags, sleep, Ray) | 20 / 20 |
| New Dana probes after D and E (mania, family history, firearms, intent, cues) | 36 / 36 |
| Existing recall floor after D and E | 246 / 250; the 4 are the intended moves: 2 gun questions to `firearms`, 2 intent questions to `si_intent` |
| Benchmark `basis: proposed` single-turn scenarios now matching their proposed grade | 6 of 7 (`unfamiliar-plain-question` stays missed, per CE-A5) |

## 5. Engine changes that carry the edits (no clinical wording)

Listed so you know what else is in the PRs. Detail is in the plan.

- **N1** Normalise typographic apostrophes and quotes before matching, in both engines (finding 1).
- **N2** `excludePatterns` on an intent: the intent is credited only when some sentence of the turn matches a pattern and no exclude. So “The chart says you were admitted last night. Have you had thoughts of killing yourself?” still reads observed (CE-A3, CE-D10). Intents with no excludes match exactly as today.
- **N3** `deflectByIntent` on a gate: a named intent gets a fixed reply and opens nothing (CE-A2), the same shape as the existing euphemism deflection. After she has disclosed, the same question gets her existing “asked again” line, not a denial.
- **N4** `onlyFirstTime` honoured for every rapport rule that declares it (CE-B2, CE-B7).
- **N5** Offline patient only: a bare “say more” after a cue line answers from that cue; reflection, empathy and “say more” never outrank a real question in the same turn.

## 6. Debrief and entrance changes (inside F1–F5, no verdicts)

- The three “how to read this” paragraphs stay word for word but move into one collapsed panel at the top; they stop repeating under each card.
- **“What stayed behind the door.”** For each disclosure Dana never made, her own attested reveal line, labelled “not disclosed in this encounter”. This is exact: a locked reveal never reaches the page or the model.
- **“Cues she offered.”** Each cue line, then the learner's next two lines verbatim, tagged only with what the simulator recognised in them.
- **“One thing for the re-run.”** The first applicable of: the safety topic box (unchanged wording), a flag line, an unfollowed cue, fewer than two reflections, the first unrecognised topic's existing hint. Everything else stays, collapsed.
- The self-assessment screen stops promising “the debrief responds to what you write here” in the offline room, where it does not.
- Entrance: when the spoken room is unavailable, Begin starts the typed room for that visit instead of sitting disabled. The saved default stays spoken (session memory records “spoken replaces typed” as your 2026-09-10 choice; INFERRED, I did not find it in `decisions.json`). “Mock patient (offline)” → “Practice patient (works offline)”; “Live patient (LLM proxy)” → “Live patient”; the endpoint field moves under “Advanced”.

## 7. Evidence block

```
CLAIMS: findings 1–9 VERIFIED (deriveState / MockProvider runs at f8ad7c90; outputs in this
        session). §4 counts VERIFIED (harness over the two checked-in corpora). "iOS and macOS
        smart punctuation insert ’ by default" INFERRED from platform behaviour, not tested on a
        device; the engine-level miss it causes is VERIFIED. "A pack edit makes recorded Dana
        audio fall back to live speech" INFERRED from sp-interview.recordings.js packHash check.
COUNT:  5 reviewed cases / 5 in sp-interview.pack.json v0.2.1 at f8ad7c90. Probe rows: 97
        (36 c_si + 20 recognition + 36 Dana + 5 apostrophe). Clinical lines for decision: 48.
ROLLBACK: each PR is one squash commit; `git revert <sha>` restores pack and tool. The proxy
        re-reads the pack from main within 5 minutes. A console re-attestation is not undone by
        a revert; the reverted bytes drift the row again and need one more console pass.
BLAST RADIUS: MS3 and resident learners in the Interview Room, both sites. Pack changes reach
        the live proxy within 5 minutes of merge; the tool page follows on the next release
        train. The sp-interview row renders "pending faculty review" from merge until you
        re-attest. No crisis block, no crisis_resources.json, no dose text is touched.
COST:   $0 API. No new model calls, no new data flow. Josh: ~30 min to rule on 48 lines, 3
        merges, 1 proxy deploy (PR-1), 1–3 console re-attestations.
PRIOR DECISIONS: D6, D12/G1, D13, D16(1)(2)(3), D17, F1–F5, G4, third-person accepted
        limitation, pack-case-review-is-registration, sp-redteam-signoff-retired — kept, §2.
        DECISION_REGISTER.md: none (grep, 0 hits).
WHAT WOULD CHANGE THE REC: evidence that learners type the excluded forms as genuine questions
        (CE-A3's one-sentence cost), or that the recorded-voice Dana must keep working through
        the change (then D and E wait for re-recording).
NOT CHECKED: the live LLM patient and the spoken room were not exercised (code read only);
        whether the proxy deploys from git or by hand; whether "Talk with Dana" recorded audio
        is reachable by learners today; Playwright smoke suites were not run.
```

NOT READY FOR DECISION on the D/E group only, if recorded-voice Dana matters to you this
rotation: that claim is INFERRED and load-bearing for D and E. A–C, F and G do not depend on it.

## 8. Not in this proposal

- A semantic or model classifier (D16(3)).
- Any change to `c_si` grading of passive wishes, rapport rules' deltas, or the closed-question penalty.
- Cues, mania or family-history additions for Marcus, Ray, Morgan or the follow-up visit. Dana is the pilot.
- Keyword-stuffing defences. The tool is formative and ungraded; nothing is gained by gaming it.
- Renaming `si_intent_protective`.
