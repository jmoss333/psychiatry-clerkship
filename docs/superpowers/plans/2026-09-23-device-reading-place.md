# Device Reading Place Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quietly remember and restore each reading's position on the current device, with one truthful status line at the bottom of the page and no inline stopping markers.

**Architecture:** Add a focused pure module for sanitizing, updating, bounding, and resolving reading-place records. Persist the bounded map inside the existing `cw_frontdoor_v1` allowlisted state, while DOM wiring in the shell assigns deterministic heading ids, records a debounced heading-relative offset, and restores only after the reading has rendered.

**Tech Stack:** ES5 browser JavaScript, localStorage, DOM scroll/visibility APIs, Node `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-on-the-go-learning-design.md`

## Global Constraints

- The only success copy is `Reading place saved on this device only`, at the bottom of readings.
- No “safe to stop” markers, save buttons, progress celebrations, or repeated live-region announcements.
- Store page ref, deterministic heading id, clamped heading-relative offset, and update time only.
- Cap records at 50 and evict least-recently-updated first.
- `scrollPos` continues to mean originating-list position and is not reused.
- Never persist tool inputs, question/practice answers, APP calibration, or clinical responses.
- Faculty preview cannot write or restore learner state.
- Use ES5 in injected modules and `cw_*` namespace rules.

## Review Focus

- A heading renamed or removed by a content update must open at top and delete only that stale page record.
- A page with duplicate or punctuation-only headings must still receive deterministic, unique ids.
- A localStorage quota/security failure must change the footer to failure copy and never retain a false success state.
- Restoring after responsive reflow must use heading plus offset, not the old absolute scroll pixel.
- A guest deep link without learner setup may read normally but must not persist a reading place until learner storage is allowed by the existing shell mode.

---

## File map

- Create `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reading_place.js`: pure record/id/position helpers.
- Modify `13_Faculty_Resources/_automation/site_build/common.py`: inject the new module through a unique marker.
- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html`: marker plus DOM install/save/restore lifecycle.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js`: allowlist `readingPlaces` and make `fdSave` report success.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js`: reading-only footer and Start at top control.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`: mark existing Continue reading actions for one-shot focus restoration.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js`: mark existing resume-reading actions for one-shot focus restoration.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`: Start at top action and resource lifecycle cleanup.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`: understated footer/restored-place affordance.
- Modify `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`: new reader descendants.
- Create `tests/fd-reading-place.test.mjs`: pure module contract.
- Modify `tests/fd-state.test.mjs`, `tests/fd-reader.test.mjs`, `tests/fd-today.test.mjs`, `tests/fd-due.test.mjs`, `tests/fd-wire.test.mjs`, `tests/fd-action-contract.test.mjs`, `tests/fd-shell-boot.test.mjs`.
- Modify `tests/smoke/front-door.spec.js`: reload/resume/storage-failure journeys.

### Task 1: Pure reading-place records and deterministic heading ids

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reading_place.js`
- Create: `tests/fd-reading-place.test.mjs`

**Interfaces:**
- Produces: `fdReadingPlaces(value) -> Object`, `fdReadingPlaceUpdate(places,ref,heading,offset,nowMs) -> Object`, `fdReadingPlaceDrop(places,ref) -> Object`, `fdReadingHeadingIds(labels) -> Array<string>`, `fdReadingResume(place,availableIds) -> Object|null`.
- Consumes: JSON-compatible untrusted values only; no DOM and no localStorage.

- [ ] **Step 1: Write failing validation, cap, collision, and stale-id tests**

```js
test('reading places reject malformed records and keep the newest fifty', () => {
  let places = {};
  for (let i=0; i<51; i++) {
    places = F.fdReadingPlaceUpdate(places, `p-${i}.md`, `heading-${i}`, i, 1000+i);
  }
  assert.equal(Object.keys(places).length, 50);
  assert.equal(places['p-0.md'], undefined);
  assert.deepEqual(F.fdReadingPlaces({ bad:{heading:'',offset:-1,updatedAt:'x'} }), {});
});

test('heading ids are deterministic and unique', () => {
  assert.deepEqual(F.fdReadingHeadingIds(['Thought Process','Thought Process','...']),
    ['fd-reading-thought-process','fd-reading-thought-process-2','fd-reading-section-3']);
});

test('resume rejects a heading removed by a content update', () => {
  assert.equal(F.fdReadingResume({heading:'old',offset:20,updatedAt:1}, ['new']), null);
});
```

Also cover prototype-like keys, inherited properties, NaN/Infinity offsets, offset clamping, invalid
refs, and deterministic LRU eviction when timestamps tie.

- [ ] **Step 2: Run the new suite and verify RED**

Run: `node --test tests/fd-reading-place.test.mjs`

Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Implement the minimal pure module**

Use constants and clone-only updates:

```js
var FD_READING_PLACE_LIMIT=50;
var FD_READING_OFFSET_MAX=100000;

function fdReadingPlaceUpdate(places,ref,heading,offset,nowMs){
  var out=fdReadingPlaces(places), keys, oldest;
  if(!fdReadingRef(ref)||!fdReadingHeading(heading))return out;
  out[ref]={heading:heading,offset:fdReadingOffset(offset),updatedAt:fdReadingTime(nowMs)};
  keys=Object.keys(out);
  while(keys.length>FD_READING_PLACE_LIMIT){
    oldest=fdReadingOldest(out,keys); delete out[oldest]; keys=Object.keys(out);
  }
  return out;
}
```

Heading slugging must normalize to lowercase ASCII letters/digits/hyphens, prefix every id with
`fd-reading-`, fall back to `section-N`, and append `-2`, `-3`, etc. for collisions in document
order. The prefix prevents collisions with authored anchors and shell ids.

- [ ] **Step 4: Run the suite and verify GREEN**

Run: `node --test tests/fd-reading-place.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the pure data contract**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_reading_place.js tests/fd-reading-place.test.mjs
git commit -m "feat: define device reading-place records"
```

### Task 2: Inject the module and persist it through Front Door state

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py:790-830`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` near the Front Door snippet markers.
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js:20-34`
- Modify: `tests/fd-state.test.mjs`
- Modify: `tests/fd-shell-boot.test.mjs`

**Interfaces:**
- Consumes: sanitized `readingPlaces` from Task 1.
- Produces: `fdSave(state) -> boolean`; persisted `cw_frontdoor_v1.readingPlaces` only when valid.

- [ ] **Step 1: Add failing injection and state round-trip tests**

Pin one unique marker, emitted module bytes, and a store that drops malformed entries:

```js
assert.equal(F.fdSave({ tab:'today', readingPlaces:{'a.md':{heading:'one',offset:4,updatedAt:7}} }), true);
assert.deepEqual(JSON.parse(ls.getItem('cw_frontdoor_v1')).readingPlaces,
  {'a.md':{heading:'one',offset:4,updatedAt:7}});
assert.equal(F.fdSave({ readingPlaces:{'bad':{heading:'',offset:-2}} }), true);
assert.deepEqual(JSON.parse(ls.getItem('cw_frontdoor_v1')).readingPlaces, {});
```

Use a throwing localStorage stub and assert `fdSave(...) === false`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/fd-state.test.mjs tests/fd-shell-boot.test.mjs`

Expected: FAIL on missing marker/state field and `fdSave` result.

- [ ] **Step 3: Register the module and state field**

Add `/*__FD_READING_PLACE__*/` to `SNIPPET_MARKERS`, add it once in `spa_index.html` after
`FD_STATE`, and extend `FD_KEYS` with `readingPlaces`. Before persistence, sanitize through
`fdReadingPlaces()`.

Change `fdSave` to return `true` only after `localStorage.setItem` succeeds and `false` from its
catch path. Existing callers may ignore the return value.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/fd-state.test.mjs tests/fd-shell-boot.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit injection and persistence**

```bash
git add 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js tests/fd-state.test.mjs tests/fd-shell-boot.test.mjs
git commit -m "feat: persist bounded reading places"
```

### Task 3: Reader footer, DOM tracking, and restoration

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js:350-395`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js:192-245`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js:44-77`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:1-70, 1180-1395`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:1360-1395, 2303-2480`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/fd-reader.test.mjs`
- Modify: `tests/fd-today.test.mjs`
- Modify: `tests/fd-due.test.mjs`
- Modify: `tests/fd-wire.test.mjs`
- Modify: `tests/fd-action-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 helpers plus `state.readingPlaces` and `fdSave(state) -> boolean`.
- Produces: `fdInstallReadingPlace(reader,ref,state,{allowStorage:boolean,focusOnRestore:boolean,...}) -> {destroy:function,startAtTop:function}` and `data-fd-reading-top` action.

- [ ] **Step 1: Add failing reader-markup tests**

Assert readings emit an initially empty bottom status hook and a hidden-until-restored Start at top
action, while tools, Progress, guide mode, and faculty preview do not claim a save. The empty initial
state is load-bearing: success copy appears only after the runtime verifies a device write.

```js
assert.match(reading, /class="fd-reading-place"[^>]*data-fd-reading-status[^>]*><\/p>/);
assert.doesNotMatch(tool, /fd-reading-place/);
assert.doesNotMatch(appPractice, /fd-reading-place/);
```

- [ ] **Step 2: Add failing DOM lifecycle tests**

Use a fake reader with three headings and fake scroll positions. Cover deterministic id assignment,
debounced latest-position writes, restore after body render, stale heading drop, Start at top, page
switch cleanup, pagehide flush, guest/faculty-preview no-write, and throwing storage. Assert a
successful first write sets the exact approved success copy and a failed/disallowed write sets only
the failure copy.

Add action tests showing that existing Today Continue/resume reading controls carry one fixed
`data-fd-reading-resume="1"` metadata marker, while Library/search links do not. Assert that marker
sets `focusOnRestore:true` for exactly the next reading install, then clears; ordinary opens pass
`false`. Register the marker as non-dispatch metadata in the action contract so it never competes
with the control's existing `data-fd-open` route.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test tests/fd-reader.test.mjs tests/fd-today.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-reading-place.test.mjs`

Expected: FAIL on missing footer/lifecycle.

- [ ] **Step 4: Add reading-only footer markup**

Append after `.fd-article__source` and before reader actions:

```html
<p class="fd-reading-place" data-fd-reading-status></p>
<button type="button" class="fd-reading-place__top" data-fd-reading-top hidden>
  Start at top
</button>
```

On install, the runtime immediately persists the current top/nearest-heading record. Only a verified
successful `fdSave` sets `Reading place saved on this device only`; a failed or disallowed write sets
`Reading place could not be saved on this device`. Do not use a success icon because the status can
change.

- [ ] **Step 5: Implement install/save/restore lifecycle**

After markdown and enhancements mount:

1. assign deterministic ids across the shell-rendered `.fd-article > .fd-h1` plus
   `.fd-article__body h2,h3,h4`, so even a reading saved above its first body heading has a stable
   top anchor;
2. if learner storage is allowed, restore the sanitized page record with `requestAnimationFrame`
   after layout, then write the resolved current record once to establish truthful success/failure
   status; if storage is not allowed, show failure copy and install no persistence listeners;
3. expose Start at top only when restoration occurred;
4. on debounced scroll (150 ms), find the final heading whose top is at/before the reading line,
   compute a clamped relative offset, update `state.readingPlaces`, and call `fdSave(state)`;
5. flush on `pagehide` and destroy listeners/timers before another resource mounts.

Do not announce automatic writes. `data-fd-reading-top` scrolls to the article heading, drops that
page's record, persists, and focuses the `<h1>` with `preventScroll` after the explicit scroll.
When `focusOnRestore` is true, focus the restored heading once after scrolling; otherwise restore
scroll only and leave focus on the document heading.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test tests/fd-reader.test.mjs tests/fd-today.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-reading-place.test.mjs`

Expected: PASS.

- [ ] **Step 7: Update class inventory and commit**

Document `.fd-reading-place`, `.fd-reading-place__top`, restored/failure states, and their exact
location under `.fd-article`.

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/fd-reader.test.mjs tests/fd-today.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs
git commit -m "feat: restore device reading place"
```

### Task 4: Browser and full-gate verification

**Files:**
- Modify: `tests/smoke/front-door.spec.js`

**Interfaces:**
- Consumes: built MS3/resident sites and localStorage/browser lifecycle.
- Produces: evidence for reload, responsive reflow, and failure states.

- [ ] **Step 1: Add failing browser journeys**

Add controlled pages with at least three headings. Scroll into heading 2, wait for the bounded
debounce, reload, and assert the heading-relative position is restored. Change viewport width and
assert the same heading remains the anchor. Replace the stored heading with a missing id and assert
top-of-page recovery plus record deletion.

Open that page once through Today Continue and assert restored-heading focus; open it again through
Library and search and assert the scroll restores without moving focus away from the document
heading.

Inject a throwing `Storage.prototype.setItem` fixture and assert failure copy rather than success.
Assert APP practice answers never appear inside `cw_frontdoor_v1`.

- [ ] **Step 2: Build both audiences sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: PASS for both.

- [ ] **Step 3: Run the focused browser tests, repair, and verify GREEN**

Run: `cd tests/smoke && npx playwright test front-door.spec.js --grep "reading place"`

Expected: PASS after only reading-place-related repairs.

- [ ] **Step 4: Run affected tests and full verification**

Run:

```bash
node --test tests/fd-reading-place.test.mjs tests/fd-state.test.mjs tests/fd-reader.test.mjs tests/fd-today.test.mjs tests/fd-due.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-shell-boot.test.mjs
bash bin/verify.sh
```

Expected: PASS.

- [ ] **Step 5: Commit browser coverage**

```bash
git add tests/smoke/front-door.spec.js
git commit -m "test: verify reading-place restoration"
```

Record real iOS/Safari and native VoiceOver restoration as manual evidence; Chromium alone cannot
prove either behavior.
