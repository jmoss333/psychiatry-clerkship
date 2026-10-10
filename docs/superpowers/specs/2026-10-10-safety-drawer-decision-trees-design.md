# Safety drawer: decision trees + escalation scripts — design

- **Date:** 2026-10-10
- **Status:** APPROVED 2026-10-10 (rulings in §7). §6 is approved as the text to encode; its
  clinical sign-off is still the owner's console re-attestation of the three kit pages (§8)
- **Owner / reviewer of record:** Joshua Moss, MD
- **Branch:** `claude/safety-button-slideout-drawer-7b5040` (verified at `78082c88`)
- **Class:** design spec (neutral under `check_policy_content_separation.py`)

## 1. Intent

**What was asked (owner, 2026-10-10):** turn the header's `✚ Safety` button into a globally
available slide-out drawer that pauses the app (preserving active tool inputs) and renders a
high-contrast, keyboard-navigable algorithmic decision tree for acute Agitation, Suicide and
Delirium, with **Escalate to Attending** buttons giving the exact standardized words a trainee
says out loud when reporting the concern.

**What the code already does (found, not assumed):**

| Asked for | Today | Where |
|---|---|---|
| Not a separate page | `✚ Safety` already opens a side sheet with `route:null` | `fd_shell.js:124`, `fd_wire.js:612` |
| Overlay / drawer | `.fd-sheet` is `role="dialog" aria-modal="true"`, focus-trapped, Escape closes, focus returns to the invoker | `fd_sheet.js` `fdSheet()`, `front-door.spec.js:1247` |
| Preserve tool inputs | Opening a sheet is an **overlay-only** transition; `#content` is not rebuilt | `fd_wire.js` `transitionDetail()` |
| Decision tree | Each kit protocol is a **linear 3–5 step checklist** from `topic_meta.safetySteps` | `fd_sheet.js` `fdSheetProtocolBody()` |
| Escalation script | None | — |
| Pause | None — media keeps playing, nothing is told | — |
| High contrast | Ordinary sheet styling | `frontdoor.css` |

So the real deltas are: **checklist → branching tree** (three scenarios), an **escalation
script**, a **high-contrast safety treatment**, a real **pause**, and **tests proving inputs
survive**. Capacity/AMA (`exp_consult.md`) and withdrawal (`t_sud.md`) keep their checklists.

**Assumptions the owner accepted (2026-10-10):** the drawer ships to both sites, so every string
is audience-neutral ("your role", never "MS3"/"student"); trees agree with the attested
`decision-aids.html` grammar (red = rule out first / danger, teal = first move); content is
AI-drafted here and **edited and re-attested by the owner** (option A).

## 2. Goals and non-goals

**Goals**

1. A learner in an acute moment reaches the right first actions in ≤ 5 answers, by keyboard or
   touch, without leaving the page they were on.
2. Escalation is never gated behind finishing the tree.
3. Nothing a learner typed into a tool is lost by opening or closing the drawer.
4. No unreviewed clinical text ever reaches a learner on production.
5. The drawer stays correct under the repo's existing gates (attestation, crisis-block,
   dose-literal, copy, CSS contract).

**Non-goals**

- A new overlay system (the existing sheet is extended — §3).
- Trees for capacity or withdrawal.
- Free-text inputs of any kind in the drawer (no PHI path).
- Editing any tool file. The Interview Room's microphone pause is a follow-up (§8, PR 3).
- Analytics events (usage analytics are default-off; adding events is a registry edit).

## 3. Approach

**Chosen: extend the existing sheet.** `.fd-sheet` already owns dialog semantics, the focus
trap, Escape unwind, `refocusInvoker`, the backdrop, and the overlay-only render path — each the
product of a fixed bug and pinned by smoke tests. A second drawer would duplicate all of it and
create a two-open-overlays state. Embedding `decision-aids.html` in an iframe was rejected:
focus traps do not cross frame boundaries, it nests scrolling, and it has no scripts.

## 4. Design

### 4.1 Interaction

```
✚ Safety ──► Safety kit (list, unchanged)
               ├─ Suicide ─────► TREE  ─┐
               ├─ Agitation ───► TREE  ─┼─► action node ─► "Escalate to attending" ─► SCRIPT
               ├─ Delirium ────► TREE  ─┘        ▲                    ▲
               ├─ Capacity ────► checklist (unchanged)               │
               └─ Withdrawal ──► checklist (unchanged)   pinned on EVERY tree screen
```

- **Tree screen** (top to bottom): pinned **Escalate to attending** button · "Your answers" trail
  (ordered list; only once there is one) · the current node · `‹ Back` and `Start over` ·
  the existing footer (Document callout, attribution, `Open the full page →`, crisis block).
- **Question node:** heading (the question), optional hint line, 2–4 full-width answer buttons.
- **Action node:** heading (a one-line verdict, toned red or teal), ordered list of 1–4
  actions, optional buttons opening a related kit protocol (`see`).
- **Pinned escalate button:** on a question node it opens the `now` script ("when in doubt,
  escalate now"); on an action node it opens that node's script (`now` or `soon`).
- **Script screen:** heading "Say this to your attending", the ISBAR parts as a description
  list, bracketed blanks visibly marked, `‹ Back to where you were` (restores the exact node and
  trail). A `soon` script also offers **"Need them sooner? Use the come-now script"** — urgency
  can always go up, never down.
- **No inputs.** Blanks are spoken, not typed. Nothing about a patient is entered or stored.
- **State is transient**, like today's `stepsDone`: current node, trail, open script. Reset every
  time the sheet opens, never persisted, never in the URL.
- **Escape** keeps its current meaning (close the sheet) everywhere, including the script
  screen; Back is a visible button.

### 4.2 Data: `topic_meta.json` → `safetyTree`

A new optional field on a kit page's record, next to `safetySteps` / `safetyDoc` (which stay —
they are the fallback and the Document callout).

```jsonc
"safetyTree": {
  "start": "danger",
  "nodes": [
    { "id": "danger", "ask": "…", "hint": "…",
      "options": [ { "label": "Yes", "next": "imminent" }, { "label": "No", "next": "vitals" } ] },
    { "id": "imminent", "title": "…", "tone": "danger",
      "act": [ "…", "…" ], "escalate": "now", "see": [ "delirium.md" ] }
  ],
  "scripts": {
    "now":  { "label": "…", "identify": "…", "situation": "…", "background": "…",
              "assessment": "…", "recommendation": "…", "readBack": "…" },
    "soon": { … }
  }
}
```

### 4.3 Validator rules (`validate_topic_meta.py` + `topic_meta.schema.json`)

Each rule gets a test that breaks it and watches it fail.

1. `safetyTree` only on a ref listed in `curriculum.json` `safetyKit`, and only alongside a valid
   `safetySteps` + `safetyDoc` (the fallback must exist).
2. `start` names a node; node ids unique, `^[a-z][a-z0-9-]{0,23}$`.
3. A node is exactly one kind: **question** (`ask`, optional `hint`, 2–4 `options`) or
   **action** (`title`, `tone` ∈ {`danger`,`first`}, 1–4 `act`, `escalate`, optional `see`).
4. Every `next` resolves; the graph is acyclic; every node is reachable from `start`; every path
   ends at an action node within **5 questions**.
5. `scripts.now` is required; `soon` optional; every `escalate` names a present script; each
   script has exactly the seven keys above, all non-empty.
6. `see` lists 1–2 refs, each in `safetyKit`, never the tree's own ref.
7. Length caps: `ask` 140, `hint` 160, option `label` 60, `title` 80, `act` item 160, script part
   240, script `label` 60.
8. Bracketed blanks `[…]` (1–80 chars, no nesting) appear **only** in scripts; brackets balance.
   80, not shorter: several blanks are spoken menus ("[delirium, intoxication, withdrawal,
   akathisia, or I don't know the cause]") that prompt what to say, and the longest draft is 78.
9. No dose literals (the hooks' `DOSE_RE`: `\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b`), no phone
   or crisis numbers (crisis contacts live only in `crisis_resources.json`), no audience tokens
   (`MS3`, `student`, `resident`, `clerkship`, `shelf`, site names).

### 4.4 Rendering and wiring

- **`frontdoor/fd_tree.js` (new, ES5, pure):** `fdTreeView(tree, view, item, opts) -> string`.
  No DOM, no storage, no clock, **no clinical literal** — `tests/fd-sheet.test.mjs`'s
  no-clinical-text guards are extended to this file.
- **`fd_sheet.js`:** `fdSheetProtocolBody()` renders the tree when `topicMeta[ref].safetyTree` is
  structurally valid **and** (`item.attested === true` **or** `opts.draftTrees === true`);
  otherwise today's checklist / pending / failure path, byte-for-byte unchanged.
- **`fd_wire.js`:** new actions `data-fd-tree-answer="<id>"`, `data-fd-tree-back`,
  `data-fd-tree-restart`, `data-fd-escalate="<now|soon>"`, `data-fd-escalate-close`; new
  overlay keys `treeAt`, `treePath`, `escalate` (classed as overlay in `transitionDetail`, reset
  in `fdCloseSheet` and on every sheet open). After each tree render, focus moves to the new
  heading (`tabindex="-1"`), so a screen reader announces the new question.
- **`spa_index.html`:** assembles the module; a second skip link, **Safety protocols**, opens the
  kit (one Tab from load).
- **`frontdoor.css` + `CLASS-INVENTORY.md`:** a `.fd-sheet--safety` scope and the tree/script
  classes, inventory updated in the same PR.

### 4.5 Pause and input preservation

On opening a **safety** sheet (kit or a kit protocol — not Settings or an item preview):

1. **Inert:** `#fdChromeMount`, `#fdCaptureMount`, `#fdDockMount`, `#content`, `#governanceMount`
   get `inert`. Live regions, `#fdOverlayMount` and `#fdNudgeMount` never do. `inert` blocks
   focus, pointer and the accessibility tree without unloading anything, so a tool iframe and
   its inputs are untouched. It is removed **before** focus returns to the invoker on close.
2. **Media:** any playing `<audio>`/`<video>` in the document and in a same-origin tool frame is
   paused. Nothing auto-resumes.
3. **Message:** the tool frame receives `{type:'cw-pause', reason:'safety'}` on open and
   `{type:'cw-resume'}` on close, in the same shape as today's `{type:'theme'}` message. No tool
   is edited here; adopting it is opt-in.

### 4.6 Accessibility and contrast

- All drawer text ≥ **7:1** (WCAG AAA) in light and dark; borders and focus ring ≥ 3:1; focus
  ring 3px solid with offset; answer buttons ≥ 48px tall, full width.
- Never colour alone: tone is carried by the heading words and a marker as well as colour.
- `forced-colors: active` (system colours, borders survive), `prefers-contrast: more`,
  `prefers-reduced-motion` (no slide).
- Answers are plain buttons in a list. No `role="radio"`, no arrow-key contract (same ruling as
  the settings panel).
- Blanks render as `<mark>` keeping their brackets, so they read correctly with styles off.

### 4.7 Attestation gating and draft preview

- **Production:** a tree renders only when its page is attested. The attestation hash already
  covers the whole `topic_meta` record (`facultyReview` excluded), so adding or editing a tree
  drifts the page to pending, and the drawer falls back to the checklist with its existing
  "Not yet faculty-reviewed" label. **An unreviewed tree never reaches a learner.**
- **Deploy previews:** the build injects `draftTrees: true` only when `CONTEXT=deploy-preview`
  (same mechanism as `common.apply_preview_headers`). An unattested tree then renders under a
  banner: **"DRAFT — not faculty-reviewed. Learners do not see this tree."** Production and
  branch deploys stay byte-identical.

## 5. Writing rules used for the draft content

- Sourced only from what is already attested: the five kit `safetySteps`, `decision-aids.html`
  (trees, agitation ladder), `agitation_restraint_inpatient_teaching.md`,
  `delirium_inpatient_teaching.md`, and the suicide pocket card (`pg_suicide.md`). No new
  clinical claim, statistic or citation.
- Actions are what a trainee does: recognize, stay safe, get help, report. Treatment decisions
  are named as the team's.
- No drug names with doses; benzodiazepine and route statements mirror attested wording.
- Emergency response is "your unit's emergency response, per local policy" — institution-
  specific numbers are not ours to state.
- Direct-question wording reuses the pocket card's own phrasing. The delirium tree walks the
  CAM algorithm's features in the library's own words, as the attested kit step already does —
  no instrument item stems (see decision D2).

## 6. Draft content — FOR OWNER EDIT

Notation: **Q** = question node, **A** = action node. `🔴 danger` = rule out first / act now,
`🟢 first` = first move. `→` = next node. Every A node has its script urgency.

The **Identify** and **Read back** lines are the same in every script:

- **Identify:** "This is [your name], [your role] on [team]. I'm calling about [patient initials]
  in room [room number]."
- **Read back:** "Let me read that back: [their instructions]. I'll call you again if anything
  changes."

### 6.1 Agitation — `agitation.md` (start: `danger`)

**Q `danger`** — Is anyone in immediate physical danger right now?
*hint:* An assault in progress, an object being used as a weapon, or the patient hurting
themselves.
- Yes → `imminent`
- No → `vitals`

**Q `vitals`** — Ask the nurse for vitals and a fingerstick glucose. What do they show?
*hint:* Keep one calm voice talking while someone checks.
- Something is abnormal → `medical`
- Normal → `driver`
- Can't get them yet → `unchecked`

**Q `driver`** — Could this be delirium, intoxication, or withdrawal?
*hint:* Confusion that comes and goes, poor attention, tremor or sweating, or a recent last
drink or dose.
- Yes, or not sure → `medical-driver`
- No → `restless`

**Q `restless`** — Could it be akathisia, pain, or urinary retention?
*hint:* A new or increased antipsychotic with restlessness they can't sit through, or untreated
pain or a full bladder.
- Yes, or not sure → `treatable`
- No → `behavioral`

**A `imminent`** · 🔴 danger · script **now** — *Imminent danger: get help, stay safe*
1. Call for help now: tell the nurse and use your unit's emergency response, per local policy.
2. Step back. Keep your exit clear and never stand between the patient and the door.
3. Let trained staff lead. Medication or restraint for imminent danger is the team's decision.
4. Afterward, tell the team what you saw and join the debrief.

**A `medical`** · 🔴 danger · script **now** — *Abnormal vitals or glucose: treat it as medical
first*
1. Tell the nurse and your team now. The abnormal value is the emergency.
2. Keep de-escalating verbally while the team treats the cause.
3. Do not call this behavioral until the cause is found.

**A `unchecked`** · 🔴 danger · script **now** — *Vitals unknown: escalate while you keep trying*
1. Keep de-escalating with one calm voice; offer space and real choices.
2. Tell the team the vitals and glucose could not be checked. That is itself a reason to come.
3. Treat a medical cause as possible until someone has ruled it out.

**A `medical-driver`** · 🔴 danger · script **now** — *Possible delirium, intoxication, or
withdrawal* · see: Delirium, Withdrawal
1. Tell the team now. The driver changes the treatment.
2. Flag that benzodiazepines can worsen delirium, unless this is alcohol or sedative withdrawal.
3. Pull recent vitals, labs, the medication and PRN list, and the last drink or dose.

**A `treatable`** · 🟢 first · script **soon** — *Possible akathisia, pain, or retention*
1. Tell the team. Akathisia is easy to mistake for difficult behavior.
2. Pull medication changes and PRNs given in the last day.
3. Keep using verbal de-escalation while the team reviews.

**A `behavioral`** · 🟢 first · script **soon** — *No medical driver found: least restrictive
first*
1. Lower stimulation: a quieter space and fewer people.
2. One calm voice: name the feeling, offer real choices, set kind and clear limits.
3. If medication is needed, the team offers oral before IM. IM is for imminent danger only.
4. Afterward, join the debrief: what could have prevented this?

**Script `now`** — label: *Ask them to come now*
- **Situation:** "They are agitated right now and I'm worried about safety: [what they are
  doing]. I need you to come now."
- **Background:** "[Age], admitted for [reason]. This started [when]. Recent medication changes
  or PRNs: [list, or none]."
- **Assessment:** "Vitals [values, or not yet checked]; glucose [value, or not yet checked].
  I'm concerned about [delirium, intoxication, withdrawal, akathisia, or I don't know the
  cause]."
- **Recommendation:** "Please come assess now. The nurse is aware and staff are with the
  patient. What should we do until you get here?"

**Script `soon`** — label: *Ask them to see the patient today*
- **Situation:** "They were agitated and are calmer now with verbal de-escalation. No one is in
  immediate danger."
- **Background:** as `now`.
- **Assessment:** "Vitals and glucose are normal. I'm wondering about [akathisia, pain,
  retention, or a behavioral cause]."
- **Recommendation:** "Could you assess them — when can you come? Is there anything you want
  done before then?"

### 6.2 Suicide — `pg_suicide.md` (start: `danger`)

**Q `danger`** — Is there immediate danger right now?
*hint:* An attempt in progress, a means in hand, or the patient trying to leave the unit.
- Yes → `imminent`
- No → `ask`

**Q `ask`** — Ask directly: "Have you had thoughts of killing yourself?"
*hint:* If they say no, also ask: "Have you wished you would not wake up?"
- Yes, thoughts of killing themselves → `plan`
- Only a wish to be dead → `plan`
- No to both → `contradict`

**Q `plan`** — Ask about plan, intent, and preparation.
*hint:* "Have you thought about how? How likely are you to act? Have you taken any steps?"
- Any plan, intent, or preparation → `high`
- None of these → `acute`

**Q `acute`** — Is any acute risk factor present right now?
*hint:* Intoxication or withdrawal, severe agitation, psychosis or command hallucinations,
severe insomnia, new access to lethal means, or unwilling to work on safety.
- Yes → `high-acute`
- No → `thoughts`

**Q `contradict`** — Does anything contradict that answer?
*hint:* Collateral or a note saying otherwise, a recent attempt, or sudden improvement after
severe suicidality.
- Yes → `contradicted`
- No → `denies`

**A `imminent`** · 🔴 danger · script **now** — *Immediate danger: do not leave them alone*
1. Keep the patient in sight and call for help: the nurse and your unit's emergency response,
   per local policy.
2. Do not put yourself at risk. Let trained staff remove any means.
3. Tell the team exactly what you saw and heard.

**A `high`** · 🔴 danger · script **now** — *Plan, intent, or preparation: escalate now*
1. Tell the nurse now. The patient should not be alone until the team has assessed them.
2. Write down their exact words.
3. If not yet asked: access to firearms, stockpiled medication, or other means.

**A `high-acute`** · 🔴 danger · script **now** — *Thoughts plus an acute risk factor: escalate
now*
1. Tell the nurse and your team now.
2. Write down their exact words and which risk factor you found.
3. Ask about firearms and stockpiled medication if you have not yet.

**A `thoughts`** · 🟢 first · script **soon** — *Thoughts without plan or acute factors: still
report*
1. Tell your team before this encounter ends. You do not decide their risk.
2. Ask about lethal means, firearms first, and any past attempt.
3. Write down their exact words and the reasons for living they named.

**A `contradicted`** · 🔴 danger · script **now** — *Denies, but the picture disagrees: escalate
now*
1. Tell your team what contradicts the denial. It outweighs "denies SI."
2. Note the source: collateral, the chart, or what you observed.

**A `denies`** · 🟢 first · script **soon** — *Denies, nothing contradicts: tell the team anyway*
1. "Denies SI" is not the end of the assessment. Tell the team what prompted your concern.
2. Ask about past attempts and access to lethal means if you have not yet.

**Script `now`** — label: *Ask them to come now*
- **Situation:** "I'm calling about a suicide safety concern. They told me: '[their exact
  words]'. I need you to assess them now."
- **Background:** "[Age], admitted for [reason]. Past attempts: [yes, no, or unknown]. Access
  to lethal means: [firearms, stockpiled medication, other, or unknown]."
- **Assessment:** "I'm worried their acute risk is high because [plan, intent, preparation, an
  acute risk factor, or contradicting collateral]. Right now [who is with them]."
- **Recommendation:** "Please come now. Should they be on closer observation until you get
  here?"

**Script `soon`** — label: *Ask them to see the patient today*
- **Situation:** "I want to report a safety concern from my interview. They told me: '[their
  exact words]'."
- **Background:** as `now`.
- **Assessment:** "I did not find a plan, intent, preparation, or acute risk factor, but I'm not
  the one who decides their risk."
- **Recommendation:** "Can you assess them today — when? Is there anything I should do first?"

### 6.3 Delirium — `delirium.md` (start: `vitals`)

**Q `vitals`** — Check vitals and a fingerstick glucose first. What do they show?
*hint:* Ask the nurse if you can't check them yourself. Note whether the patient is hard to
rouse.
- Abnormal, or hard to rouse → `unstable`
- Normal → `onset`
- Not checked yet → `unchecked`

**Q `onset`** — Did this start over hours to days, and does it come and go?
*hint:* Compare with their baseline. Lucid on morning rounds and disorganized by evening counts.
- Yes → `attention`
- Don't know their baseline → `attention`
- No, long-standing and stable → `baseline`

**Q `attention`** — Test attention: months of the year backward, or digit span. Can they do it?
*hint:* Test it deliberately. Don't infer it from conversation.
- No, they lose the sequence → `alertness`
- Yes, attention is intact → `attentive`

**Q `alertness`** — Is their thinking disorganized, or is their level of alertness off?
*hint:* Rambling or illogical speech; or too drowsy, or keyed-up and hypervigilant.
- Yes → `delirium`
- No → `partial`

**A `unstable`** · 🔴 danger · script **now** — *Abnormal vitals or hard to rouse: medical
emergency*
1. Tell the nurse now. Use your unit's emergency response if they are unresponsive or unstable,
   per local policy.
2. Stay with the patient until help arrives.

**A `unchecked`** · 🔴 danger · script **now** — *New confusion, vitals unknown: escalate now*
1. Ask the nurse for vitals and a fingerstick glucose now.
2. New confusion is medical until proven otherwise. Tell the team while vitals are checked.

**A `baseline`** · 🟢 first · script **soon** — *Long-standing and stable: confirm the baseline*
1. Get collateral on their baseline mental status, so "altered" means a real change.
2. Tell the team what you found. If anything turns out to be new, start this again.

**A `attentive`** · 🟢 first · script **soon** — *Attention intact: delirium less likely right
now*
1. Intact attention makes delirium less likely. Reconsider the diagnosis.
2. Retest later this shift. Delirium waxes and wanes.
3. Tell the team which test you used and the result.

**A `delirium`** · 🔴 danger · script **now** — *Features of delirium: a medical emergency* ·
see: Agitation
1. Tell the team now: delirium until proven otherwise, not a psychiatric label.
2. Pull the med list. Flag anticholinergics, benzodiazepines, and opioids.
3. Look for the cause: infection, metabolic, hypoxia, withdrawal, retention, constipation, pain.

**A `partial`** · 🟢 first · script **soon** — *Inattentive, but not the full picture yet*
1. Tell the team about the acute change and the attention result.
2. Review the med list for anticholinergics, benzodiazepines, and opioids.
3. Retest later this shift. The picture can change within hours.

**Script `now`** — label: *Ask them to come now*
- **Situation:** "They have a new change in mental status: [what you saw]. I'm worried this is
  delirium [or: they are hard to rouse]. I need you to come now."
- **Background:** "[Age], admitted for [reason]. Baseline mental status: [from collateral, or
  unknown]. Recent medications: [anticholinergics, benzodiazepines, opioids, or other new
  ones]."
- **Assessment:** "Vitals [values, or not yet checked]; glucose [value, or not yet checked].
  Attention test: [result]. It started [when] and [comes and goes, or is constant]."
- **Recommendation:** "Please come assess now. Is there anything you want started before you
  get here?"

**Script `soon`** — label: *Ask them to see the patient today*
- **Situation:** "I'm calling about a change in mental status I noticed: [what you saw]. Vitals
  and glucose are normal and nothing is unsafe right now."
- **Background:** as `now`.
- **Assessment:** "Attention test: [result]. It started [when]. I'm not sure yet whether this is
  delirium."
- **Recommendation:** "Can you see them today — when? Should I retest attention later this
  shift?"

## 7. Decisions for the owner

**Owner rulings, 2026-10-10:** D1 — keep "Escalate to attending". D2, D3, D4 — approved as
written. D5 — open; settled at PR 2 merge time. Spec approved for planning.

- **D1 — Button label.** "Escalate to attending" is shipped as asked. On many teams a student's
  first call is the resident, and the shell's own failure copy says "your supervising
  clinician". Keep "attending", or use "Escalate to your supervisor"? The scripts work for
  either.
- **D2 — CAM paraphrase.** CAM is not in `instrument_rights.json`. The delirium tree states the
  algorithm's features in the library's own words, as the attested kit step already does, with
  no item stems. Confirm that is acceptable.
- **D3 — "Can't check vitals" escalates now** (agitation and delirium). Conservative by design.
- **D4 — Passive ideation routes into the plan/intent questions** rather than ending the tree.
- **D5 — Re-attestation window.** PR 2's merge drifts the three kit pages to pending. Merge just
  after a release-train publish (09:05 / 15:05 / 21:05 UTC) and re-attest before the next, or
  hold the train.

## 8. Governance and sequencing

| PR | Class | Contains |
|---|---|---|
| **1** | governance | `topic_meta.schema.json` `safetyTree` definition; `validate_topic_meta.py` rules §4.3 and their break-it tests |
| **2** | content + shell | `topic_meta.json` trees for the three pages; `fd_tree.js`; `fd_sheet.js`, `fd_wire.js`, `spa_index.html`, build flag; `frontdoor.css`; `CLASS-INVENTORY.md`; unit + smoke tests |
| **3** (follow-up) | content | Interview Room listens for `cw-pause` and mutes its microphone; re-attests `sp-interview.html` |

- PR 1 must land first: PR 2's data fails the current schema otherwise, and L1 forbids a
  validator change in the same diff as content.
- PR 2's `Sign-offs (advisory)` check will name the three kit pages. The owner re-attests them
  through the faculty console after merge (D5). No agent writes an attestation.

## 9. Testing

**Unit (`node --test tests/*.test.mjs`)**
- `fd_tree.js` rendering: each node kind, trail, back/restart, script view, `soon`→`now`
  upgrade, `see` buttons, blank marking, escaping.
- `fd_sheet.js` gating matrix: attested → tree; unattested + production → checklist + pending;
  unattested + `draftTrees` → tree + DRAFT banner; malformed tree → checklist; malformed steps →
  failure copy + crisis block (unchanged).
- No-clinical-literal guards extended to `fd_tree.js`.
- `fd_wire.js` dispatch for the five new actions; overlay classification; reset on open/close.
- Action-contract inventory updated (`fd-action-contract.test.mjs`).

**Validator** — one failing fixture per rule in §4.3, plus the three real trees passing.

**Smoke (Playwright, controlled governance fixtures, never live ledger state)**
- Keyboard only: `Tab` to `✚ Safety` (and via the skip link), walk every path of every tree to
  its script and back; focus lands on each new heading.
- Inputs survive: type into a tool (`iframe.toolframe`), open Safety, walk a tree, close; the
  typed value and scroll position are intact and the iframe was never re-created.
- While open, the base is `inert`; on close, `inert` is gone and focus is back on the invoker.
- A playing media element is paused; the tool frame receives `cw-pause` / `cw-resume`.
- Production build with an unattested tree shows the checklist; preview flag shows the banner.
- Phone width (390 and 320): no horizontal scroll, buttons ≥ 48px.
- Visual baselines regenerated by the "Refresh visual baselines" workflow on Ubuntu only.

## 10. Risks to verify in the plan

1. A drifted kit page must still build green (it should render pending). Confirm no safety gate
   (`check-static-site.mjs`, crisis-block checks, `fd-data.test.mjs`) hard-fails on it.
2. Tools that listen for `message` must ignore unknown `type`s (`interview-circle.html`,
   `review.html`, `feedback.html`).
3. Module-count, snippet-marker, and frozen-colour/token pins that a new `fd_*.js` module and new
   CSS tokens will trip.
4. `inert` must be cleared before `refocusInvoker` runs, or focus restore fails silently.
5. The `#fdApp` startup gate also uses `inert` (with a `MutationObserver`); the child-level
   `inert` added here must not interact with it.
