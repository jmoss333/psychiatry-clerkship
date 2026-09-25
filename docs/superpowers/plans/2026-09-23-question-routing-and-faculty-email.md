# Question Routing and Faculty Email Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save learner questions before optional routing, surface the oldest unrouted item, and let learners prepare a reviewed single-recipient `@mainehealth.org` email draft without adding a sending service.

**Architecture:** Evolve the bounded `cw_capture_v1` record to v2 with separate `route` and `state` fields while preserving defensive v1 reads. Keep capture and routing device-local. Put deterministic recipient validation, digest grouping, and `mailto:` construction in a pure module; the existing capture dialog owns selection and the learner's mail app owns Send.

**Tech Stack:** ES5 browser JavaScript, localStorage, `mailto:` URLs, Clipboard API fallback, Node `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-on-the-go-learning-design.md`

## Global Constraints

- The PHI heuristic remains fail-closed before the first device write.
- Save succeeds before any route choice appears.
- Allowed routes are exactly `rounds`, `supervision`, `later`, or `null`.
- Keep the existing 50-item and 280-character caps; render all learner text escaped.
- `Look up later` does not silently seed SRS. Scheduling review remains a separate action.
- Today/On shift shows only the oldest unrouted question plus a View all count.
- Email drafts have one learner-entered local part and a fixed visible suffix `@mainehealth.org`.
- Recipient, question text, and email body never enter analytics, URLs for site navigation, server requests, or persistent recipient history.
- The site never sends email and never claims delivery.
- Faculty preview and APP practice state remain non-mutating and separate.

## Review Focus

- A v1 `scheduled` item with an existing SRS record must migrate to `later` without duplicating or deleting that record.
- An email local part containing `@`, whitespace, newline/header injection, comma, or semicolon must be rejected before a `mailto:` URI exists.
- A mail handler cannot be detected reliably, so Copy email text must remain visible after Open email draft instead of relying on a success callback.
- A long encoded digest must switch to copy/selectable-text fallback without truncating or dropping a question.
- A capture saved immediately before a crash must reopen as unrouted and appear as the oldest Today item.

---

## File map

- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html:1399-1665, 2160-2300, 2590-2620`: v2 store, post-save routes, inbox, email dialog wiring.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js:1-115`: compact oldest-unrouted card and full-inbox entry.
- Create `13_Faculty_Resources/_automation/site_build/frontdoor/fd_capture_email.js`: pure selection, validation, digest, and mailto helpers.
- Modify `13_Faculty_Resources/_automation/site_build/common.py:790-830`: inject email helper module.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css:992-1017`: route controls, selection, email preview, fallbacks.
- Modify `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`: capture/email structures.
- Modify `tests/ward-capture.test.mjs`: real embedded store block and v1→v2 migration.
- Modify `tests/fd-due.test.mjs`, `tests/fd-wire.test.mjs`, `tests/fd-shell-boot.test.mjs`, `tests/shell-copy.test.mjs`.
- Create `tests/fd-capture-email.test.mjs`: pure email contract.
- Modify `tests/smoke/ward-capture.spec.js` and `tests/smoke/front-door.spec.js`.

### Task 1: Versioned capture routes and defensive migration

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1406-1459`
- Modify: `tests/ward-capture.test.mjs`

**Interfaces:**
- Produces: `capRead() -> {v:2,items:Array}`, `capSetRoute(id,route) -> boolean`, `capOldestUnrouted(items) -> item|null`.
- Consumes: existing v1/v2 localStorage values; keeps `capAdd(text)` save-first behavior.

- [ ] **Step 1: Add failing migration and route tests against the real embedded block**

Extend the existing extraction harness rather than copying production functions into the test.

```js
test('v1 statuses migrate without inventing a destination', () => {
  ls.setItem('cw_capture_v1', JSON.stringify({v:1,items:[
    {id:'a',text:'one',status:'new'},
    {id:'b',text:'two',status:'supervision'},
    {id:'c',text:'three',status:'scheduled'},
    {id:'d',text:'four',status:'triaged'}
  ]}));
  assert.deepEqual(capRead().items.map((x) => x.route),
    [null,'supervision','later',null]);
});

test('route changes only after the question already exists', () => {
  const id = capAdd('How should I organize this learning question?');
  assert.equal(capRead().items[0].route, null);
  assert.equal(capSetRoute(id, 'rounds'), true);
  assert.equal(capRead().items[0].route, 'rounds');
});
```

Cover malformed versions, prototype-like fields, invalid routes/states, missing ids, cap eviction,
and preservation of `ctx` and timestamps. Seed `cw_srs_v1` before migrating a legacy `scheduled`
item, then assert its serialized value remains byte-identical after `capRead()` and the first v2
write; migration may map the capture route to `later` but may not seed, duplicate, or delete SRS.
At the 50-item boundary, assert eviction removes the oldest already-routed item before any unrouted
item, with timestamp/id tie-breaking pinned deterministically.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/ward-capture.test.mjs`

Expected: FAIL because `capRead` still returns v1/status and `capSetRoute` is missing.

- [ ] **Step 3: Implement v2 normalization and writes**

Use exact allowlists:

```js
function capRoute(v){ return /^(?:rounds|supervision|later)$/.test(v)?v:null; }
function capState(v){ return v==='done'?'done':'open'; }

function capLegacyRoute(item){
  if(item.status==='supervision')return 'supervision';
  if(item.status==='scheduled')return 'later';
  return null;
}
```

`capRead()` always returns v2 normalized objects. `capAdd()` writes `{route:null,state:'open'}`.
`capSetRoute()` rejects everything outside the three routes plus explicit `null`. Keep legacy
`capSetStatus` only as a short migration adapter until all call sites move in Task 2, then remove it.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/ward-capture.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the storage migration**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/ward-capture.test.mjs
git commit -m "feat: version captured-question routes"
```

### Task 2: Save-first routing and the oldest-unrouted Today card

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1500-1665, 2220-2280, 2597-2620`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js:79-115`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css:997-1017`
- Modify: `tests/fd-due.test.mjs`
- Modify: `tests/fd-wire.test.mjs`
- Modify: `tests/ward-capture.test.mjs`

**Interfaces:**
- Consumes: v2 functions from Task 1.
- Produces: `capRouteHtml(id) -> string`, `fdCaptureSummary(items) -> {oldest,total,unrouted}`, and route actions `data-cap-route` + `data-cap-id`.

- [ ] **Step 1: Add failing post-save and Today summary tests**

Pin the order: saved confirmation appears before optional route buttons. Assert the exact labels
Ask on rounds, Discuss in supervision, and Look up later. Assert the Today renderer emits one
question—the earliest `at` among open unrouted items—and `View all N`; routed items remain visible
inside the full dialog list. Assert Done remains available before any route is chosen and removes
that item without assigning a route.

```js
const summary = F.fdCaptureSummary([
  {id:'newer',at:20,route:null,state:'open'},
  {id:'older',at:10,route:null,state:'open'},
  {id:'routed',at:1,route:'rounds',state:'open'}
]);
assert.equal(summary.oldest.id, 'older');
assert.equal(summary.total, 3);
assert.equal(summary.unrouted, 2);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/ward-capture.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs`

Expected: FAIL on missing v2 UI/summary.

- [ ] **Step 3: Replace status actions with route actions**

After `capAdd` succeeds, render three optional buttons. Each calls `capSetRoute` and refreshes the
dialog/Today surface. Keep matched-resource Open now and separate Schedule review controls; Open
now does not assign a route. Schedule review may assign `later` only after `seedSRS(ref)` succeeds.

Change retained-list labels to Unrouted / Ask on rounds / Supervision / Look up later. Keep Delete
and Erase all reachable for every retained item.

- [ ] **Step 4: Render one compact Today item plus View all**

Move pure selection into `fd_due.js`. The compact card receives already normalized/escaped inputs,
shows the oldest unrouted text, and opens the existing dialog for the full list. If no unrouted
items exist, omit the compact card even when routed items remain stored.

Replace the inaccurate absolute disclosure with:

`Saved on this device. Nothing leaves unless you choose Copy or Email. No patient details.`

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/ward-capture.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/shell-copy.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit routing UI**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css tests/ward-capture.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/shell-copy.test.mjs
git commit -m "feat: route saved learning questions"
```

### Task 3: Pure MaineHealth email-draft builder

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_capture_email.js`
- Create: `tests/fd-capture-email.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py:790-830`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` snippet-marker region.
- Modify: `tests/fd-shell-boot.test.mjs`

**Interfaces:**
- Produces: `fdEmailLocalPart(value) -> string|null`, `fdEmailAddress(value) -> string|null`, `fdEmailSelection(items,ids) -> Array`, `fdEmailDigest(index,items,origin) -> {subject,body}`, `fdEmailMailto(localPart,digest,maxLength) -> {ok,href,reason}`.
- Consumes: normalized v2 items and canonical same-origin source routes only.

- [ ] **Step 1: Write failing validation, selection, grouping, and injection tests**

```js
test('recipient is one local part under the locked domain', () => {
  assert.equal(F.fdEmailLocalPart('faculty.name'), 'faculty.name');
  for (const bad of ['a@b','a b','a,b','a;b','a\nbcc:x','','.faculty','faculty.','faculty..name'])
    assert.equal(F.fdEmailLocalPart(bad), null);
  assert.equal(F.fdEmailAddress('faculty.name'), 'faculty.name@mainehealth.org');
});

test('digest groups selected questions deterministically without metadata leakage', () => {
  const d = F.fdEmailDigest({byRef:{'page.md':{ref:'page.md',title:'Interview structure'}}}, [
    {id:'b',text:'Later?',route:'later',ctx:'page.md'},
    {id:'a',text:'Rounds?',route:'rounds',ctx:null}
  ], 'https://example.test');
  assert.match(d.body, /Ask on rounds[\s\S]*Rounds\?[\s\S]*Look up later[\s\S]*Later\?/);
  assert.match(d.body, /Interview structure[\s\S]*https:\/\/example\.test\/\?page=page\.md/);
  assert.match(d.body, /learner-prepared teaching digest[\s\S]*no patient information/i);
  assert.doesNotMatch(d.body, /updatedAt|readingPlaces|practice/i);
});
```

Cover duplicate ids, inherited values, unselected items, CR/LF header injection, fixed subject,
URI encoding, an explicit max-length failure with no truncation, and source routes that are not
same-origin/canonical.

- [ ] **Step 2: Run the new suite and verify RED**

Run: `node --test tests/fd-capture-email.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the pure builder**

Use one locked constant and no recipient persistence:

```js
var FD_EMAIL_DOMAIN='mainehealth.org';
var FD_EMAIL_LOCAL=/^(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._+\-]{0,62}[A-Za-z0-9])$/;

function fdEmailLocalPart(value){
  var v=String(value||'').trim();
  return FD_EMAIL_LOCAL.test(v)&&v.indexOf('..')<0?v:null;
}

function fdEmailAddress(localPart){
  var local=fdEmailLocalPart(localPart);
  return local?local+'@'+FD_EMAIL_DOMAIN:null;
}
```

Build the body from selected items only, in route order `rounds`, `supervision`, `later`, `null`.
Resolve each `ctx` only through the canonical index; if it resolves, include that index title and an
origin-relative `/?page=<encoded ref>` URL, otherwise omit source metadata. Never trust a stored
title or URL. Start with the approved no-patient-information teaching-digest statement. Use
`encodeURIComponent` for recipient, subject, and body. Return `{ok:false,reason:'too-long'}` rather
than truncating.

- [ ] **Step 4: Register/inject the module and verify GREEN**

Add one unique `/*__FD_CAPTURE_EMAIL__*/` marker after capture/state helpers and pin it in
`fd-shell-boot.test.mjs`.

Run: `node --test tests/fd-capture-email.test.mjs tests/fd-shell-boot.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the pure builder**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_capture_email.js 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-capture-email.test.mjs tests/fd-shell-boot.test.mjs
git commit -m "feat: build MaineHealth question email drafts"
```

### Task 4: Selection, review gate, mail-app handoff, and fallbacks

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1464-1665, 2597-2620`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/ward-capture.test.mjs`
- Modify: `tests/fd-wire.test.mjs`
- Modify: `tests/fd-action-contract.test.mjs`

**Interfaces:**
- Consumes: Task 3 pure functions and v2 open items.
- Produces: accessible `capEmailOpen(invoker)`, `capEmailPreview()`, and fallback behavior; no send result.

- [ ] **Step 1: Add failing dialog and action tests**

Assert nothing is preselected, Open email draft is disabled until one item, valid local part, and
the PHI affirmation are all present, the suffix is immutable text, and the recipient disappears
after close/reopen.

Assert the click creates an anchor with the pure `mailto:` href and invokes `click()` exactly once.
Keep Copy email text visible after that click. For `too-long`, assert no mailto anchor is clicked.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/ward-capture.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-capture-email.test.mjs`

Expected: FAIL on missing email UI/actions.

- [ ] **Step 3: Implement the learner-controlled dialog**

From the full capture inbox, add checkboxes labelled by each question's opening words and an
**Email selected questions** button. Open a separate modal with:

- selected count and grouped preview;
- `<input>` for local part plus adjacent immutable `@mainehealth.org`;
- inline validation;
- required no-PHI checkbox;
- Open email draft;
- Copy email text; and
- a read-only selectable `<textarea>` revealed when Clipboard API rejects or is absent.

Reuse the capture dialog's focus-trap/return-focus pattern but keep separate node ids. Never store
the local part. On close, discard selection, local part, affirmation, and generated URI.

- [ ] **Step 4: Implement handoff without claiming success**

Create a detached `<a href="mailto:...">`, call its `.click()` from the learner's explicit button
event, and remove it. Leave the preview open with this copy:

`Your mail app may have opened. Review the recipient and message there, then press Send yourself.`

Do not mark questions done/shared and do not emit analytics. Always leave Copy email text available
because browsers cannot reliably report whether a mail handler opened.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/ward-capture.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-capture-email.test.mjs tests/shell-copy.test.mjs`

Expected: PASS.

- [ ] **Step 6: Update class inventory and commit**

Document email modal, field/suffix grouping, selectable fallback, focus trap, and state classes.

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/ward-capture.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/shell-copy.test.mjs
git commit -m "feat: prepare learner-reviewed faculty email"
```

### Task 5: Browser, privacy, and full-gate verification

**Files:**
- Modify: `tests/smoke/ward-capture.spec.js`
- Modify: `tests/smoke/front-door.spec.js`

**Interfaces:**
- Consumes: built MS3/resident sites, APP invitation, fake clipboard, and intercepted mailto anchor.
- Produces: deterministic proof of save-first routing and user-controlled export.

- [ ] **Step 1: Add failing browser journeys**

Cover:

- risky text held before save;
- safe question saved before route;
- reload leaves it unrouted and Today shows it as oldest;
- route choices persist locally;
- View all exposes routed and unrouted retained text;
- no email item preselected;
- suffix cannot be edited;
- invalid/header-injection recipient blocked;
- affirmation required;
- mailto contains only selected questions and canonical source links;
- no network request occurs when preparing the draft;
- clipboard rejection reveals selectable text;
- long digest is not truncated;
- modal close restores focus and forgets recipient.

- [ ] **Step 2: Build both audiences sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: PASS.

- [ ] **Step 3: Run focused browser tests and verify GREEN after repairs**

Run:

```bash
cd tests/smoke
npx playwright test ward-capture.spec.js front-door.spec.js --grep "route|email draft"
```

Expected: PASS.

- [ ] **Step 4: Run affected unit suites and the full gate**

Run:

```bash
node --test tests/ward-capture.test.mjs tests/fd-capture-email.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-shell-boot.test.mjs tests/shell-copy.test.mjs
bash bin/verify.sh
```

Expected: PASS.

- [ ] **Step 5: Commit browser coverage**

```bash
git add tests/smoke/ward-capture.spec.js tests/smoke/front-door.spec.js
git commit -m "test: verify question routing and email draft"
```

Record real Mail/Outlook handoff and native VoiceOver as manual evidence. A generated `mailto:`
string and Chromium click do not prove a configured client, delivery, or accessibility on a native
device.
