# Hosted Multi-Case Transport, Slice 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry more than one standardized patient on the hosted transport, and land the two faculty-reviewed cases — Marcus and Ray — on it, with case identity immutable within an encounter.

**Architecture:** `lib/case.mjs` becomes a registry of `{caseDef, binding}` keyed by case id. The handler builds a codec per case, so a receipt sealed for one case cannot open under another — the property already holds via the AEAD binding and is preserved rather than reinvented. `caseId` additionally travels inside the sealed state and is cross-checked against the request, making the invariant explicit instead of emergent.

**Tech Stack:** Node 22 ESM (`sp-preview/lib/`), vanilla browser JavaScript (UMD, ES5-compatible) for `sp-preview/public/`, `node:test`, AES-256-GCM via `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-09-07-hosted-multi-case-slice-2-design.md`

## Global Constraints

- Only Dana passes through `localDana.applyCase()`. The direct-suicide-question overlay is Dana-specific and must never be applied to another case.
- A receipt sealed for one case must not open under another. This is the load-bearing property of the slice.
- Preserve slice 1 unchanged: one continuation per receipt of any kind (`turn:${sid}:${nonce}`), heard-only history via `nextHistory`, one alternative per encounter sealed as `retried:true`.
- Budget ceilings stay 72 per rolling 30 minutes and 120 per deployment. Do not change them.
- No new browser storage. No `fetch` from the station. The published-file allowlist stays at the five files slice 1 established.
- Forbidden strings must remain absent from published files: `OPENAI_API_KEY`, `DANA_PREVIEW_STATE_KEY`, `hiddenAgenda`, `Tom has a sleep medication`, `ordinaryFacts`, `sp-interview.pack.json`.
- Do not copy the participant `portrayal` array into any public file. It is actor direction.
- Do not change gate logic, clinical content, attestation status, or the pack.
- Morgan (`sp_alcohol_ambivalence_001`) is out of scope. Do not register it.
- Commit after each task. Run `npm --prefix sp-preview test` before every commit.
- Every existing Dana test must pass unchanged. If one needs editing to accommodate multi-case support, stop — that is a signal the change is wider than intended.

---

### Task 1: Case registry

**Files:**
- Modify: `sp-preview/lib/case.mjs`
- Test: `sp-preview/tests/handler.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CASES`, a frozen object keyed by case id; each value is `{caseDef, binding}` where `binding` is `hash(JSON.stringify(caseDef))`. `caseIds` is a frozen array of the registered ids. `getCase(caseId)` returns the entry or `undefined`. The existing `dana` and `caseBinding` exports remain, so nothing that imports them breaks in this task.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/handler.test.mjs`:

```js
test('the registry carries exactly the reviewed cases, each with its own binding',async()=>{
 const {CASES,caseIds,getCase,dana,caseBinding}=await import('../lib/case.mjs');
 assert.deepEqual([...caseIds].sort(),['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001']);
 assert.equal(caseIds.includes('sp_alcohol_ambivalence_001'),false,'Morgan is out of scope for this slice');
 const bindings=caseIds.map(id=>CASES[id].binding);
 assert.equal(new Set(bindings).size,bindings.length,'each case must have a distinct binding');
 for(const id of caseIds)assert.equal(CASES[id].caseDef.id,id);
 assert.equal(getCase('sp_mania_redirect_001').caseDef.persona.displayName.length>0,true);
 assert.equal(getCase('not_a_case'),undefined);
 // Back-compatible exports keep the rest of the handler working this task.
 assert.equal(dana.id,'sp_depression_gated_si_001');
 assert.equal(caseBinding,CASES.sp_depression_gated_si_001.binding);
});

test('only Dana carries the direct-suicide-question overlay',async()=>{
 const {CASES}=await import('../lib/case.mjs');
 assert.equal(CASES.sp_depression_gated_si_001.caseDef.localDraftOverlay?.id,'dana-direct-si-v1');
 for(const id of ['sp_mania_redirect_001','sp_psychosis_paranoid_001'])
  assert.equal(Object.hasOwn(CASES[id].caseDef,'localDraftOverlay'),false,id+' must not receive Dana overlay');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/handler.test.mjs`
Expected: FAIL — `CASES` is not exported from `case.mjs`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `sp-preview/lib/case.mjs` with:

```js
import pack from '../../_prototypes/sp-interview/sp-interview.pack.json' with {type:'json'};
import localDana from '../../_prototypes/sp-interview/sp-interview.local-dana.js';
import {createContext} from '../../_prototypes/sp-interview/dana-live-context.mjs';
import {hash} from './state.mjs';

const DANA_ID='sp_depression_gated_si_001';
// Morgan is deliberately absent: it is draft-pending-attestation and lives outside
// the pack. See the slice 2 spec.
const REGISTERED=[DANA_ID,'sp_mania_redirect_001','sp_psychosis_paranoid_001'];

function resolve(id){
  const found=pack.cases.find(item=>item.id===id);
  if(!found)throw new Error('hosted preview: unknown case '+id);
  // The direct-suicide-question overlay is Dana's alone.
  return id===DANA_ID?localDana.applyCase(found):found;
}

export const CASES=Object.freeze(Object.fromEntries(REGISTERED.map(id=>{
  const caseDef=resolve(id);
  return [id,Object.freeze({caseDef,binding:hash(JSON.stringify(caseDef))})];
})));
export const caseIds=Object.freeze([...REGISTERED]);
export function getCase(caseId){return Object.hasOwn(CASES,caseId)?CASES[caseId]:undefined;}

// Check every registered case's grounding for drift during startup, before any
// paid request is accepted. A drift in ANY case fails at module load.
for(const id of REGISTERED){
  const {caseDef}=CASES[id];
  createContext(caseDef,[],[{who:'pt',text:caseDef.persona.opening,playbackStatus:'pending'}]);
}

// Retained so this task changes no consumer. Task 2 removes the last use.
export const dana=CASES[DANA_ID].caseDef;
export const caseBinding=CASES[DANA_ID].binding;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS. If a case fails the startup drift check, that is a real finding — report it rather than removing the check.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/lib/case.mjs sp-preview/tests/handler.test.mjs
git commit -m "feat(sp-preview): register the reviewed cases, each with its own binding"
```

---

### Task 2: Per-case codec and case identity in the sealed state

**Files:**
- Modify: `sp-preview/lib/state.mjs`, `sp-preview/lib/handler.mjs`
- Test: `sp-preview/tests/handler.test.mjs`

**Interfaces:**
- Consumes: `CASES`, `caseIds`, `getCase` from Task 1.
- Produces: request bodies gain `caseId` — `start` is `{action,caseId,requestId}`, `turn` is `{action,caseId,state,text,previousPlayback,previousCompletedSegments}`, `retry` is `{action,caseId,state,turnId,text}`. `initialState(opening,now,caseId)` records `caseId`. `codec.open` requires `caseId` to be a non-empty string of at most 64 characters.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/handler.test.mjs`:

```js
test('a receipt sealed for one case cannot be opened as another',async()=>{
 const {CASES}=await import('../lib/case.mjs');
 const bind=id=>`hosted-sp-v2:${id}:${CASES[id].binding}:deploy:origin:secret`;
 const marcus=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:bind('sp_mania_redirect_001'),now:()=>0});
 const ray=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:bind('sp_psychosis_paranoid_001'),now:()=>0});
 const token=marcus.seal(initialState('Marcus opening.',()=>0,'sp_mania_redirect_001'));
 assert.equal(marcus.open(token).caseId,'sp_mania_redirect_001');
 assert.throws(()=>ray.open(token),{code:'preview_state_invalid'},'a Marcus receipt must not open as Ray');
});

test('the sealed caseId must be a plausible id',()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>0});
 const base=initialState('Opening',()=>0,'sp_mania_redirect_001');
 assert.equal(codec.open(codec.seal(base)).caseId,'sp_mania_redirect_001');
 for(const bad of ['',null,1,{},'x'.repeat(65)])
  assert.throws(()=>codec.open(codec.seal({...base,caseId:bad})),{code:'preview_state_invalid'},String(bad));
});

test('a start names its case, and an unknown case is refused before any reservation',async()=>{
 const s=setup();
 const good=await events(await s.handler()(request({action:'start',caseId:'sp_mania_redirect_001',requestId:crypto.randomUUID()})));
 assert.equal(good[0].type,'reply');
 const before=s.calls.length;
 for(const caseId of ['sp_alcohol_ambivalence_001','not_a_case','',null])
  assert.equal((await s.handler()(request({action:'start',caseId,requestId:crypto.randomUUID()}))).status,400,String(caseId));
 assert.equal(s.calls.length,before,'nothing was reserved for an unknown case');
});

test('a turn whose caseId disagrees with its receipt is refused before any reservation',async()=>{
 const s=setup();
 const state=(await events(await s.handler()(request({action:'start',caseId:'sp_mania_redirect_001',requestId:crypto.randomUUID()})))).at(-1).state;
 const before=s.calls.length;
 const wrong=await s.handler()(request({action:'turn',caseId:'sp_psychosis_paranoid_001',state,text:'A question',previousPlayback:'played',previousCompletedSegments:1}));
 assert.equal(wrong.status,400);
 assert.equal(s.calls.length,before,'a case mismatch reserves nothing');
});

test('each case speaks its opening in its own voice',async()=>{
 const spoken=[];
 const s=setup({provider:{speak:async job=>{spoken.push(job.caseId);return mp3;}}});
 for(const caseId of ['sp_mania_redirect_001','sp_psychosis_paranoid_001'])
  await events(await s.handler()(request({action:'start',caseId,requestId:crypto.randomUUID()})));
 assert.deepEqual(spoken,['sp_mania_redirect_001','sp_psychosis_paranoid_001']);
});
```

Every existing test in this file that sends `action:'start'`, `'turn'` or `'retry'` needs `caseId:'sp_depression_gated_si_001'` added to its body, including inside the `start(s)` and `runEncounter(s,n)` helpers. That is a mechanical edit and is expected; it is not the "editing a Dana test" the constraints warn about, which means changing an assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/handler.test.mjs`
Expected: FAIL — `initialState` takes two arguments, `codec.open` has no `caseId` clause, and the handler rejects `caseId` as an unexpected key via `exact()`.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/lib/state.mjs`, record the case on the initial state:

```js
export function initialState(opening,now=Date.now,caseId) {
  return {v:1,caseId,sid:randomBytes(16).toString('hex'),nonce:randomBytes(16).toString('hex'),expires:now()+1800000,turn:0,
    history:[{who:'pt',text:opening,playbackStatus:'pending'}],segments:[opening],completed:0};
}
```

and add one clause to `open`'s validation chain, immediately before `||(Object.hasOwn(value,'retried')&&value.retried!==true)`:

```js
      ||typeof value.caseId!=='string'||!value.caseId||value.caseId.length>64
```

In `sp-preview/lib/handler.mjs`, replace the import on line 3:

```js
import {getCase,caseIds} from './case.mjs';
```

Replace the codec construction on line 30 with a resolution of the case first, then a codec bound to it:

```js
   const body=await inputBody(request);action=body?.action;
   const entry=getCase(body?.caseId);
   if(!entry)throw problem(400,'preview_input_invalid');
   const {caseDef,binding:caseBinding}=entry;
   codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:`hosted-sp-v2:${caseDef.id}:${caseBinding}:${env.DEPLOY_ID}:${origin}:${hash(secret)}`,now});
   let operationId;
```

Note the body is now read *before* the codec is built; delete the original `const body=await inputBody(request);action=body?.action;` line that followed the old codec construction so it is not read twice.

Add `caseId` to each action's `exact()` key list, and cross-check the sealed value:

```js
   if(action==='start'){
    if(!exact(body,['action','caseId','requestId'])||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))throw problem(400,'preview_input_invalid');
    state=initialState(caseDef.persona.opening,now,caseDef.id);operationId=`start:${body.requestId}`;
   }else if(action==='turn'){
    if(!exact(body,['action','caseId','state','text','previousPlayback','previousCompletedSegments']))throw problem(400,'preview_input_invalid');
    state=codec.open(body.state);
    // The binding already separates cases; this makes that invariant explicit.
    if(state.caseId!==caseDef.id)throw problem(400,'preview_state_invalid');
    history=nextHistory(state,body);operationId=`turn:${state.sid}:${state.nonce}`;
   }else if(action==='retry'){
    if(!exact(body,['action','caseId','state','turnId','text']))throw problem(400,'preview_input_invalid');
    const parent=codec.open(body.state);
    if(parent.caseId!==caseDef.id)throw problem(400,'preview_state_invalid');
    state=retryState(parent,body.turnId,randomBytes(16).toString('hex'));
    history=nextHistory(state,{text:body.text,previousPlayback:'played',previousCompletedSegments:state.completed});
    operationId=`turn:${parent.sid}:${parent.nonce}`;
   }else throw problem(400,'preview_input_invalid');
```

Replace the three remaining `dana` references in the streaming body with `caseDef`: `provider.speak({text,caseId:caseDef.id,…})`, `reply=caseDef.persona.opening`, and `createContext(caseDef,…)`.

Finally, remove the now-unused `dana` and `caseBinding` exports from `lib/case.mjs`, and the Task 1 test lines that assert them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/lib/state.mjs sp-preview/lib/handler.mjs sp-preview/lib/case.mjs sp-preview/tests/handler.test.mjs
git commit -m "feat(sp-preview): bind each encounter to one case, in the codec and in the sealed state"
```

---

### Task 3: Require an explicit caseId for speech

**Files:**
- Modify: `sp-preview/lib/openai-provider.mjs:267,272`
- Test: `sp-preview/tests/provider.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `speak` and `speakStream` throw a `ProviderError` with `code === 'invalid_reply'` when `caseId` is omitted, instead of defaulting to Dana. The handler already maps that code to a safe public message; this task does not change the mapping.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/provider.test.mjs`. The factory is `createOpenAIProvider({env,fetchImpl,timeoutMs})` and the file already has an `assertCode(promise,code)` helper — use both rather than introducing a second pattern:

```js
test('speech refuses to guess a case rather than defaulting to Dana',async()=>{
 const provider=createOpenAIProvider({env:{OPENAI_API_KEY:'k'},fetchImpl:async()=>{throw new Error('no request should be made');}});
 await assertCode(provider.speak({text:'Hello.'}),'invalid_reply');
 await assertCode(provider.speakStream({text:'Hello.',onChunk(){}}),'invalid_reply');
});
```

If `createOpenAIProvider` rejects that `env` shape, match whatever the neighbouring tests in the file pass it; the assertion on `invalid_reply` is the part that matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/provider.test.mjs`
Expected: FAIL — both calls resolve, because `caseId` defaults to `DANA_CASE_ID` and a request is attempted.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/lib/openai-provider.mjs`, drop the import of `DANA_CASE_ID` and remove the defaults:

```js
    async speak({text,signal,caseId}={}) {
      if(typeof caseId!=='string'||!caseId)throw fail('invalid_reply','validation');
```

```js
    async speakStream({text,signal,onChunk,caseId}={}) {
      if(typeof caseId!=='string'||!caseId)throw fail('invalid_reply','validation');
```

`fail(code,stage)` is the file's existing `ProviderError` constructor, already used for validation failures at lines 51 and 54. `'invalid_reply'` with stage `'validation'` is the established pairing for a malformed request and is what the new guards use.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/lib/openai-provider.mjs sp-preview/tests/provider.test.mjs
git commit -m "fix(sp-preview): a reply must name its case rather than defaulting to Dana's voice"
```

---

### Task 4: Station content for Marcus and Ray

**Files:**
- Modify: `sp-preview/public/station-content.js`
- Test: `sp-preview/tests/station.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `getProfile` returns profiles for all three registered case ids and `null` for anything else.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/station.test.mjs`:

```js
const REGISTERED=['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001'];

test('every registered case has learner-facing station content and no actor direction',()=>{
  for(const caseId of REGISTERED){
    const profile=contentModule.exports.getProfile(caseId);
    assert.ok(profile,caseId+' has a profile');
    assert.equal(profile.caseId,caseId);
    for(const key of ['title','task','doorNote','objectives','chartCards','priorities','cues','reflectionQuestion'])
      assert.ok(profile[key],caseId+' is missing '+key);
    assert.equal(JSON.stringify(profile).includes('portrayal'),false,caseId+' must not carry actor direction');
  }
  assert.equal(contentModule.exports.getProfile('sp_alcohol_ambivalence_001'),null,'Morgan is out of scope');
  assert.equal(contentModule.exports.getProfile('not_a_case'),null);
});

test('the station renders each registered case without leaking another case content',()=>{
  for(const caseId of REGISTERED){
    const doc=documentStub(),host=doc.createElement('div');
    const station=createStation({document:doc},host,{caseId,content:contentModule.exports});
    station.update(hosted([],'ready'));
    const text=allText(host);
    const profile=contentModule.exports.getProfile(caseId);
    assert.ok(text.includes(profile.doorNote.slice(0,40)),caseId+' shows its own door note');
    for(const other of REGISTERED.filter(id=>id!==caseId))
      assert.equal(text.includes(contentModule.exports.getProfile(other).doorNote.slice(0,40)),false,caseId+' leaked '+other);
    station.dispose();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/station.test.mjs`
Expected: FAIL — `getProfile('sp_mania_redirect_001')` returns `null`.

- [ ] **Step 3: Write minimal implementation**

Add two entries to the `PROFILES` map in `sp-preview/public/station-content.js`, copied from `_prototypes/sp-interview/sp-encounter-profiles.js`. Copy `title`, `task`, `doorNote`, `objectives` and `chartCards` from the case record, and `priorities`, `cues` and `reflectionQuestion` from its single participant. Do **not** copy `portrayal`, `reflectionPossibility`, or the participant `id`/`name` wrapper — follow the flattened shape the Dana entry already uses.

```js
    sp_mania_redirect_001:{
      caseId:'sp_mania_redirect_001',title:'Marcus — A focused interview',
      task:'Establish a shared agenda with Marcus, gather his account while redirecting respectfully, and summarize both his priorities and the questions you need to bring to the team.',
      doorNote:'Marcus is a college junior in his 20s on adult inpatient psychiatry after an overnight admission. His roommate called campus security after finding him redesigning the quad irrigation system with a shovel at 4 a.m.',
      objectives:['Explain your student role and establish a manageable shared agenda.','Use warm redirection while exploring the history, functioning, and safety concerns within the case.','Check Marcus’s understanding of your summary and clearly separate his priorities from unresolved team decisions.'],
      chartCards:[
        {id:'referral-context',title:'Reason for referral',source:'Authored referral information',text:'The roommate called campus security after finding Marcus at 4 a.m. with a shovel, describing plans to redesign the quad irrigation system.'},
        {id:'presenting-context',title:'Available presenting information',source:'Authored case brief',text:'Marcus is a college junior in engineering. The brief reports about two hours of sleep a night for two weeks. A direct collateral account is not supplied.'},
        chartLimit
      ],
      priorities:['Have his ideas and his account of the admission taken seriously.','Understand who can discuss his wish to leave and his upcoming plans.'],
      cues:{opening:'Marcus leans forward as you introduce yourself.',interrupted:'Marcus stops speaking and lifts one hand briefly.',repair:'Marcus lowers his hand and looks toward you.',closing:'Marcus shifts in his seat and looks toward you.'},
      reflectionQuestion:'How does your wording acknowledge Marcus’s agenda while making the next topic clear?'
    },
    sp_psychosis_paranoid_001:{
      caseId:'sp_psychosis_paranoid_001',title:'Ray — Establishing a working conversation',
      task:'Introduce yourself honestly, address Ray’s question about recording, explore his account without confirming or dismissing its explanation, and bring unresolved concerns to your supervisor.',
      doorNote:'Ray is a young adult in his 20s on day two of an adult inpatient psychiatry admission. An older sibling brought him in after weeks of not leaving his apartment, covering vents, and stopping meals. This is the first sit-down interview.',
      objectives:['Explain your role and the actual information-handling arrangements without promises you cannot make.','Give Ray time to describe his experiences and ask direct, understandable follow-up questions about safety.','Distinguish observed behavior and reported experience from interpretation when summarizing and handing over.'],
      chartCards:[
        {id:'referral-context',title:'Reason for referral',source:'Authored referral information',text:'An older sibling brought Ray in after weeks of withdrawal from usual activity, not leaving the apartment, covering vents, and stopping meals. No direct collateral interview is supplied.'},
        {id:'opening-context',title:'Opening context',source:'Authored case opening',text:'Ray sits angled toward the door with his arms crossed. His first question is whether the conversation is being recorded.'},
        chartLimit
      ],
      priorities:['Understand what is being recorded or shared and who is listening.','Describe his experience at his own pace without having its explanation immediately dismissed or confirmed.'],
      cues:{opening:'Ray sits angled toward the door, with his arms crossed.',interrupted:'Ray stops speaking and looks toward the door.',repair:'Ray pauses and turns his gaze back toward you.',closing:'Ray glances toward the door, then toward you.'},
      reflectionQuestion:'Does your wording explain what you can honestly offer while leaving Ray room to describe his experience?'
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/station-content.js sp-preview/tests/station.test.mjs
git commit -m "feat(sp-preview): station content for Marcus and Ray, learner-facing keys only"
```

---

### Task 5: Case picker and client plumbing

**Files:**
- Modify: `sp-preview/public/app.js`, `sp-preview/public/index.html`
- Test: `sp-preview/tests/client.test.mjs`

**Interfaces:**
- Consumes: request bodies from Task 2, station content from Task 4.
- Produces: `controller.start(passcode,useVoice,caseId)` sends `caseId`; `snapshot.caseId` reports the encounter's case; every `turn` and `retry` body carries the same `caseId`.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/client.test.mjs`:

```js
test('the chosen case travels on every request and cannot change mid-encounter',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(frames(number-1,['A reply.']),options.signal))),
    controller=createController(h.env);
  let work=controller.start('key',false,'sp_mania_redirect_001');await finishAudio(h,0);await work;
  assert.equal(controller.getSnapshot().caseId,'sp_mania_redirect_001');
  assert.equal(h.calls[0].body.caseId,'sp_mania_redirect_001');
  work=controller.send('A question');await finishAudio(h,1);await work;
  assert.equal(h.calls[1].body.caseId,'sp_mania_redirect_001','a turn carries the same case');
  assert.equal(h.calls.every(call=>call.body.caseId==='sp_mania_redirect_001'),true);
});

test('an encounter refuses to start without a registered case',async()=>{
  const h=environment(),controller=createController(h.env);
  assert.equal(await controller.start('key',false,'not_a_case'),false);
  assert.equal(await controller.start('key',false,''),false);
  assert.equal(h.calls.length,0,'no request is made for an unregistered case');
});
```

Existing tests call `controller.start('key',false)` with two arguments. Give `start` a default of `'sp_depression_gated_si_001'` for its third parameter so those tests keep passing unchanged, and pin that default with its own test rather than a shape check:

```js
test('an encounter with no case named defaults to Dana, so existing callers are unchanged',async()=>{
  const h=environment(),controller=createController(h.env);
  const work=controller.start('key',false);await finishAudio(h,0);await work;
  assert.equal(h.calls[0].body.caseId,'sp_depression_gated_si_001');
  assert.equal(controller.getSnapshot().caseId,'sp_depression_gated_si_001');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/client.test.mjs`
Expected: FAIL — `h.calls[0].body.caseId` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/public/app.js`:

- add `caseId` to the controller's state, defaulting to `'sp_depression_gated_si_001'`, and to `snapshot()`;
- change `start` to `async function start(passcode,useVoice,chosenCase){…}`, validating `chosenCase` against a frozen list of the three registered ids and returning `false` without a request when it is not one of them, then setting `caseId=chosenCase||caseId`;
- add `caseId:caseId` to the `start`, `turn` and `retry` request bodies;
- pass `caseId` to `createStation` instead of the hard-coded Dana id, and re-create the station when the case changes at `start`.

In `sp-preview/public/index.html`, add a case select to the access form, before the passcode row:

```html
<label for="case-choice">Patient</label>
<select id="case-choice">
  <option value="sp_depression_gated_si_001">Dana — admission interview</option>
  <option value="sp_mania_redirect_001">Marcus — a focused interview</option>
  <option value="sp_psychosis_paranoid_001">Ray — establishing a working conversation</option>
</select>
```

and in `mount`, pass `el('case-choice').value` as the third argument to `controller.start`, and disable the select whenever `snapshot.phase !== 'gate'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test && npm --prefix sp-preview run build`
Expected: PASS, and the build still emits exactly the five allowlisted files.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/app.js sp-preview/public/index.html sp-preview/tests/client.test.mjs
git commit -m "feat(sp-preview): choose a patient at the door, fixed for the encounter"
```

---

### Task 6: Documentation, gate and pull request

**Files:**
- Modify: `sp-preview/README.md`, `sp-preview/ACCEPTANCE.md`

- [ ] **Step 1: Document**

In `README.md`, record that the preview now carries three faculty-reviewed cases, that each encounter is bound to one of them by the codec binding and by a `caseId` inside the sealed state, and that Morgan is deliberately absent pending attestation.

In `ACCEPTANCE.md`, add a slice 2 section stating what is verified by test — a receipt sealed for one case does not open under another, a case mismatch reserves nothing, an unknown case is refused before reservation, each case speaks in its own voice — and what is not: no live hosted run has exercised Marcus or Ray, and their own gates carry no deterministic red-team probes.

- [ ] **Step 2: Run the full local gate**

Run: `bash bin/verify.sh`
Expected: `ALL CHECKS PASSED`. If it fails on the two site builds, confirm the same failure on a clean checkout of `main` before treating it as caused by this work.

- [ ] **Step 3: Commit and push**

```bash
git add sp-preview/README.md sp-preview/ACCEPTANCE.md
git commit -m "docs(sp-preview): record the multi-case transport and what it does not yet prove"
git push -u origin codex/hosted-slice2-cases
```

- [ ] **Step 4: Open the pull request as a draft against main**

```bash
gh pr create --draft --base main --title "Hosted encounter slice 2: multi-case transport with Marcus and Ray" --body-file <(printf '%s\n' "Implements docs/superpowers/specs/2026-09-07-hosted-multi-case-slice-2-design.md." "" "A receipt sealed for one case cannot open under another: the codec binding embeds the case hash, and caseId also travels inside the sealed state and is cross-checked. Morgan is deliberately absent pending attestation." "" "Budget ceilings unchanged. No new browser storage. Publish allowlist unchanged at five files.")
```

- [ ] **Step 5: Verify CI at the exact pushed SHA**

Confirm a `pull_request` run exists for the pushed commit and both jobs pass. If no run appears, check `mergeable_state` before assuming a CI fault: a conflicted PR produces no merge ref and therefore no run.

---

## Notes for the executor

- The single most important test in this plan is that a receipt sealed for Marcus does not open as Ray. If it is awkward to write, fix the fixture, never the assertion.
- Do not register Morgan, and do not apply `localDana.applyCase` to anything but Dana.
- Adding `caseId` to existing test request bodies is mechanical and expected. Changing an existing Dana *assertion* is not — stop and re-examine if one seems to need it.
- A hosted paid run against Marcus or Ray is not part of this plan. It costs units and needs a redeploy; propose it separately rather than doing it.
- One spec testing line is deliberately not covered: "the per-case startup drift check fails closed when a grounding hash moves". The check runs at module load, so exercising its failure needs a mutated copy of a case module, and the cost of that fixture outweighs its value — the same check has guarded Dana since the preview shipped and is unchanged here. What Task 1 does pin is that the check runs for every registered case, because a drift would throw at import and fail the whole suite. If you find a cheap way to test the failure directly, add it.
