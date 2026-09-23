# Verified Offline Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show whether the current week or APP route is actually available from the active device cache, while clearly separating offline-capable content from media, live services, external links, and email delivery.

**Architecture:** Reuse the existing atomic non-media precache. Add a bounded same-origin MessageChannel request that asks the active service worker to verify current-route URLs against its current versioned cache. A pure Front Door module derives eligible URLs and normalizes responses; Today/On shift renders checking, ready, update-available, or not-ready states without persisting a readiness claim.

**Tech Stack:** ES5 browser JavaScript, Service Worker CacheStorage, MessageChannel, Node `node:test`, Playwright offline mode.

**Spec:** `docs/superpowers/specs/2026-09-23-on-the-go-learning-design.md`

## Global Constraints

- Do not create a second week-specific cache or Download shift pack action.
- Ready requires an active worker response and every requested eligible URL present in the current cache.
- Timeout, unsupported browser, malformed response, uncontrolled page, or missing file are not ready.
- Media/Anki exclusions and Range-request behavior remain unchanged.
- Live Interview Room/services, external links, media, and actual email sending remain connection-required.
- Refresh uses `registration.update()` and the existing waiting-worker/Refresh/Later flow; it never force-reloads an active tool.
- Readiness response contains URLs/version only—no learner state or content text.
- No readiness analytics or persistent “last checked” timestamp.
- Faculty preview cannot mutate or claim learner-device readiness.

## Review Focus

- A controller from an old version with a newer worker waiting must report current cache ready plus update available, not missing/not ready.
- A message containing external, protocol-relative, traversal, query-injected, or more than 200 URLs must be rejected without cache probing.
- A timed-out MessageChannel response must settle once as not ready and ignore a late worker reply.
- Switching from MS3 week mode to non-persistent APP invitation must derive a fresh route URL set and cannot reuse the previous ready state.
- Browser offline mode must preserve cached navigation while media/live services remain visibly connection-required and untouched by `respondWith`.

---

## File map

- Create `13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js`: pure URL derivation, request/response normalization, status model, and markup.
- Modify `13_Faculty_Resources/_automation/site_build/common.py`: inject the module.
- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html`: marker and live request/render lifecycle.
- Modify `13_Faculty_Resources/_automation/site_build/sw_template.js`: bounded verification message handler.
- Modify `13_Faculty_Resources/_automation/site_build/sw_register.js`: expose current registration/update state without changing update-toast behavior.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`: compact Shift-ready entry point.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js`: APP On shift placement.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`: open/close/refresh actions.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`: states and inventory.
- Modify `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`.
- Create `tests/fd-offline.test.mjs`.
- Create `tests/service-worker.test.mjs`: VM-backed request-validation/cache-result contract for `sw_template.js`.
- Modify `13_Faculty_Resources/_automation/site_build/test_common.py`: emitted-worker/precache regression assertions.
- Modify `tests/fd-today.test.mjs`, `tests/fd-wire.test.mjs`, `tests/fd-shell-boot.test.mjs`.
- Modify `tests/smoke/offline.spec.js` and `tests/smoke/playwright.config.js`: service-worker-enabled MS3 and resident journeys, with the APP invitation exercised on the resident site; the MS3 site has no APP entry.

### Task 1: Pure route inventory and status model

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js`
- Create: `tests/fd-offline.test.mjs`

**Interfaces:**
- Produces: `fdOfflineUrls(index,state) -> Array<string>`, `fdOfflineResponse(value,expected) -> Object|null`, `fdOfflineStatus(input) -> {kind,label,detail,missing}`, `fdOfflineCard(state) -> string`.
- Consumes: canonical `FD_INDEX`, APP route refs, and untrusted worker responses.

- [ ] **Step 1: Write failing URL and state tests**

```js
test('route urls are canonical, unique, and audience scoped', () => {
  const urls = F.fdOfflineUrls(INDEX, { appMode:false, week:2 });
  assert.deepEqual(urls, [...new Set(urls)]);
  assert.ok(urls.includes('/'));
  assert.ok(urls.includes('/search-index.json'));
  assert.ok(urls.every((u) => u==='/' || u==='/search-index.json' ||
    /^\/(?:content|tools)\/[A-Za-z0-9._-]+$/.test(u)));
  assert.equal(urls.some((u) => /\.(?:mp3|mp4|wav|m4a|vtt)$/i.test(u)), false);
});

test('ready is fail-closed over the expected set', () => {
  const expected=['/content/a.md','/tools/b.html'];
  assert.equal(F.fdOfflineResponse({version:'abc123',ready:true,present:expected,missing:[]},expected).ready,true);
  assert.equal(F.fdOfflineResponse({version:'abc123',ready:true,present:[expected[0]],missing:[]},expected),null);
});
```

Cover invalid refs, rights/external URLs, APP route derivation, no week, duplicate route items,
malformed response arrays, unexpected URLs, missing items, update-available, timeout, unsupported,
and not-controlled states.

- [ ] **Step 2: Run the new suite and verify RED**

Run: `node --test tests/fd-offline.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement pure derivation and model**

Map `.html` tool refs to `/tools/<ref>` and markdown refs to `/content/<ref>`. Include only the
current week or APP pathway entries from build-injected canonical data. A route is checkable only
when it contains at least one eligible canonical reading or tool. Include `/` and
`/search-index.json` with that nonempty route, because the card explicitly claims shell/navigation
and search-data readiness. Filter media extensions and any ref containing slash traversal, query,
fragment, or a scheme.

Normalize response sets by exact equality with the expected request set. `fdOfflineStatus` returns
one of `checking`, `ready`, `update`, or `not-ready`; no truthy fallback maps to ready.

- [ ] **Step 4: Run the suite and verify GREEN**

Run: `node --test tests/fd-offline.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the pure offline model**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js tests/fd-offline.test.mjs
git commit -m "feat: model verified offline readiness"
```

### Task 2: Service-worker verification handshake

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/sw_template.js:1-45`
- Modify: `13_Faculty_Resources/_automation/site_build/sw_register.js:15-48`
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py:785-875`
- Create: `tests/service-worker.test.mjs`

**Interfaces:**
- Consumes message: `{type:'CW_OFFLINE_VERIFY',urls:Array<string>}` plus `event.ports[0]`.
- Produces response: `{version:string,ready:boolean,present:Array<string>,missing:Array<string>}`.
- Produces registration API: `clerkshipSWRegistration() -> ServiceWorkerRegistration|null`, `requestClerkshipSWUpdate() -> Promise<boolean>`.

- [ ] **Step 1: Add a focused VM-backed service-worker harness**

Create `tests/service-worker.test.mjs`. Load `sw_template.js` through `vm.runInNewContext` with fake
`self.addEventListener`, `caches.open`, `cache.match`, and `port.postMessage` objects. Capture the
registered `message` and `fetch` handlers so the tests execute production code rather than copied
helpers. Keep `tests/smoke/offline.spec.js` as the end-to-end browser proof.

- [ ] **Step 2: Add failing request-validation and cache-result tests**

Test exact allowed root-relative paths, maximum 200 URLs, duplicate removal, external/traversal
rejection, missing port, cache open rejection, complete cache, one missing entry, and current
`VERSION` in the response. Assert media remains ignored by the fetch handler and absent from
PRECACHE.

- [ ] **Step 3: Run the focused service-worker test and verify RED**

Run: `node --test tests/service-worker.test.mjs`

Expected: FAIL because `CW_OFFLINE_VERIFY` is not handled.

- [ ] **Step 4: Implement the bounded message handler**

Extend the existing message listener without changing `SKIP_WAITING`:

```js
if(ev.data&&ev.data.type==='CW_OFFLINE_VERIFY'&&ev.ports&&ev.ports[0]){
  var port=ev.ports[0], urls=offlineVerifyUrls(ev.data.urls);
  if(!urls){ port.postMessage({version:VERSION,ready:false,present:[],missing:[]}); return; }
  ev.waitUntil(caches.open(CACHE).then(function(cache){
    return Promise.all(urls.map(function(url){
      return cache.match(url,{ignoreSearch:false}).then(function(hit){ return {url:url,hit:!!hit}; });
    }));
  }).then(function(rows){
    var present=[],missing=[];
    rows.forEach(function(row){ (row.hit?present:missing).push(row.url); });
    port.postMessage({version:VERSION,ready:missing.length===0,present:present,missing:missing});
  }).catch(function(){ port.postMessage({version:VERSION,ready:false,present:[],missing:urls}); }));
}
```

The validator accepts only unique `/content/<safe-name>` and `/tools/<safe-name>` paths plus `/` and
`/search-index.json`. It rejects media extensions and over-limit arrays.

- [ ] **Step 5: Expose registration/update without changing current toast semantics**

Store the resolved registration in module-private state. `requestClerkshipSWUpdate()` returns
`Promise.resolve(false)` when unsupported/unregistered and resolves `true` only after `reg.update()`
fulfills. It does not post `SKIP_WAITING`; the existing learner Refresh button remains authoritative.

- [ ] **Step 6: Run focused tests and static QA tests**

Run:

```bash
node --test tests/service-worker.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py TestServiceWorkerEmission
node --test tests/*.test.mjs
```

Expected: PASS, including precache/media integrity.

- [ ] **Step 7: Commit the handshake**

```bash
git add 13_Faculty_Resources/_automation/site_build/sw_template.js 13_Faculty_Resources/_automation/site_build/sw_register.js 13_Faculty_Resources/_automation/site_build/test_common.py tests/service-worker.test.mjs
git commit -m "feat: verify active offline cache"
```

### Task 3: Inject the module and wire live readiness requests

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/common.py:790-830`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` marker and Front Door runtime.
- Modify: `tests/fd-shell-boot.test.mjs`
- Modify: `tests/fd-wire.test.mjs`

**Interfaces:**
- Consumes: `fdOfflineUrls`, `fdOfflineResponse`, active service-worker controller, and MessageChannel.
- Produces: `fdCheckOffline(urls,options) -> Promise<normalized response>` with a 1500 ms default timeout; transient state `offlineStatus` only.

- [ ] **Step 1: Add failing injection and timeout/race tests**

Use fake MessageChannel/controller objects. Assert one request, exact URL payload, a 1500 ms timeout,
late-response suppression, controller change cancellation, malformed response rejection, and a new
request when week/APP route changes. Assert faculty preview issues no request and never renders a
ready claim.

```js
const result = await F.fdCheckOffline(['/content/a.md'], {
  controller, MessageChannel: FakeChannel, timeoutMs: 1500, setTimer, clearTimer
});
assert.deepEqual(result, {version:'abc',ready:true,present:['/content/a.md'],missing:[]});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/fd-offline.test.mjs tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs`

Expected: FAIL on missing injection/runtime.

- [ ] **Step 3: Register the module and request lifecycle**

Add one `/*__FD_OFFLINE__*/` marker after Front Door data modules. On eligible Today/On shift
render, set checking, request current URLs, validate the reply through `fdOfflineResponse`, and
render ready/not-ready. Use a monotonically increasing generation token so a late week/role reply
cannot overwrite the new route's state.

Keep the status in controller/runtime memory only. Destroy timers and channel ports on rerender and
controller teardown.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/fd-offline.test.mjs tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit runtime verification**

```bash
git add 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-offline.test.mjs tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs
git commit -m "feat: check route offline readiness"
```

### Task 4: Today/APP readiness card and refresh action

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js:1-70`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/fd-offline.test.mjs`
- Modify: `tests/fd-today.test.mjs`
- Modify: `tests/fd-wire.test.mjs`

**Interfaces:**
- Consumes: transient `offlineStatus`, current route labels/counts, `requestClerkshipSWUpdate()`.
- Produces: `data-fd-offline-open`, `data-fd-offline-close`, `data-fd-offline-refresh` actions and accessible card markup.

- [ ] **Step 1: Add failing four-state render tests**

Assert checking never contains Ready; ready identifies verified readings/tools and device-only state;
update state says current copy works and a newer copy is available; not-ready names the reason.

Assert every detailed card always lists connection-required exceptions: audio/video, live services,
external links, and email sending. Status cannot rely on color alone.

- [ ] **Step 2: Add failing refresh-action tests**

Online refresh calls `requestClerkshipSWUpdate()` once and leaves active tool/page state intact.
Offline refresh does not call it and renders `Refresh needs a connection; your verified copy remains available.`

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test tests/fd-offline.test.mjs tests/fd-today.test.mjs tests/fd-wire.test.mjs`

Expected: FAIL on missing card/actions.

- [ ] **Step 4: Implement compact entry and detailed card**

Place the compact status after the current primary Today/On shift action, not above it. The detailed
card lists current route scope, eligible present/missing counts, device-only saved state, and fixed
connection-required categories. Render “Checked just now” only after a response in the current
runtime session.

Register the three handled attributes and semantics. Refresh stays in place and reports update
check success/failure without reloading.

- [ ] **Step 5: Update CSS/class inventory and verify GREEN**

Document `.fd-offline`, `.fd-offline__status`, `.fd-offline__inventory`, and state classes
`.is-checking`, `.is-ready`, `.is-update`, `.is-not-ready`.

Run: `node --test tests/fd-offline.test.mjs tests/fd-today.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit learner-facing readiness**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/fd-offline.test.mjs tests/fd-today.test.mjs tests/fd-wire.test.mjs tests/fd-action-contract.test.mjs
git commit -m "feat: show verified shift readiness"
```

### Task 5: Offline browser and full-gate verification

**Files:**
- Modify: `tests/smoke/offline.spec.js`
- Modify: `tests/smoke/playwright.config.js`

**Interfaces:**
- Consumes: locally served built sites with secure/localhost service-worker support.
- Produces: online-install then offline-reload evidence for both audiences, including resident APP mode.

- [ ] **Step 1: Add failing browser journeys**

Extend the existing `offline` project into `offline-ms3` and `offline-res`, both limited to
`offline.spec.js` with `serviceWorkers:'allow'`. In the resident project, also run the
non-persistent `?audience=app` journey for PA and PMHNP; the MS3 project explicitly verifies that
APP mode is absent. For the MS3, resident, and resident APP contexts:

1. load online and wait for service-worker control;
2. open the detailed check and assert Ready only after response;
3. switch browser context offline;
4. reload a current-route reading and bundled tool;
5. assert cached search/navigation remains available;
6. assert media/live/email-delivery exceptions remain labelled connection-required;
7. corrupt one requested cache entry in a controlled fixture and assert Not ready;
8. simulate no service-worker support and timeout; and
9. install a waiting worker during a tool session and assert no forced reload.

- [ ] **Step 2: Build both audiences sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both PASS, including service-worker integrity scan and 10 MB budget.

- [ ] **Step 3: Run focused browser tests and verify GREEN after repairs**

Run: `cd tests/smoke && npx playwright test offline.spec.js --grep "offline readiness"`

Expected: PASS in the service-worker-capable local project. Do not use the deploy-preview LFS/media
soft context as proof that media works offline.

- [ ] **Step 4: Run affected tests and the full local gate**

Run:

```bash
node --test tests/service-worker.test.mjs tests/fd-offline.test.mjs tests/fd-today.test.mjs tests/fd-wire.test.mjs tests/fd-shell-boot.test.mjs tests/fd-action-contract.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py TestServiceWorkerEmission
bash bin/verify.sh
```

Expected: PASS.

- [ ] **Step 5: Commit browser coverage**

```bash
git add tests/smoke/offline.spec.js tests/smoke/playwright.config.js
git commit -m "test: verify offline shift readiness"
```

Record real-device ward-network behavior as manual evidence; localhost offline simulation does not
prove captive-portal or institutional Wi-Fi behavior.
