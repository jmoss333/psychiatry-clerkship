# Hosted Station Slice 1, PR B — One-Moment Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner re-ask one earlier moment of a finished hosted encounter and hear Dana's alternative reply, grounded in only the information heard at that exact earlier moment, without weakening the anti-replay control.

**Architecture:** A third server action beside `start` and `turn`. The client presents its **current, unconsumed** receipt plus a `turnId`; the server derives a child session by truncating the stored history, minting a fresh `sid`, and running the existing turn path unchanged. The client shows the original moment beside the alternative and never re-sends after a provider failure.

**Tech Stack:** Node 22 ESM for the Function (`sp-preview/lib/`), vanilla browser JavaScript (UMD, ES5-compatible) for `sp-preview/public/`, `node:test`, AES-256-GCM via `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-09-06-hosted-station-slice-1-design.md`

## Global Constraints

- The receipt *is* the state. Never accept a receipt whose `(sid, nonce)` pair has already been consumed — that is what `preview_operation_mismatch` exists to say. A retry presents the **latest** receipt, never an earlier one.
- The actor must receive only the truncated history. Nothing from turn `turnId` or later may reach the provider on a retry.
- One alternative per encounter, enforced in the sealed receipt so it survives a page reload.
- Budget: a retry reserves **3 units**, the same as a turn. Do not change the ceilings (72 per rolling 30 minutes, 120 per deployment).
- No new browser storage, no transcript export, no change to the published-file allowlist (it stays at the five files PR A established).
- Do not change clinical content, the safety overlay, the pack, or attestation status.
- Error copy must stay in the existing `safeMessage` vocabulary; no raw provider errors reach the browser.
- Commit after each task. Run `npm --prefix sp-preview test` before every commit.

## Interfaces produced by PR A that this plan consumes

- `controller.getSnapshot().messages[i].segments: string[]` — segment texts for a dana message.
- `DanaStation.stationSnapshot(hosted)` — hosted snapshot to station shape.
- `DanaStation.createStation(env, host, {caseId, content})` returning `{update, dispose, getPresentation, getReflections, getBookmarks}`.

---

### Task 1: Seal the one-retry cap into the receipt

Before any retry can run, the state must be able to say whether an alternative has already been spent. Doing this first means every later task inherits the cap rather than bolting it on.

**Files:**
- Modify: `sp-preview/lib/state.mjs`
- Test: `sp-preview/tests/handler.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `codec.open` accepts `retried` when present and requires it to be exactly `true`; `initialState` omits it; `issuedState` carries it forward unchanged.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/handler.test.mjs`:

```js
test('a receipt may record that its one alternative is spent, and rejects any other value',()=>{
  const codec=createStateCodec({key:KEY,binding:BINDING});
  const base=initialState('Opening line.');
  assert.equal(codec.open(codec.seal(base)).retried,undefined,'a fresh encounter has spent nothing');
  const spent={...base,retried:true};
  assert.equal(codec.open(codec.seal(spent)).retried,true);
  for(const bad of [false,1,'true',null,{}])
    assert.throws(()=>codec.open(codec.seal({...base,retried:bad})),error=>error.code==='preview_state_invalid',String(bad));
});

test('an issued state carries the spent flag forward so a reload cannot restore the alternative',()=>{
  const spent={...initialState('Opening line.'),retried:true};
  const next=issuedState(spent,[...spent.history,{who:'me',text:'A question'}],'A reply.',['A reply.']);
  assert.equal(next.retried,true);
});
```

If `KEY`, `BINDING`, `createStateCodec`, `initialState` or `issuedState` are not already imported at the top of `handler.test.mjs`, add them from `../lib/state.mjs`, matching the existing import style in that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/handler.test.mjs`
Expected: FAIL — the codec accepts `retried:false` and every other value, because it validates only the keys it knows.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/lib/state.mjs`, inside `open`, add one clause to the validation chain immediately before the `throw bad()`:

```js
      ||(Object.hasOwn(value,'retried')&&value.retried!==true)
```

`initialState` needs no change — a fresh encounter simply has no `retried` key. `issuedState` already spreads `...previous`, so the flag propagates without edit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/lib/state.mjs sp-preview/tests/handler.test.mjs
git commit -m "feat(sp-preview): let a receipt record that its one alternative is spent"
```

---

### Task 2: Derive the child state for a retry

The pure derivation, tested without a handler or a provider. This is where the "only what was heard at that exact earlier moment" guarantee is actually made, so it gets its own task and its own tests.

**Files:**
- Modify: `sp-preview/lib/state.mjs`
- Test: `sp-preview/tests/handler.test.mjs`

**Interfaces:**
- Consumes: `retried` validation from Task 1.
- Produces: `retryState(state, turnId, sid)` returning a new state with a fresh `sid`, `turn: turnId - 1`, history truncated to `turnId*2 - 1` entries, `segments` and `completed` reset to the truncated tail, `retried` **absent** (it is set on the issued state, not the child input), and the parent `expires` preserved. Throws `preview_input_invalid` for a `turnId` outside `1..state.turn`, and `preview_encounter_finished` when `state.retried` is already true.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/handler.test.mjs`:

```js
function encounterOfThree(){
  let state=initialState('Opening line.');
  for(const [question,reply] of [['Q1','R1 first. R1 second.'],['Q2','R2 only.'],['Q3','R3 only.']]){
    const history=nextHistory(state,{text:question,previousPlayback:'played',previousCompletedSegments:state.segments.length});
    state=issuedState(state,history,reply,reply.includes(' R1 second.')?['R1 first.',' R1 second.']:[reply]);
    state={...state,completed:state.segments.length};
  }
  return state;
}

test('a retry truncates history to everything before the chosen question',()=>{
  const parent=encounterOfThree();
  const child=retryState(parent,2,'a'.repeat(32));
  assert.equal(child.turn,1);
  assert.equal(child.history.length,child.turn*2+1,'the codec length invariant holds by construction');
  assert.deepEqual(child.history.map(entry=>entry.text),['Opening line.','Q1','R1 first. R1 second.']);
  assert.equal(child.history.some(entry=>entry.text==='Q2'),false,'the question being retried is not in the child history');
  assert.equal(child.history.some(entry=>entry.text==='R2 only.'),false,'nor is any later reply');
});

test('a retry gets its own session id and keeps the parent expiry',()=>{
  const parent=encounterOfThree();
  const child=retryState(parent,3,'b'.repeat(32));
  assert.equal(child.sid,'b'.repeat(32));
  assert.notEqual(child.sid,parent.sid,'a child cannot share the parent ledger identity');
  assert.equal(child.expires,parent.expires);
  assert.equal(child.retried,undefined,'the flag is set on the issued state, not on the child input');
});

test('a retry presents only what was heard at that earlier moment',()=>{
  let state=initialState('Opening line.');
  // Turn 1's reply is interrupted after the first of two segments.
  let history=nextHistory(state,{text:'Q1',previousPlayback:'played',previousCompletedSegments:1});
  state=issuedState(state,history,'Heard part. Unheard tail.',['Heard part.',' Unheard tail.']);
  state={...state,completed:1};
  history=nextHistory(state,{text:'Q2',previousPlayback:'interrupted',previousCompletedSegments:1});
  state=issuedState(state,history,'R2.',['R2.']);
  state={...state,completed:1};
  const child=retryState(state,2,'c'.repeat(32));
  const reply=child.history.at(-1);
  assert.equal(reply.text,'Heard part.','the unheard tail is not replayed to the actor');
  assert.equal(reply.omittedTail,true);
  assert.equal(reply.playbackStatus,'played');
});

test('an out-of-range turn or a spent alternative is refused before any work',()=>{
  const parent=encounterOfThree();
  for(const bad of [0,-1,4,1.5,'2',null,undefined])
    assert.throws(()=>retryState(parent,bad,'d'.repeat(32)),error=>error.code==='preview_input_invalid',String(bad));
  assert.throws(()=>retryState({...parent,retried:true},2,'d'.repeat(32)),error=>error.code==='preview_encounter_finished');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/handler.test.mjs`
Expected: FAIL — `retryState is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `sp-preview/lib/state.mjs`:

```js
// A retry is a child session, not a replayed receipt. The parent's own history
// already records what was HEARD rather than what was generated — nextHistory
// rewrites each patient entry to its completed segments and marks omittedTail —
// so truncating it is exactly "only the information heard at that moment".
export function retryState(state,turnId,sid) {
  if(state.retried===true)throw problem(409,'preview_encounter_finished');
  if(!Number.isInteger(turnId)||turnId<1||turnId>state.turn)throw problem(400,'preview_input_invalid');
  const history=structuredClone(state.history).slice(0,turnId*2-1);
  const tail=history.at(-1);
  const child={...state,sid,nonce:randomBytes(16).toString('hex'),turn:turnId-1,history,segments:[tail.text],completed:1};
  // The key is DELETED, not set to undefined: codec.open uses Object.hasOwn, and
  // a sealed `undefined` does not survive the JSON round trip as an absent key.
  delete child.retried;
  return child;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/lib/state.mjs sp-preview/tests/handler.test.mjs
git commit -m "feat(sp-preview): derive a retry child from the truncated heard-only history"
```

---

### Task 3: The `retry` action in the handler

**Files:**
- Modify: `sp-preview/lib/handler.mjs:33-41`
- Test: `sp-preview/tests/handler.test.mjs`

**Interfaces:**
- Consumes: `retryState` from Task 2.
- Produces: `POST` body `{action:'retry', state, turnId, text, previousPlayback, previousCompletedSegments}`; response identical in shape to a `turn`; the issued receipt carries `retried:true`.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/handler.test.mjs`, following the existing helpers in that file for building a request and reading the NDJSON stream:

```js
test('a retry sends the actor the truncated history and nothing from the retried turn onward',async()=>{
  const seen=[];
  const handler=createHandler({env:ENV,budget:freshBudget(),
    provider:{configured:true,replyStream:async({messages})=>{seen.push(messages.map(m=>m.content).join('\n'));return 'An alternative reply.';},speak:async()=>MP3}});
  const parent=await runEncounter(handler,2);           // opening plus two turns
  const body={action:'retry',state:parent,turnId:2,text:'A different way of asking',previousPlayback:'played',previousCompletedSegments:1};
  const result=await readStream(await handler(postRequest(body)));
  assert.equal(result.reply,'An alternative reply.');
  const prompt=seen.at(-1);
  assert.equal(prompt.includes('Q1'),true,'the earlier question is still in context');
  assert.equal(prompt.includes('Q2'),false,'the retried question is not');
  assert.equal(prompt.includes('R2'),false,'nor is the reply it produced');
});

test('a second retry on the same encounter is refused before any provider work',async()=>{
  let calls=0;
  const handler=createHandler({env:ENV,budget:freshBudget(),
    provider:{configured:true,replyStream:async()=>{calls++;return 'A reply.';},speak:async()=>MP3}});
  const parent=await runEncounter(handler,2);
  const first=await readStream(await handler(postRequest({action:'retry',state:parent,turnId:2,text:'Once',previousPlayback:'played',previousCompletedSegments:1})));
  const after=calls;
  const second=await handler(postRequest({action:'retry',state:first.state,turnId:2,text:'Twice',previousPlayback:'played',previousCompletedSegments:1}));
  assert.equal(second.status,409);
  assert.equal((await second.json()).error,'preview_encounter_finished');
  assert.equal(calls,after,'no provider call was made for the refused retry');
});

test('re-presenting a consumed turn receipt still fails, which is the control this design preserves',async()=>{
  const handler=createHandler({env:ENV,budget:freshBudget(),provider:{configured:true,replyStream:async()=>'A reply.',speak:async()=>MP3}});
  const first=await runEncounter(handler,1);
  const consumed=await handler(postRequest({action:'turn',state:first,text:'Q2',previousPlayback:'played',previousCompletedSegments:1}));
  await readStream(consumed);
  const replay=await handler(postRequest({action:'turn',state:first,text:'A different question',previousPlayback:'played',previousCompletedSegments:1}));
  assert.equal([400,409].includes(replay.status),true);
  assert.equal((await replay.json()).error,'preview_operation_mismatch');
});

test('a malformed retry body is refused before reservation',async()=>{
  const handler=createHandler({env:ENV,budget:freshBudget(),provider:{configured:true,replyStream:async()=>'A reply.',speak:async()=>MP3}});
  const parent=await runEncounter(handler,2);
  const bodies=[
    {action:'retry',state:parent,turnId:2,text:'A question'},                                   // missing playback fields
    {action:'retry',state:parent,turnId:9,text:'A question',previousPlayback:'played',previousCompletedSegments:1},
    {action:'retry',state:parent,turnId:2,text:'',previousPlayback:'played',previousCompletedSegments:1},
    {action:'retry',state:parent,turnId:2,text:'A question',previousPlayback:'played',previousCompletedSegments:1,extra:true}
  ];
  for(const body of bodies){
    const response=await handler(postRequest(body));
    assert.equal(response.status>=400,true,JSON.stringify(Object.keys(body)));
  }
});
```

Reuse the file's existing `ENV`, `KEY`, `BINDING`, `MP3`, `freshBudget`, `postRequest` and `readStream` helpers if present under those names; if a helper does not exist, add it beside the others in the same style rather than inventing a new pattern. `runEncounter(handler, turns)` is a new helper: it runs one `start` and `turns` sequential `turn` requests through the handler, returning the latest sealed receipt.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/handler.test.mjs`
Expected: FAIL — `retry` falls through to `throw problem(400,'preview_input_invalid')`, so the first test gets a 400 rather than a reply.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/lib/handler.mjs`, extend the action dispatch. Replace:

```js
   }else throw problem(400,'preview_input_invalid');
```

with:

```js
   }else if(action==='retry'){
    if(!exact(body,['action','state','turnId','text','previousPlayback','previousCompletedSegments']))throw problem(400,'preview_input_invalid');
    const parent=codec.open(body.state);
    // The parent receipt presented here is the latest, unconsumed one. An earlier
    // receipt would be refused by the ledger, which is the point.
    state=retryState(parent,body.turnId,randomBytes(16).toString('hex'));
    history=nextHistory(state,body);
    operationId=`retry:${parent.sid}:${parent.nonce}:${body.turnId}`;
   }else throw problem(400,'preview_input_invalid');
```

Add `retryState` to the existing import from `./state.mjs`, and `randomBytes` from `node:crypto`.

Do **not** edit the reservation line. Verify by reading it that

```js
   await budget.reserve({operationId:hash(operationId),bindingHash:hash(JSON.stringify(body)),units:action==='start'?1:3});
```

already charges a retry three units, because `action` is `'retry'` and the ternary falls to `3`. If you find yourself editing this line, stop — the cost is already correct and changing it would alter the turn cost too.

Mark the alternative spent on the issued state. In the streaming body, replace:

```js
       state=issuedState(state,history,reply,segments);
```

with:

```js
       state=issuedState(state,history,reply,segments);
       if(action==='retry')state={...state,retried:true};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/lib/handler.mjs sp-preview/tests/handler.test.mjs
git commit -m "feat(sp-preview): add the retry action as a derived child session"
```

---

### Task 4: Client retry panel

**Files:**
- Modify: `sp-preview/public/app.js`, `sp-preview/public/station.js`, `sp-preview/public/index.html`
- Test: `sp-preview/tests/client.test.mjs`, `sp-preview/tests/station.test.mjs`

**Interfaces:**
- Consumes: the `retry` action from Task 3; `stationSnapshot` from PR A.
- Produces: `controller.retry(turnId, text)` returning a promise resolving `true` on success and `false` otherwise, refusing when the encounter has not ended, when an alternative is already spent, or when `restartRequired` is set; `snapshot.retryUsed: boolean`; station method `getRetryMoments()` returning `[{turnId, question, reply, playbackStatus, heardText}]` with played moments first.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/client.test.mjs`:

```js
test('an alternative can be asked once, only after the encounter ends, and never resent after a failure',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(frames(number-1,['One completed reply.']),options.signal))),
        controller=createController(h.env);
  let work=controller.start('key',false);await finishAudio(h,0);await work;
  assert.equal(await controller.retry(1,'Too early'),false,'no alternative before the encounter ends');
  for(let turn=1;turn<=10;turn++){work=controller.send('Question '+turn);await finishAudio(h,turn);await work;}
  assert.equal(controller.getSnapshot().phase,'ended');
  const before=h.calls.length;
  const alternative=controller.retry(3,'A different way of asking');
  await until(()=>h.calls.length===before+1);
  assert.equal(h.calls.at(-1).body.action,'retry');
  assert.equal(h.calls.at(-1).body.turnId,3);
  await finishAudio(h,11);await alternative;
  assert.equal(controller.getSnapshot().retryUsed,true);
  assert.equal(await controller.retry(4,'A second alternative'),false,'only one alternative per encounter');
  assert.equal(h.calls.length,before+1);
});

test('a retry that fails before its receipt does not resend and asks for a restart',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(number<=11?frames(number-1,['A reply.']):[],options.signal))),
        controller=createController(h.env);
  let work=controller.start('key',false);await finishAudio(h,0);await work;
  for(let turn=1;turn<=10;turn++){work=controller.send('Question '+turn);await finishAudio(h,turn);await work;}
  const alternative=controller.retry(2,'An alternative');await flush();controller.interrupt();await alternative;
  const snapshot=controller.getSnapshot();
  assert.equal(snapshot.restartRequired,true);
  assert.match(snapshot.error,/outcome is unknown/);
  const count=h.calls.length;
  assert.equal(await controller.retry(2,'Again'),false);
  assert.equal(h.calls.length,count,'an uncertain alternative is never repeated automatically');
});
```

Add to `sp-preview/tests/station.test.mjs`:

```js
test('retry moments list completed exchanges, played first, quoting only what was heard',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([
    you('Q1'),dana('R1 full.','interrupted',['R1 full.'],0),
    you('Q2'),dana('R2 heard. R2 tail.','interrupted',['R2 heard.',' R2 tail.'],1),
    you('Q3'),dana('R3 played.','played',['R3 played.'],1)
  ],'ended'));
  const moments=station.getRetryMoments();
  // Played moments first; original turn order preserved within each group.
  assert.deepEqual(moments.map(m=>m.turnId),[3,1,2]);
  assert.equal(moments[0].playbackStatus,'played','a fully played moment is offered first');
  const second=moments.find(m=>m.turnId===2);
  assert.equal(second.heardText,'R2 heard.');
  assert.equal(second.heardText.includes('R2 tail.'),false);
  const first=moments.find(m=>m.turnId===1);
  assert.equal(first.heardText,undefined,'a moment with nothing heard offers no quote');
  station.dispose();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix sp-preview test`
Expected: FAIL — `controller.retry is not a function` and `station.getRetryMoments is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/public/app.js`:
- add `retryUsed` to the controller state and to `snapshot()`;
- add `async function retry(turnId,text)` guarded by `if(task||disposed||restartRequired||retryUsed||!ended||!receipt)return false;`, which pushes the learner row the way `send` does and calls `request({action:'retry',state:receipt,turnId:turnId,text:value,previousPlayback:previousPlayback,previousCompletedSegments:previousCompletedSegments},learner)`;
- set `retryUsed=true` when a retry succeeds, using the same `!operation.failed` test `send` relies on;
- export `retry` on the returned controller object;
- reuse the existing `restartRequired` path unchanged for a retry that loses its receipt — do not add a second uncertainty message.

In `sp-preview/public/station.js`, add `getRetryMoments()` to `createStation`, deriving from the station snapshot: pair each `who:'me'` entry with the following `who:'pt'` entry, keep only pairs where the patient entry exists, carry `{turnId, question, reply, playbackStatus, heardText}`, and sort played moments before the rest while preserving turn order within each group.

Render the panel inside the existing `closing` section, which PR A already reveals only when the encounter has ended: a `<select>` of moments, the original question and the reply **as heard**, a textarea for the alternative, and one button that calls `controller.retry`. Wire the button through an `options.onRetry` callback passed from `app.js` rather than giving the station a controller reference — the station's no-controller boundary from PR A must hold.

In `sp-preview/public/index.html` no change is required; the panel lives inside the existing `#station-root`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/app.js sp-preview/public/station.js sp-preview/tests/client.test.mjs sp-preview/tests/station.test.mjs
git commit -m "feat(sp-preview): offer one spoken alternative from a finished encounter"
```

---

### Task 5: Budget accounting and documentation

**Files:**
- Modify: `sp-preview/README.md`, `sp-preview/ACCEPTANCE.md`
- Test: `sp-preview/tests/budget.test.mjs`

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/budget.test.mjs`, in the style of the existing reservation tests:

```js
test('an encounter with one alternative reserves 34 units, inside the window ceiling',async()=>{
  const f=fixture();
  await f.budget.reserve(request('session:opening',1));
  for(let turn=1;turn<=10;turn++)await f.budget.reserve(request('session:turn-'+turn,3));
  const afterRetry=await f.budget.reserve(request('session:retry-2',3));
  // reserve() is the only method; its frozen result carries the running total.
  assert.equal(afterRetry.chargedUnits,34);
  assert.equal(afterRetry.chargedUnits<=72,true,'a full encounter with its alternative fits the rolling window');
});
```

`fixture()` and `request(operationId, units)` are the helpers the existing tests in this file already use; follow their signatures rather than inventing new ones.

- [ ] **Step 2: Run test to verify it fails or passes for the right reason**

Run: `node --test sp-preview/tests/budget.test.mjs`
Expected: PASS. This test is a regression pin rather than a driver — the ledger already sums correctly. Prove it has teeth: temporarily change the final reservation to `4` units, confirm the test fails with `35 !== 34`, then restore it to `3`.

- [ ] **Step 3: Document**

In `sp-preview/README.md`, extend the ledger paragraph: one opening reserves one attempt, each question three, and one alternative three, so a full encounter with its alternative reserves 34 of the 72-per-half-hour and 120-per-deployment ceilings.

In `sp-preview/ACCEPTANCE.md`, add a short section recording what retry does and does not do: it derives a child session from the truncated heard-only history, it is capped at one per encounter in the sealed receipt, it never re-presents a consumed receipt, and re-presenting one still fails as `preview_operation_mismatch`.

- [ ] **Step 4: Run the full local gate**

Run: `bash bin/verify.sh`
Expected: `ALL CHECKS PASSED`.

- [ ] **Step 5: Commit and push**

```bash
git add sp-preview/README.md sp-preview/ACCEPTANCE.md sp-preview/tests/budget.test.mjs
git commit -m "docs(sp-preview): record the retry budget and its boundaries"
git push -u origin codex/hosted-retry-slice-1b
```

---

### Task 6: Hosted verification and pull request

- [ ] **Step 1: Open the pull request as a draft**

```bash
gh pr create --draft --base codex/hosted-dana-preview --title "Hosted encounter slice 1B: one-moment retry" --body-file <(printf '%s\n' "Implements PR B of docs/superpowers/specs/2026-09-06-hosted-station-slice-1-design.md." "" "Adds an authenticated retry action that derives a child session from the truncated heard-only history, rather than re-presenting an earlier receipt — which the anti-replay ledger refuses by design, and still does." "" "One alternative per encounter, sealed into the receipt. Three budget units, the same as a turn.")
```

- [ ] **Step 2: Verify CI at the exact pushed SHA**

Confirm a `pull_request` run exists for the pushed commit and both jobs pass. If no run appears, check `mergeable_state` before assuming a CI fault: a conflicted PR produces no merge ref and therefore no run.

- [ ] **Step 3: Decide on paid hosted verification with the author**

A retry costs three paid units against the live preview. Do **not** run it automatically. Report that the option exists, what it would cost, and what it would prove that the mocked tests do not — then let the author choose. If they approve, redeploy the preview first, since the retry action lives in the Function and will not exist on the current deploy.

---

## Notes for the executor

- The single most important assertion in this plan is that the actor prompt on a retry contains nothing from the retried turn onward. If that test is hard to write against the existing provider stub, fix the stub — do not weaken the assertion.
- Never make a retry accept an earlier receipt "because the ledger is annoying". The ledger refusing a consumed `(sid, nonce)` is the control this whole design exists to preserve, and Task 3 pins it.
- `retryState` deletes the `retried` key rather than setting it to `undefined`, because `codec.open` uses `Object.hasOwn` and a sealed `undefined` does not survive JSON.
- The station must not gain a controller reference. Pass an `onRetry` callback; PR A's boundary test still has to pass.
