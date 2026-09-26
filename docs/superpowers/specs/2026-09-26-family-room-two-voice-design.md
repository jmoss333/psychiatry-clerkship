# The family room in the spoken Interview Room: two voices, one meeting

**Status:** design, not built. Owner decision 3 of 2026-09-26 (real-time voice design §18).
**Scope:** `family_morgan_maya_001` — Morgan (they/them, Marin) and Maya (she/her, Coral), the
shared family visit attested 2026-09-09 and hosted today in the faculty preview on the chained
pipeline. **Until this is built the learner tool shows one door card to the preview.**

## 1. Why the single-voice room cannot hold it

A real-time session is one model in one voice, pinned after its first audio (`voice` cannot change
by `session.update` once output has started). The family meeting is two people who each answer in
their own voice, one per turn, with the other listening. On the chained pipeline the preview does
this trivially: one text actor per respondent, then text-to-speech per participant. In the
real-time architecture the only faithful shape is **one realtime call per participant**, both open
for the whole meeting, with the proxy deciding who answers each turn and the browser asking exactly
one session for a response.

## 2. Shape

```text
browser ── mic track ──► call M (Morgan · marin · create_response:false)
        └─ mic track ──► call A (Maya   · coral · create_response:false)
        ◄── audio M ──── (only when M is asked to respond)
        ◄── audio A ──── (only when A is asked to respond)

learner utterance
  transcription.completed arrives on BOTH calls (same audio, two transcriptions)
  browser: POST op=turn {receipt:{morgan,maya}, items, targetRoleId, lastPatient}
  proxy:   respondent = addressed name at the start of the utterance (Maya, …) else the selected
           speaker; state = deriveState over the learner items (family engine, public channel)
           → {respondent, briefs:{morgan, maya}, state, receipts'}
  browser: to the RESPONDENT: conversation.item.create(system brief) ; response.create
           to the LISTENER:   conversation.item.create(system brief: "you are listening")
  respondent audio plays; on its transcript.done the browser sends the LISTENER a
           conversation.item.create(user, "[Morgan] <words>") so both sessions share the room
```

Rules the preview already enforces carry over unchanged and become **proxy** rules, not prompt
rules: one respondent per turn; a direct address only at the beginning of an utterance switches the
respondent; mentioning a name later does not; a "may I add something" bid from the listener is a
response the learner accepts with "Go ahead" (the proxy returns `respondent: listener` for that
turn only); the canonical identities (parent / adult daughter, pronouns) are in each session's
static instructions; the private-inventory boundary stays server-side (each session's instructions
carry only its own participant's public projection, exactly as `family.mjs` projects today).

## 3. What changes where

| Layer | Change |
|---|---|
| `sp-proxy/sp-realtime.mjs` | `op=start` accepts `participants:[morgan,maya]` for the family case, performs **two** SDP exchanges (two offers from the browser), reserves **two** ceilings in the ledger, and seals **one receipt per call**. `op=turn` takes `targetRoleId` (or none) and returns `respondent` plus a brief per participant. `op=end` hangs up both. The reaper already iterates sessions, so it needs nothing. |
| `_shared/sp-realtime-session.mjs` | `realtimeInstructions(caseDef, participant)` renders one participant's projection from `family-visit-case.mjs` (public facts, that person's portrayal, identities of both, the listening rule); `turnBrief` gains the `listening` form. Voices from the participants table (`marin`, `coral`). |
| `sp-interview.realtime.js` | A `createFamilySession` that owns two controllers, one mic stream added to both peer connections, one shared transcript with a `who` of `morgan` / `maya` / `me`, floor-taking applied to whichever session is speaking, and the listener-feed step above. Delivery evidence per session (two sinks). |
| `sp-interview.html` | The family card becomes a case card with a speaker control (Morgan / Maya) and the same consent; the debrief uses the preview's family evaluator, ported. |
| Ledger and rate card | A family start is two sessions: two reservations, two starts against the daily and half-hour caps, ≈ 1.8× the single-voice cost (both sessions transcribe every learner utterance; only one produces audio per turn). Budget table row added to §9 of the main design when built. |

## 4. Echo, turn-taking and the second voice

- With **headphones** the listener session hears nothing of the respondent's audio. With
  **speakers** the respondent's voice re-enters the shared microphone and reaches the listener
  session as input. Browser echo cancellation removes page-played audio from the mic before it is
  sent, which is what makes speakers workable in the single-voice room; the same applies here,
  and the controller's existing echo guard (a ≥3-word contiguous match against the entry that was
  speaking) is extended to match against **either** participant's last reply.
- Floor-taking is per session: a sustained learner utterance during Morgan's reply cancels, clears
  and truncates on **call M** only. The listener session has no active response to cancel.
- Turn detection runs on both sessions; the browser posts `op=turn` once per learner utterance and
  de-duplicates the two `transcription.completed` events by their shared timing window, preferring
  the respondent session's transcript. A transcript that arrives on only one session still counts.
- The listener must never speak unasked: `create_response:false` on both sessions is the whole
  guarantee, as it is today, and the browser never sends `response.create` to the listener except
  for an accepted bid.

## 5. Private check-ins

The preview supports a private channel per participant (`family-visit-state.mjs`). In real time a
private word with Morgan means: the proxy switches the channel; the browser sends Maya's session a
system item ("You have stepped out; you hear nothing until you are invited back") and **stops
feeding it** learner items and Morgan's words; on return, a system item says only that the
check-in happened. Nothing private is ever sent to the other session. This is enforceable in the
proxy (the briefs and the listener feed are per session) and in the honest client; a modified
client could copy items across sessions, which is the same class of thing it can already do with
its own transcript (main design §10) and is not a disclosure of pack content.

## 6. What it costs and what it does not solve

- ≈ 1.8× the single-voice planning figures (§9 of the main design): ≈ $0.35 per family encounter on
  the mini tier, ≈ $0.90 on the full tier; two ledger reservations per start.
- Two model voices in one room is a new fidelity question the single-voice audition does not
  answer: does Maya interrupt, does Morgan defer, do they contradict each other's facts? The
  proxy's per-turn briefs carry the shared facts to both, but consistency between two models is
  only as good as those facts. **Audition the family room in speech before learners meet it**, with
  the same spoken-fidelity scorecard proposed for Marcus and Ray.
- The preview's family room continues to work throughout; the door card in the learner tool is the
  bridge and is removed in the PR that ships this design.

## 7. Order of work

1. Proxy: two-call `op=start` / per-participant receipts / `respondent` on `op=turn` (tests: two
   exchanges, two reservations, one respondent, listener brief, both hung up on end and on expiry).
2. Session module: participant projections from `family-visit-case.mjs`, parity-pinned against the
   preview's `family.mjs` projection so the two never drift.
3. Controller: `createFamilySession` over two peer connections with a shared transcript; unit tests
   with two fake peers (address switch, bid and "go ahead", floor-taking on the right call,
   listener feed, headphones vs speakers echo guard, private check-in feed stop).
4. Tool: family card with speaker control; browser suite with two fake channels.
5. Audition in speech; then the door card comes out.
