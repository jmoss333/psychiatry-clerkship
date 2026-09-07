# Hosted Station Slice 1, PR A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the local prototype's student station, encounter-local bookmarks and exact-quote reflection into the protected hosted Dana encounter, with no change to the request/receipt protocol and no additional paid calls.

**Architecture:** Two new public browser files (`station-content.js`, `station.js`) loaded beside `app.js`. `station.js` is a projection of the controller snapshot: `app.js` calls `station.update(snapshot)` from its existing render, and the station never calls `fetch`, never touches `controller.send`, and never reads or writes browser storage. A pure adapter converts the hosted snapshot shape into the local station shape so the ported logic and its tests carry over intact.

**Tech Stack:** Vanilla browser JavaScript (UMD, ES5-compatible, matching `app.js`), Node 22 `node:test`, `node:vm` for loading the browser files in tests, esbuild only for the existing Function bundle check.

**Spec:** `docs/superpowers/specs/2026-09-06-hosted-station-slice-1-design.md`

## Global Constraints

- Browser files are classic scripts in the existing UMD wrapper style; no ESM, no build step, no bundler for `public/`.
- The published set is an explicit allowlist enforced by `sp-preview/build.mjs` and pinned by `sp-preview/tests/build.test.mjs`. PR A takes it from 3 files to exactly 5: `index.html`, `app.js`, `styles.css`, `station.js`, `station-content.js`.
- Forbidden strings must remain absent from every published file: `OPENAI_API_KEY`, `DANA_PREVIEW_STATE_KEY`, `hiddenAgenda`, `Tom has a sleep medication`, `ordinaryFacts`, `sp-interview.pack.json`.
- No browser storage. No `fetch` from the station. No transcript export. No provider call.
- localStorage/sessionStorage namespacing rules do not apply here — this preview writes neither.
- Content Security Policy is `script-src 'self'`; additional same-origin scripts are allowed, inline scripts and `eval` are not.
- A bookmark must never quote a sentence the learner did not hear.
- Do not change clinical content, the safety overlay, attestation status, or any pack file.
- Commit after each task. Run `npm --prefix sp-preview test` before every commit.

---

### Task 1: Retain reply segment texts so heard-only quoting is possible

The hosted controller records `completedSegments` and `totalSegments` but discards the segment **texts**, so there is no way to quote the heard prefix of an interrupted reply. The texts already arrive in the `reply` event; they are simply dropped. Without this, Task 3 cannot honour the constraint that a bookmark never quotes unheard text.

**Files:**
- Modify: `sp-preview/public/app.js:160` (`onReply`), `sp-preview/public/app.js:129` (`snapshot`)
- Test: `sp-preview/tests/client.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: every `message` with `role:'dana'` in `controller.getSnapshot().messages` carries `segments: string[]`, where `segments.length === totalSegments` and `segments.slice(0, completedSegments).join('')` is exactly the text the learner heard.

- [ ] **Step 1: Write the failing test**

Add to `sp-preview/tests/client.test.mjs`:

```js
test('a dana message carries its segment texts so the heard prefix can be quoted exactly',async()=>{
  const h=environment(),controller=createController(h.env);
  const opening=controller.start('key',false);
  await finishAudio(h,0);await finishAudio(h,1);await opening;
  const first=controller.getSnapshot().messages[0];
  assert.deepEqual(first.segments,['Hello.',' What would you like to discuss?']);
  assert.equal(first.segments.length,first.totalSegments);
  assert.equal(first.segments.slice(0,first.completedSegments).join(''),first.text);

  // An interrupted reply must expose only what actually played.
  const next=controller.send('And after that?');await until(()=>h.audios.length===3);
  await finishAudio(h,2);controller.interrupt();await next;
  const second=controller.getSnapshot().messages.at(-1);
  assert.equal(second.status,'interrupted');
  assert.equal(second.completedSegments,1);
  assert.equal(second.segments.slice(0,second.completedSegments).join(''),'Hello.');
  assert.notEqual(second.segments.join(''),'Hello.');
});

test('a snapshot cannot be used to mutate the controller segment list',()=>{
  const h=environment(),controller=createController(h.env);
  controller.start('key',false);
  const snapshot=controller.getSnapshot();
  if(snapshot.messages.length&&snapshot.messages[0].segments)snapshot.messages[0].segments.push('injected');
  assert.equal((controller.getSnapshot().messages[0]?.segments||[]).includes('injected'),false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/client.test.mjs`
Expected: FAIL — `first.segments` is `undefined`, so `assert.deepEqual` reports `undefined !== ['Hello.',' What would you like to discuss?']`.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/public/app.js`, in `onReply` (line 160), add the segment texts to the recorded reply. Replace:

```js
operation.reply={role:'dana',text:event.reply,status:'preparing',completedSegments:0,totalSegments:event.segments.length};
```

with:

```js
operation.reply={role:'dana',text:event.reply,status:'preparing',completedSegments:0,totalSegments:event.segments.length,segments:event.segments.map(function(segment){return segment.text;})};
```

In `snapshot()` (line 129), copy the array so a consumer cannot mutate controller state. Replace:

```js
messages:messages.map(function(message){return Object.assign({},message);}),
```

with:

```js
messages:messages.map(function(message){var copy=Object.assign({},message);if(copy.segments)copy.segments=copy.segments.slice();return copy;}),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS, 89 tests (87 before, 2 added).

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/app.js sp-preview/tests/client.test.mjs
git commit -m "feat(sp-preview): keep reply segment texts so an interrupted reply can be quoted exactly"
```

---

### Task 2: Adapter from the hosted snapshot to the station snapshot

The ported station and bookmark logic expect the local prototype's shape (`{phase, transcript:[{who,text,playbackStatus,heardText,responseStatus}]}`). The hosted controller publishes a different shape. One pure function bridges them, so the ported logic needs no edits and the mapping is testable on its own.

**Files:**
- Create: `sp-preview/public/station.js`
- Test: `sp-preview/tests/station.test.mjs`

**Interfaces:**
- Consumes: `message.segments`, `message.completedSegments`, `message.status` from Task 1.
- Produces: `stationSnapshot(hosted)` returning `{phase, state, transcript, draft, interim, turn, ended}` where `transcript` entries are `{who:'me'|'pt', text, playbackStatus?, heardText?, responseStatus?}`. Exported for tests as `DanaStation.stationSnapshot`.

Phase mapping, exhaustive:

| hosted | station |
| --- | --- |
| `gate` | `idle` |
| `ready` | `paused` |
| `connecting` | `starting` |
| `listening` | `listening` |
| `responding` | `awaiting_patient` |
| `speaking` | `speaking` |
| `paused` | `paused` |
| `restart` | `error` |
| `ended` | `ended` |

- [ ] **Step 1: Write the failing test**

Create `sp-preview/tests/station.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const stationModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station.js',import.meta.url),'utf8')+'\n})',{filename:'station.js'})(stationModule,stationModule.exports);
const {stationSnapshot}=stationModule.exports;

const hosted=(messages,phase='listening',extra={})=>({phase,turn:messages.filter(m=>m.role==='you').length,messages,draft:'',interim:'',error:'',voice:true,thinking:false,hold:false,busy:false,restartRequired:false,...extra});
const dana=(text,status,segments,completedSegments)=>({role:'dana',text,status,segments,completedSegments,totalSegments:segments.length});
const you=(text,status='submitted')=>({role:'you',text,status});

test('phases map onto the station vocabulary exhaustively',()=>{
  const pairs=[['gate','idle'],['ready','paused'],['connecting','starting'],['listening','listening'],['responding','awaiting_patient'],['speaking','speaking'],['paused','paused'],['restart','error'],['ended','ended']];
  for(const [from,to] of pairs)assert.equal(stationSnapshot(hosted([],from)).phase,to,from);
});

test('a played reply carries its full text and no heard prefix',()=>{
  const snapshot=stationSnapshot(hosted([dana('Hello. And more.','played',['Hello.',' And more.'],2)]));
  assert.deepEqual(snapshot.transcript,[{who:'pt',text:'Hello. And more.',playbackStatus:'played'}]);
});

test('an interrupted reply exposes the heard prefix and never the unheard tail',()=>{
  const snapshot=stationSnapshot(hosted([dana('Hello. And more.','interrupted',['Hello.',' And more.'],1)]));
  assert.deepEqual(snapshot.transcript,[{who:'pt',text:'Hello. And more.',playbackStatus:'interrupted',heardText:'Hello.'}]);
});

test('an interrupted reply with nothing completed carries no heard text at all',()=>{
  const snapshot=stationSnapshot(hosted([dana('Hello. And more.','interrupted',['Hello.',' And more.'],0)]));
  assert.equal(snapshot.transcript[0].heardText,undefined);
});

test('a preparing reply reads as pending, and learner rows carry their request status',()=>{
  const snapshot=stationSnapshot(hosted([you('A question','pending'),dana('...','preparing',['...'],0)],'responding'));
  assert.equal(snapshot.transcript[0].who,'me');
  assert.equal(snapshot.transcript[0].responseStatus,'pending');
  assert.equal(snapshot.transcript[1].playbackStatus,'pending');
  assert.equal(snapshot.phase,'awaiting_patient');
});

test('an unconfirmed learner request is reported as failed, not silently submitted',()=>{
  const snapshot=stationSnapshot(hosted([you('A question','unconfirmed')],'restart',{restartRequired:true}));
  assert.equal(snapshot.transcript[0].responseStatus,'failed');
  assert.equal(snapshot.phase,'error');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/station.test.mjs`
Expected: FAIL — `ENOENT` for `station.js`, or `stationSnapshot is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `sp-preview/public/station.js`:

```js
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DanaStation=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var PHASES={gate:'idle',ready:'paused',connecting:'starting',listening:'listening',responding:'awaiting_patient',speaking:'speaking',paused:'paused',restart:'error',ended:'ended'};
  var LEARNER={pending:'pending',unconfirmed:'failed'};
  function stationSnapshot(hosted){
    hosted=hosted||{};
    var phase=PHASES[hosted.phase]||'idle';
    var transcript=(hosted.messages||[]).map(function(message){
      if(message.role==='you'){
        var learner={who:'me',text:message.text};
        var status=LEARNER[message.status];
        if(status)learner.responseStatus=status;
        return learner;
      }
      var entry={who:'pt',text:message.text,playbackStatus:message.status==='preparing'?'pending':message.status};
      // Only whole completed segments were heard. The tail is never quoted.
      var segments=message.segments||[],completed=message.completedSegments||0;
      if(entry.playbackStatus!=='played'&&completed>0)entry.heardText=segments.slice(0,completed).join('');
      return entry;
    });
    return {phase:phase,state:phase,transcript:transcript,draft:hosted.draft||'',interim:hosted.interim||'',turn:hosted.turn||0,ended:phase==='ended'};
  }
  return {stationSnapshot:stationSnapshot};
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test sp-preview/tests/station.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/station.js sp-preview/tests/station.test.mjs
git commit -m "feat(sp-preview): map the hosted snapshot onto the station shape, quoting only heard segments"
```

---

### Task 3: Encounter-local bookmark store

Ported from `_prototypes/sp-interview/sp-interview.bookmarks.js`, unchanged in behaviour. It derives entirely from the station snapshot, holds no persistence, makes no provider call, and re-syncs quotes as playback status settles.

**Files:**
- Modify: `sp-preview/public/station.js`
- Test: `sp-preview/tests/station.test.mjs`

**Interfaces:**
- Consumes: `stationSnapshot(hosted)` from Task 2.
- Produces: `createBookmarkStore()` returning `{sync(snapshot), candidate(snapshot), add(snapshot), entries(), setReflection(id,text), remove(id), clear()}`. `entries()` returns copies of `{id, learnerText, danaText, playbackStatus, reflection}`. Exported as `DanaStation.createBookmarkStore`.

- [ ] **Step 1: Write the failing test**

Append to `sp-preview/tests/station.test.mjs`:

```js
const {createBookmarkStore}=stationModule.exports;

test('a bookmark takes the latest submitted question, never a draft, and is idempotent',()=>{
  const store=createBookmarkStore();
  assert.equal(store.candidate(stationSnapshot(hosted([],'listening',{draft:'Unsent'}))),null);
  const one=stationSnapshot(hosted([you('What has been hardest?','pending')],'responding'));
  assert.deepEqual(store.candidate(one),{id:1,learnerText:'What has been hardest?'});
  assert.equal(store.add(one).added,true);
  assert.equal(store.add(one).added,false,'the same moment is not bookmarked twice');
  assert.equal(store.entries().length,1);
});

test('a bookmark on an interrupted reply quotes only the heard prefix',()=>{
  const store=createBookmarkStore();
  const pending=stationSnapshot(hosted([you('A question','pending'),dana('Heard part. Unheard tail.','preparing',['Heard part.',' Unheard tail.'],0)],'speaking'));
  store.add(pending);
  assert.equal(store.entries()[0].danaText,'');
  const settled=stationSnapshot(hosted([you('A question'),dana('Heard part. Unheard tail.','interrupted',['Heard part.',' Unheard tail.'],1)],'listening'));
  store.sync(settled);
  assert.equal(store.entries()[0].danaText,'Heard part.');
  assert.equal(store.entries()[0].playbackStatus,'interrupted');
  assert.equal(store.entries()[0].danaText.includes('Unheard tail'),false);
});

test('a played reply is quoted in full and a reflection is capped at 1200 characters',()=>{
  const store=createBookmarkStore();
  const snapshot=stationSnapshot(hosted([you('A question'),dana('All of it.','played',['All of it.'],1)],'listening'));
  store.add(snapshot);
  assert.equal(store.entries()[0].danaText,'All of it.');
  assert.equal(store.setReflection(1,'x'.repeat(2000)),true);
  assert.equal(store.entries()[0].reflection.length,1200);
  assert.equal(store.setReflection(99,'nope'),false);
});

test('a bookmark is dropped rather than re-pointed when the encounter is cleared',()=>{
  const store=createBookmarkStore();
  store.add(stationSnapshot(hosted([you('First question')],'responding')));
  // A new encounter reuses turn number 1 with different words.
  store.sync(stationSnapshot(hosted([you('A different first question')],'responding')));
  assert.equal(store.entries()[0].danaText,'','a turn number from another encounter must not supply the quote');
  store.clear();
  assert.deepEqual(store.entries(),[]);
});

test('an unanswered question left pending at the end reads as cancelled',()=>{
  const store=createBookmarkStore();
  const live=stationSnapshot(hosted([you('A question','pending')],'responding'));
  store.add(live);
  store.sync(stationSnapshot(hosted([you('A question','pending')],'ended')));
  assert.equal(store.entries()[0].playbackStatus,'cancelled');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/station.test.mjs`
Expected: FAIL — `createBookmarkStore is not a function`.

- [ ] **Step 3: Write minimal implementation**

Port the store into `sp-preview/public/station.js`, inside the factory, before the `return`. Copy the logic of `_prototypes/sp-interview/sp-interview.bookmarks.js` verbatim — `validId`, `copy`, `submitted`, `playback`, `createStore` — renaming `createStore` to `createBookmarkStore`, and add it to the returned object:

```js
  return {stationSnapshot:stationSnapshot,createBookmarkStore:createBookmarkStore};
```

Do not alter the ported logic. In particular keep, unchanged:
- `if(!moment||moment.learner.text!==entry.learnerText)return;` in `sync` — this is what stops a turn number from another encounter supplying a quote;
- the `playback` rule that uses the full patient text only when `playbackStatus==='played'`, and otherwise only a `heardText` that is a genuine prefix (`patient.text.indexOf(patient.heardText)===0`);
- the end-of-encounter coercion of `pending` to `cancelled` and `speaking` to `interrupted`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test sp-preview/tests/station.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/station.js sp-preview/tests/station.test.mjs
git commit -m "feat(sp-preview): port encounter-local bookmarks, quoting only what was heard"
```

---

### Task 4: Station content and rendering

**Files:**
- Create: `sp-preview/public/station-content.js`
- Modify: `sp-preview/public/station.js`, `sp-preview/public/index.html`, `sp-preview/public/app.js`
- Test: `sp-preview/tests/station.test.mjs`

**Interfaces:**
- Consumes: `stationSnapshot`, `createBookmarkStore`.
- Produces: `DanaStationContent.getProfile(caseId)` returning `{caseId, title, task, doorNote, objectives, chartCards, perspectives, closing}`; and `createStation(env, host, {caseId, content})` returning `{update(hostedSnapshot), dispose(), getPresentation(), getReflections(), getBookmarks()}`.

Content is copied from the Dana record in `_prototypes/sp-interview/sp-encounter-profiles.js` — `task`, `doorNote`, `objectives`, and the learner-facing `perspectives[].priorities` and `perspectives[].cues`. Do **not** copy `portrayal`, which is actor guidance.

Render the same surfaces the local station renders, keeping the `data-station` attribute names so the ported assertions still address them: `door-note`, `chart`, `timer`, `cue`. Reuse the local module's scoped `<style>` block verbatim so no change to `styles.css` is required.

- [ ] **Step 1: Write the failing test**

Append to `sp-preview/tests/station.test.mjs`:

```js
import {JSDOM} from 'node:test' /* placeholder-free note: no jsdom dependency is added; see Step 3 */;
```

Do not add a DOM dependency. Instead assert against a minimal document stub, matching how `client.test.mjs` stubs `env`. Append:

```js
const {createStation}=stationModule.exports;
const contentModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8')+'\n})',{filename:'station-content.js'})(contentModule,contentModule.exports);

function documentStub(){
  function node(tag){
    return {tagName:tag,children:[],attributes:{},textContent:'',classList:{add(){},remove(){}},hidden:false,
      appendChild(child){this.children.push(child);return child;},
      setAttribute(name,value){this.attributes[name]=value;},
      getAttribute(name){return this.attributes[name];},
      addEventListener(){},replaceChildren(){this.children=[];},
      querySelectorAll(){return [];}};
  }
  return {createElement:node,createTextNode(text){return {textContent:text,children:[]};},addEventListener(){},hidden:false};
}
const flat=root=>{const out=[];(function walk(n){out.push(n);(n.children||[]).forEach(walk);})(root);return out;};
const byStation=(root,name)=>flat(root).find(n=>n.attributes&&n.attributes['data-station']===name);

test('the station renders the door note and task before the first question',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  const station=createStation({document:doc},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  station.update(hosted([],'ready'));
  const door=byStation(host,'door-note');
  assert.ok(door,'a door note surface is rendered');
  assert.ok(flat(door).some(n=>typeof n.textContent==='string'&&n.textContent.indexOf('adult inpatient psychiatry')>=0),'the door note text is present');
  station.dispose();
});

test('the station exposes bookmarks and reflections without any network or storage call',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  let fetches=0;
  const station=createStation({document:doc,fetch(){fetches++;}},host,{caseId:'sp_depression_gated_si_001',content:contentModule.exports});
  for(let turn=1;turn<=10;turn++)station.update(hosted([you('Question '+turn),dana('Reply '+turn,'played',['Reply '+turn],1)],'listening'));
  assert.equal(fetches,0,'the station never calls fetch');
  assert.deepEqual(station.getBookmarks(),[]);
  assert.deepEqual(station.getReflections(),{});
  station.dispose();
});

test('an unknown case id yields no station rather than a partly rendered one',()=>{
  const doc=documentStub(),host=doc.createElement('div');
  assert.equal(createStation({document:doc},host,{caseId:'not_a_case',content:contentModule.exports}),null);
});
```

Remove the placeholder import line written above before running; it exists only to state that no DOM dependency is introduced.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/station.test.mjs`
Expected: FAIL — `createStation is not a function` and `station-content.js` missing.

- [ ] **Step 3: Write minimal implementation**

Create `sp-preview/public/station-content.js` in the UMD wrapper, exporting `getProfile(caseId)` for the single Dana record, with `task`, `doorNote`, `objectives`, `chartCards`, `perspectives` (learner-facing keys only) and `closing` copied from the local profile.

Extend `sp-preview/public/station.js` with `createStation(env,host,options)`:
- return `null` when the profile is unknown;
- build the DOM once (door note, task, objectives, chart disclosure, optional timer, observable cue, closing, attending-presentation textarea, bookmark list with per-bookmark reflection textarea), reusing the local `data-station` attribute names;
- keep an internal `createBookmarkStore()`;
- `update(hostedSnapshot)` calls `stationSnapshot`, then `store.sync(...)`, then refreshes text nodes;
- `getPresentation()`, `getReflections()`, `getBookmarks()` read local state only;
- `dispose()` removes listeners and drops references.

Wire it up. In `sp-preview/public/index.html`, add the two scripts before `app.js` and a mount point inside `#preview-root`, after the `encounter-panel` section:

```html
<div id="station-root"></div>
<script src="./station-content.js" defer></script>
<script src="./station.js" defer></script>
```

In `sp-preview/public/app.js` `mount()`, create the station once and update it from `render`:

```js
var station=root.DanaStation&&root.DanaStation.createStation(env,el('station-root'),{caseId:'sp_depression_gated_si_001',content:root.DanaStationContent});
```

and inside `render(snapshot)`, as the last statement before `lastPhase=snapshot.phase;`:

```js
if(station)station.update(snapshot);
```

`mount` receives `env`, so reference `env.DanaStation` and `env.DanaStationContent` rather than a bare global.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test`
Expected: PASS. `client.test.mjs` must still pass unchanged — the station is optional and absent in those stubs.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/public/station-content.js sp-preview/public/station.js sp-preview/public/index.html sp-preview/public/app.js sp-preview/tests/station.test.mjs
git commit -m "feat(sp-preview): render the student station beside the hosted encounter"
```

---

### Task 5: Widen the publish allowlist deliberately, and keep it pinned

**Files:**
- Modify: `sp-preview/build.mjs:5`, `sp-preview/tests/build.test.mjs:18`
- Test: `sp-preview/tests/build.test.mjs`

**Interfaces:**
- Consumes: the two new public files from Task 4.
- Produces: `dist` containing exactly `app.js`, `index.html`, `station-content.js`, `station.js`, `styles.css`.

- [ ] **Step 1: Write the failing test**

In `sp-preview/tests/build.test.mjs`, replace the directory assertion:

```js
  assert.deepEqual((await readdir(path.join(root,'dist'))).sort(),['app.js','index.html','station-content.js','station.js','styles.css']);
```

and extend the forbidden-string sweep to cover every published file:

```js
  const published=['app.js','index.html','styles.css','station.js','station-content.js'];
  const publicText=(await Promise.all(published.map(file=>readFile(path.join(root,'dist',file),'utf8')))).join('\n');
  for(const forbidden of ['OPENAI_API_KEY','DANA_PREVIEW_STATE_KEY','hiddenAgenda','Tom has a sleep medication','ordinaryFacts','sp-interview.pack.json'])assert.ok(!publicText.includes(forbidden),forbidden);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test sp-preview/tests/build.test.mjs`
Expected: FAIL — the build throws `Preview public directory differs from the explicit allowlist.` because `build.mjs` still lists three files.

- [ ] **Step 3: Write minimal implementation**

In `sp-preview/build.mjs` line 5:

```js
const allowed=['index.html','app.js','styles.css','station.js','station-content.js'];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix sp-preview test && npm --prefix sp-preview run build`
Expected: PASS; the build prints its summary and `dist` holds exactly the five files.

- [ ] **Step 5: Commit**

```bash
git add sp-preview/build.mjs sp-preview/tests/build.test.mjs
git commit -m "build(sp-preview): publish the station files, keeping the allowlist explicit and pinned"
```

---

### Task 6: Full gate and pull request

**Files:**
- Modify: `sp-preview/README.md`

- [ ] **Step 1: Document the station in the README**

Add a short section under "Local verification" naming the five published files, stating that the station makes no network call and writes no browser storage, and recording the known limitation that chart-request cards ship client-side and are therefore a teaching affordance rather than an information barrier.

- [ ] **Step 2: Run the full local gate**

Run: `bash bin/verify.sh`
Expected: `ALL CHECKS PASSED`. If it fails on the two site builds, confirm the failure also occurs on a clean checkout of `main` before treating it as caused by this work.

- [ ] **Step 3: Commit and push**

```bash
git add sp-preview/README.md
git commit -m "docs(sp-preview): describe the station, its boundaries and its one limitation"
git push -u origin codex/hosted-station-slice-1
```

- [ ] **Step 4: Open the pull request as a draft against PR #547's branch**

```bash
gh pr create --draft --base codex/hosted-dana-preview --title "Hosted encounter slice 1A: student station, bookmarks, exact-quote reflection" --body-file <(printf '%s\n' "Implements PR A of docs/superpowers/specs/2026-09-06-hosted-station-slice-1-design.md." "" "Pure client: no protocol change, no server action, no additional paid calls, no browser storage, no fetch from the station." "" "Depends on codex/hosted-dana-preview (PR #547) and is based on its head; retarget to main once #547 lands.")
```

- [ ] **Step 5: Verify CI at the exact pushed SHA**

Confirm a `pull_request` run exists for the pushed commit and both jobs pass. If no run appears, check `mergeable_state` before assuming a CI fault — a conflicted PR produces no merge ref and therefore no run.

---

## Notes for the executor

- `bin/verify.sh` runs `npm --prefix sp-preview test` and `npm --prefix sp-preview run build`, so a broken station reddens the whole gate.
- Never add a `fetch`, `localStorage`, `sessionStorage` or `IndexedDB` call to `station.js` or `station-content.js`. The tests assert the absence of the first; the others are forbidden by the preview's stated privacy boundary.
- `sp-encounter-rhythm.js` is deliberately not ported. Do not fold acknowledgment carry into the capture lifecycle as part of this work.
- If a task reveals that the station needs data the snapshot does not carry, stop and report it rather than adding a server call — that would move the work into PR B's territory.
