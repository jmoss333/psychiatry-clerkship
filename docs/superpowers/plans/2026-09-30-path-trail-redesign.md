# Path route "Trail" redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Path route's road pass exactly through every week stop, put all stop labels on one baseline, and show each week's progress as a ring on its stop, keeping the road neutral.

**Architecture:** `fd_path.js` generates the connector's `d` from the week count using two alternating stop heights, and the same numbers are exposed to CSS as custom properties on `.fd-pathroute`. The SVG is sized to exactly the weeks grid (`gap:0`, `vector-effect:non-scaling-stroke`), so stop centres land on the road at every width. The per-row `translateY` offsets are deleted. Only the number moves, inside a fixed-height band. The per-week ring is a CSS conic-gradient driven by `--fd-ring-pct`, the same mechanism Today's `.fd-ring` already uses, so no `stroke-dasharray` ever appears in Path HTML.

**Tech Stack:** ES5 Front Door modules (no `const`/`let`/arrows/template literals in `frontdoor/*.js`), plain CSS with `--fd-*` tokens only (no raw colour literals — `bin/check_design_drift.py` C2), `node --test`, Playwright smoke suite.

**Spec:** `docs/superpowers/specs/2026-09-29-path-trail-redesign-design.md`

## Global Constraints

- The connector stays neutral: exactly one `.fd-pathroute__connector`, never a state class, and no `stroke-dasharray|stroke-dashoffset|path-progress` anywhere in Path HTML (`tests/fd-path.test.mjs` pins this, so do not weaken it).
- Selected, current, and complete remain separate states: `is-sel` ← `viewWeek`, `aria-current="step"`/`.is-current`/"Current" ← `week`, `.is-done`/"Complete" ← saved progress. The ring derives from `fdTodayProgress(...).pct` for that week only, never from week order.
- Always emit `.fd-timeline__gutter > .fd-dot + .fd-timeline__line` on every row, the last one included.
- Keep `role="tab"`, `aria-selected`, `tabindex`, `aria-controls`, `data-fd-view-week`, and the detail panel's `aria-labelledby` unchanged.
- Copy ships to both sites and must stay audience-neutral (no MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford).
- `frontdoor.css`: tokens only for colour; fill tokens (`--fd-terracotta`, `--fd-teal`, `--fd-olive`) never as `color:`; use `--fd-on-accent` for text on terracotta.
- Update `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` §4 in the same PR as the stylesheet.
- Commit from the host (git-lfs present). Never `--no-verify`. Branch: `claude/path-trail-2026-09-30`, opened as a draft PR on its first push.

## Review Focus

1. **Long titles or themes that wrap to 3 lines** must not push any stop's "WEEK n" label off the shared baseline. Pinned by the smoke check on `.fd-timeline__n` tops in Task 4.
2. **The 4-week route** must get a road built for 4 stops, not 6. Pinned by unit tests at n=4 (Task 1) and by the smoke suite running both audiences (Task 4).
3. **Narrow desktop widths (641–900 px)** must not overflow horizontally when six columns squeeze. Pinned by the 700 px pass in Task 4.
4. **Out-of-order completion** (week 4 done before week 3) must give week 4 a full ring and the "Complete" state. Pinned by a unit test in Task 2.
5. **A week with zero items** must show an empty ring and "0 activities", and must never be marked done. Pinned by a unit test in Task 2.

---

## File map

- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js`: geometry constants and helpers, generated connector, ring `style`, count copy.
- Modify `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css` (Path block ~L757–807 and the `@media (max-width:640px)` Path rules ~L864–881).
- Modify `tests/fd-path.test.mjs`, `tests/fd-path-route.test.mjs`, `tests/smoke/front-door.spec.js`.
- Modify `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` §4.

---

### Task 1: Generated connector geometry

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js` (top of file after the header comment; `fdPathRoute` ~L204)
- Test: `tests/fd-path.test.mjs`

**Interfaces:**
- Produces: `FD_PATH_BAND=190`, `FD_PATH_Y_LOW=118`, `FD_PATH_Y_HIGH=72`, `FD_PATH_VIEW_W=1000` (globals); `fdPathStopX(i, n) -> number`, `fdPathStopY(i) -> number`, `fdPathConnectorD(n) -> string`. Stop index `i` is 0-based; even `i` (odd `nth-child`) is LOW.

- [ ] **Step 1: Write the failing tests.** In `tests/fd-path.test.mjs`, extend the `make` return object with `fdPathConnectorD: fdPathConnectorD, fdPathStopX: fdPathStopX, fdPathStopY: fdPathStopY, FD_PATH_BAND: FD_PATH_BAND`, then add:

```js
function parseD(d) {
  const nums = d.replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number);
  const start = [nums[0], nums[1]];
  const segs = [];
  for (let i = 2; i < nums.length; i += 6) segs.push(nums.slice(i, i + 6));
  return { start, segs, cCount: (d.match(/C/g) || []).length };
}

for (const n of [4, 6]) {
  test(`the connector for ${n} stops starts on stop 1, ends on stop ${n}, and passes through every stop`, () => {
    const { start, segs, cCount } = parseD(F.fdPathConnectorD(n));
    assert.equal(cCount, n - 1);
    assert.deepEqual(start, [F.fdPathStopX(0, n), F.fdPathStopY(0)]);
    segs.forEach((seg, k) => {
      const i = k + 1;
      assert.deepEqual([seg[4], seg[5]], [F.fdPathStopX(i, n), F.fdPathStopY(i)], `segment ${k} ends on stop ${i + 1}`);
      assert.equal(seg[1], F.fdPathStopY(i - 1), 'horizontal tangent leaving the stop');
      assert.equal(seg[3], F.fdPathStopY(i), 'horizontal tangent arriving at the stop');
    });
  });
}

test('stop x is the column centre and stops alternate low/high', () => {
  assert.equal(F.fdPathStopX(0, 4), 125);
  assert.equal(F.fdPathStopX(3, 4), 875);
  assert.equal(F.fdPathStopY(0), 118);
  assert.equal(F.fdPathStopY(1), 72);
  assert.equal(F.fdPathConnectorD(1), 'M500 118');
  assert.equal(F.fdPathConnectorD(0), '');
});

test('the rendered route uses the generated connector and the shared band height', () => {
  const html = F.fdPath(IDX, s({}));
  assert.match(html, /viewBox="0 0 1000 190"/);
  assert.ok(html.includes('d="' + F.fdPathConnectorD(6) + '"'));
  const four = F.fdPath(FOUR_INDEX, s({}));
  assert.ok(four.includes('d="' + F.fdPathConnectorD(4) + '"'));
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `node --test tests/fd-path.test.mjs`. Expected: FAIL with `fdPathConnectorD is not defined`.

- [ ] **Step 3: Implement.** In `fd_path.js`, after the header comment:

```js
/* Route geometry -- ONE source for the road and the stops. Stops alternate between two heights
   inside a fixed band; frontdoor.css reads the same numbers as --fd-path-band / --fd-path-y-low /
   --fd-path-y-high on .fd-pathroute (tests/fd-path-route.test.mjs pins that they agree). x is in
   a 1000-wide viewBox stretched to the weeks grid (gap:0), so stop i of n sits at the centre of
   column i at any width; y is 1:1 with CSS px. The road stays neutral (#743): it is geometry
   only and never derives from week, viewWeek or progress. */
var FD_PATH_BAND=190, FD_PATH_Y_LOW=118, FD_PATH_Y_HIGH=72, FD_PATH_VIEW_W=1000;

function fdPathR2(v){ return Math.round(v*100)/100; }
function fdPathStopX(i, n){ return fdPathR2(FD_PATH_VIEW_W*(i+0.5)/n); }
function fdPathStopY(i){ return i%2===0?FD_PATH_Y_LOW:FD_PATH_Y_HIGH; }

function fdPathConnectorD(n){
  if(!(n>0)) return '';
  var h=FD_PATH_VIEW_W/(2*n), d='M'+fdPathStopX(0,n)+' '+fdPathStopY(0), i, x0, y0, x1, y1;
  for(i=1;i<n;i++){
    x0=fdPathStopX(i-1,n); y0=fdPathStopY(i-1); x1=fdPathStopX(i,n); y1=fdPathStopY(i);
    d+=' C'+fdPathR2(x0+h)+' '+y0+' '+fdPathR2(x1-h)+' '+y1+' '+x1+' '+y1;
  }
  return d;
}
```

In `fdPathRoute`, replace the two hard-coded `svg`/`path` lines with:

```js
  out+='<svg class="fd-pathroute__curve" viewBox="0 0 '+FD_PATH_VIEW_W+' '+FD_PATH_BAND+'" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
  out+='<path class="fd-pathroute__connector" d="'+fdPathConnectorD(weeks.length)+'"></path>';
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --test tests/fd-path.test.mjs`. Expected: all PASS, including the untouched neutral-connector test.

- [ ] **Step 5: Commit.**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js tests/fd-path.test.mjs
git commit -m "front door: generate the Path connector from the week count"
```

---

### Task 2: Stop progress ring and count copy (markup)

**Files:**
- Modify: `fd_path.js` → `fdPathTimelineRow` (~L176–201)
- Test: `tests/fd-path.test.mjs` (the existing count assertions change)

**Interfaces:**
- Consumes: `fdTodayProgress(items, doneMap) -> {done,total,pct,next}` (fd_today.js).
- Produces: `fdPathCountLabel(progress) -> string`; `.fd-timeline__number` carries `style="--fd-ring-pct:<pct>%"`.

- [ ] **Step 1: Update and add tests.** Change the existing assertions:
  - `>1\/2<` → `>1 of 2 done<`, and `>0\/1<` → `>1 activity<`, in "per-week counts render as done/total" (rename it to "per-week counts read as words").
  - In "a week with zero items…", `/0\/0/` → `/>0 activities</`.
  - In "repeated practice counters…", `count">1\/1` → `count">1 of 1 done`, and `count">0\/1` → `count">1 activity`.

  Then add:

```js
test('each stop carries its own week ring, independent of week order', () => {
  const html = F.fdPath(IDX, s({ week: 2, viewWeek: 2, done: { 'w4a.md': true, 'w5a.md': true } }));
  assert.match(rowFor(html, 4).body, /class="fd-timeline__number" aria-hidden="true" style="--fd-ring-pct:100%"/);
  assert.match(rowFor(html, 5).body, /style="--fd-ring-pct:50%"/);
  assert.match(rowFor(html, 3).body, /style="--fd-ring-pct:0%"/);
  assert.match(rowFor(html, 4).body, /class="fd-timeline__status">Complete<\/span>/);
});

test('a zero-item week has an empty ring and is never complete', () => {
  const emptyCur = buildCurriculum(WEEK_DEFS.map((w) => (w.n === 6 ? Object.assign({}, w, { refs: [] }) : w)));
  const idx = F.fdBuildIndex(emptyCur, FIX_META, FIX_TOOLS, FIX_MAN);
  const body = rowFor(F.fdPath(idx, s({})), 6).body;
  assert.match(body, /--fd-ring-pct:0%/);
  assert.doesNotMatch(body, /Complete/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `node --test tests/fd-path.test.mjs`. Expected: the count and ring tests FAIL.

- [ ] **Step 3: Implement.** Add above `fdPathTimelineRow`:

```js
/* The stop's count, in words. The ring on the number states the same fraction visually;
   this text is what a screen reader and a colour-blind reader get. */
function fdPathCountLabel(p){
  if(!p.total) return '0 activities';
  if(!p.done) return p.total+(p.total===1?' activity':' activities');
  return p.done+' of '+p.total+' done';
}
```

In `fdPathTimelineRow`, change the number span and the count span to:

```js
      '<span class="fd-timeline__number" aria-hidden="true" style="--fd-ring-pct:'+fdEsc(progress.pct)+'%">'+fdEsc(w.n)+'</span>'+
```
```js
    '<span class="fd-timeline__count">'+fdEsc(fdPathCountLabel(progress))+'</span>'+
```

- [ ] **Step 4: Run and check for stale references.** Run `node --test tests/fd-path.test.mjs`. Expected: PASS. Then run `grep -rn "timeline__count" tests/ 13_Faculty_Resources/_automation/site_build/frontdoor/` and update any other assertion that still reads the old `d/t` form.

- [ ] **Step 5: Commit.**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js tests/fd-path.test.mjs
git commit -m "front door: Path stops carry a per-week ring and a worded count"
```

---

### Task 3: Route CSS on one geometry, plus the class contract

**Files:**
- Modify: `frontdoor.css` Path block (replace from `/* The route is orientation…` through `.fd-pathroute .fd-timeline__count{…}`) and the Path rules inside `@media (max-width:640px)`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` §4
- Test: `tests/fd-path-route.test.mjs`

**Interfaces:**
- Consumes: `FD_PATH_BAND`, `FD_PATH_Y_LOW`, `FD_PATH_Y_HIGH` from Task 1; `--fd-ring-pct` inline from Task 2.
- Produces: custom properties `--fd-path-band`, `--fd-path-y-low`, `--fd-path-y-high`, `--fd-path-node`, `--fd-path-y`, `--fd-path-node-fill`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/fd-path-route.test.mjs`:

```js
const pathJs = read('frontdoor/fd_path.js');
const jsNum = (name) => Number(pathJs.match(new RegExp(name + '=(\\d+)'))[1]);
const cssNum = (name) => Number(css.match(new RegExp('--' + name + ':(\\d+)px'))[1]);

test('CSS stop heights and band equal the JS geometry that draws the road', () => {
  assert.equal(cssNum('fd-path-band'), jsNum('FD_PATH_BAND'));
  assert.equal(cssNum('fd-path-y-low'), jsNum('FD_PATH_Y_LOW'));
  assert.equal(cssNum('fd-path-y-high'), jsNum('FD_PATH_Y_HIGH'));
});

test('the road is sized to the weeks grid and the stops are not translated', () => {
  assert.match(css, /\.fd-pathroute__connector\{[^}]*vector-effect:non-scaling-stroke/);
  assert.match(css, /\.fd-pathroute__weeks\{[^}]*gap:0/);
  assert.match(css, /\.fd-pathroute__curve\{[^}]*height:var\(--fd-path-band\)/);
  assert.doesNotMatch(css, /\.fd-pathroute \.fd-timeline__row:nth-child\(\d\)\{transform/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row:nth-child\(even\)\{--fd-path-y:var\(--fd-path-y-high\)\}/);
});

test('every stop shows its theme and its ring; current is a flag, not a side dot', () => {
  assert.doesNotMatch(css, /\.fd-pathroute \.fd-timeline__theme\{[^}]*display:none/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__number\{[^}]*conic-gradient\(var\(--fd-teal\) var\(--fd-ring-pct\)/);
  assert.match(css, /\.fd-pathroute \.fd-timeline__row\[aria-current="step"\] \.fd-timeline__status\{[^}]*position:absolute/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `node --test tests/fd-path-route.test.mjs`. Expected: the three new tests FAIL.

- [ ] **Step 3: Replace the desktop Path route block** with:

```css
/* The route is orientation, not a progress meter. Its one connector is deliberately neutral;
 * selected, current, and completed are stated on each stop with shape plus visible words.
 * Geometry has ONE source: fd_path.js draws the road from FD_PATH_BAND / _Y_LOW / _Y_HIGH and
 * these properties carry the same numbers (tests/fd-path-route.test.mjs). */
.fd-pathroute{
  --fd-path-band:190px;--fd-path-y-low:118px;--fd-path-y-high:72px;--fd-path-node:72px;
  position:relative;margin:0 0 var(--fd-space-10);padding:var(--fd-space-8) var(--fd-space-7) var(--fd-space-4);
  overflow:hidden;border:1px solid var(--fd-line);border-radius:var(--fd-radius-lg);
  background:var(--fd-surface);box-shadow:var(--fd-shadow-sm);
}
.fd-pathroute__curve{position:absolute;top:var(--fd-space-8);left:var(--fd-space-7);width:calc(100% - 2 * var(--fd-space-7));height:var(--fd-path-band);pointer-events:none}
.fd-pathroute__connector{fill:none;stroke:var(--fd-line-strong);stroke-width:12;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.fd-pathroute__weeks{position:relative;z-index:1;display:grid;align-items:stretch;gap:0}
.fd-pathroute__weeks--6{grid-template-columns:repeat(6,minmax(0,1fr))}
.fd-pathroute__weeks--4{grid-template-columns:repeat(4,minmax(0,1fr))}

.fd-pathroute .fd-timeline__row{
  --fd-path-y:var(--fd-path-y-low);
  position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;align-content:start;
  width:auto;min-width:0;min-height:var(--fd-target-touch);margin:0 var(--fd-space-2);padding:0 var(--fd-space-2) var(--fd-space-6);
  border:0;border-radius:var(--fd-radius-md);background:transparent;color:var(--fd-text);
  text-align:center;font:inherit;cursor:pointer;
}
.fd-pathroute .fd-timeline__row:nth-child(even){--fd-path-y:var(--fd-path-y-high)}
.fd-pathroute .fd-timeline__row:hover{background:var(--fd-callout)}
.fd-pathroute .fd-timeline__row.is-sel{background:var(--fd-selected)}
.fd-pathroute .fd-timeline__row.is-sel::after{content:"";position:absolute;left:50%;bottom:var(--fd-space-3);width:40px;height:3px;margin-left:-20px;border-radius:var(--fd-radius-pill);background:var(--fd-terracotta)}
.fd-pathroute .fd-timeline__row:focus-visible{outline:3px solid var(--fd-focus);outline-offset:2px}
.fd-pathroute .fd-timeline__gutter{position:absolute;top:calc(var(--fd-path-y) + 14px);left:calc(50% + 16px);z-index:2;display:block}
.fd-pathroute .fd-timeline__line{display:none}
.fd-pathroute .fd-dot{display:none}
.fd-pathroute .fd-dot.is-done{display:grid;place-items:center;width:24px;height:24px;margin:0;border:3px solid var(--fd-surface);background:var(--fd-success);box-shadow:none}
.fd-pathroute .fd-dot.is-done::after{content:"";width:8px;height:4px;margin-top:-2px;border:solid var(--fd-on-accent);border-width:0 0 2px 2px;transform:rotate(-45deg)}
.fd-pathroute .fd-timeline__body{display:grid;grid-template-rows:var(--fd-path-band);justify-items:center;min-width:0;padding:0}
.fd-pathroute .fd-timeline__n{font-size:var(--fd-font-2xs);font-weight:750;letter-spacing:.09em;text-transform:uppercase;color:var(--fd-text-dim)}
.fd-pathroute .fd-timeline__number{
  --fd-ring-pct:0%;--fd-path-node-fill:var(--fd-surface);
  grid-row:1;align-self:start;display:grid;place-items:center;
  width:var(--fd-path-node);height:var(--fd-path-node);margin:calc(var(--fd-path-y) - var(--fd-path-node) / 2) 0 0;
  border:0;border-radius:var(--fd-radius-circle);
  background:radial-gradient(closest-side,var(--fd-path-node-fill) calc(100% - 6px),transparent calc(100% - 5px)),conic-gradient(var(--fd-teal) var(--fd-ring-pct),var(--fd-ring-track) 0);
  box-shadow:var(--fd-shadow-sm);
  color:var(--fd-teal-deep);font-family:Georgia,'Times New Roman',serif;font-size:var(--fd-font-2xl);font-weight:700;line-height:1;
  transition:box-shadow .16s ease;
}
.fd-pathroute .fd-timeline__row.is-sel .fd-timeline__number{
  --fd-path-node-fill:var(--fd-teal-wash);box-shadow:0 0 0 3px var(--fd-surface),0 0 0 5px var(--fd-teal);
}
.fd-pathroute .fd-timeline__title{display:block;max-width:15ch;margin-top:var(--fd-space-2);font-size:var(--fd-font-sm);font-weight:700;line-height:1.25;color:var(--fd-text)}
.fd-pathroute .fd-timeline__row.is-sel .fd-timeline__title{color:var(--fd-terracotta-dark)}
.fd-pathroute .fd-timeline__theme{display:block;max-width:19ch;margin-top:4px;font-size:var(--fd-font-xs);line-height:1.35;color:var(--fd-text-mid)}
.fd-pathroute .fd-timeline__status{
  display:inline-flex;margin-top:6px;padding:var(--fd-space-1) var(--fd-space-4);border:1px solid var(--fd-line-strong);
  border-radius:var(--fd-radius-pill);background:var(--fd-surface);color:var(--fd-text-mid);
  font-size:var(--fd-font-2xs);font-weight:750;
}
.fd-pathroute .fd-timeline__row[aria-current="step"] .fd-timeline__status{
  position:absolute;top:calc(var(--fd-path-y) - var(--fd-path-node) / 2 - 34px);left:50%;transform:translateX(-50%);
  margin:0;white-space:nowrap;border-color:var(--fd-terracotta);background:var(--fd-terracotta);color:var(--fd-on-accent);
}
.fd-pathroute .fd-timeline__count{margin-top:6px;padding:0;font-size:var(--fd-font-xs);font-weight:650;color:var(--fd-text-dim)}
```

- [ ] **Step 4: Adjust the phone rules.** Inside `@media (max-width:640px)`:
  - Delete `.fd-pathroute .fd-timeline__row:nth-child(n){transform:none}`.
  - Replace the gutter rule with `.fd-pathroute .fd-timeline__gutter{top:46px;left:46px}`.
  - Add `grid-template-rows:none;` to the existing `.fd-pathroute .fd-timeline__body{…}` phone rule.
  - Add after the phone status rule: `.fd-pathroute .fd-timeline__row[aria-current="step"] .fd-timeline__status{position:static;transform:none;margin-top:4px}`.

  The phone number rule already sets `margin:0` and `grid-area:number`, and the ring background inherits.

- [ ] **Step 5: Run the gates.** Run `node --test tests/*.test.mjs` and `python3 bin/check_design_drift.py`. Expected: all PASS. Read `docs/front-door-css-landmines` first if a CSS pin fails on an unrelated rule.

- [ ] **Step 6: Build and look at it.** Run `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` in the background (log to a scratch file), then open the built Path in the preview browser at 1280, 1024, 700 and 390 px, in light and dark. Confirm by eye that every ring sits on the road, the "Current" flag is not clipped at the top of the card, the done badge sits at the node's lower right on desktop and on the phone, and the selected tab bar is visible. Tune only `top`/`left` pixel offsets if the badge is off.

- [ ] **Step 7: Update CLASS-INVENTORY §4.** In the tree, add a comment on `.fd-timeline__number`: `(ring via --fd-ring-pct inline)`. In the table:
  - `.fd-pathroute__connector`: "One decorative, neutral stroke, generated by `fdPathConnectorD(n)` so it passes through every stop centre; `vector-effect:non-scaling-stroke`. It never gains selected, current, complete, or progress state."
  - `.fd-timeline__theme`: "Canonical curriculum theme; shown on every stop."
  - `.fd-dot.is-done`: "Filled success; on the desktop route it is the check badge at the node's lower right, and other dots are hidden there."
  - `.fd-dot.is-current`: "Phone rail only; the desktop route states current with the flag."
  - `.fd-timeline__status`: add "On `[aria-current=step]` it is the terracotta flag above the node (desktop)."

  Add a ⚠: "`--fd-path-band`, `--fd-path-y-low` and `--fd-path-y-high` duplicate `FD_PATH_BAND` / `FD_PATH_Y_LOW` / `FD_PATH_Y_HIGH` in fd_path.js — change both (pinned). Row centres must stay at `(i+0.5)/n`: keep `.fd-pathroute__weeks` at `gap:0` and space rows with margin, never gap."

- [ ] **Step 8: Commit.**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css tests/fd-path-route.test.mjs docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md
git commit -m "front door: Path stops sit on one road with rings and a shared baseline"
```

---

### Task 4: Browser proof that stops sit on the road

**Files:**
- Test: `tests/smoke/front-door.spec.js` (add after "Path route keeps selection, current week…")

- [ ] **Step 1: Add the test.**

```js
test('Path stops sit on the road, share one label baseline, and never overflow', async ({ page }, testInfo) => {
  const site = audience(testInfo);
  await seedApp(page, testInfo);
  for (const width of [1280, 1024, 700]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('[data-fd-tab="path"]:visible').click();
    // The Path fades up; measure only once every animation in it has finished (mid-fade
    // boxes read fractional sizes).
    await page.locator('.fd-path').evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const geo = await page.evaluate(() => {
      const p = document.querySelector('.fd-pathroute__connector');
      const m = p.getScreenCTM();
      const len = p.getTotalLength();
      const pts = [];
      for (let i = 0; i <= 600; i++) {
        const q = p.getPointAtLength((len * i) / 600);
        pts.push([m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]);
      }
      const centres = [...document.querySelectorAll('.fd-pathroute .fd-timeline__number')].map((n) => {
        const r = n.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
      const miss = centres.map(([x, y]) => Math.min(...pts.map(([px, py]) => Math.hypot(px - x, py - y))));
      const tops = [...document.querySelectorAll('.fd-pathroute .fd-timeline__n')].map((n) => n.getBoundingClientRect().top);
      const path = document.querySelector('.fd-path');
      return { miss, tops, count: centres.length, fits: path.scrollWidth <= path.clientWidth };
    });
    expect(geo.count).toBe(site.weekCount);
    for (const d of geo.miss) expect(d, `stop centre off the road at ${width}px`).toBeLessThanOrEqual(4);
    expect(Math.max(...geo.tops) - Math.min(...geo.tops), `labels off one baseline at ${width}px`).toBeLessThanOrEqual(1);
    expect(geo.fits, `Path overflows at ${width}px`).toBe(true);
  }
  await expectHealthy(page);
});
```

- [ ] **Step 2: Run the smoke test against the build.** Run `cd tests/smoke && npx playwright test front-door.spec.js -g "sit on the road"`, with the site served the way the suite's config expects (see `tests/smoke/playwright.config.*`). Expected: PASS for both audience projects.

- [ ] **Step 3: Prove the check can fail.** Temporarily set `--fd-path-y-high:60px` in the CSS, rerun and confirm the "off the road" assertion FAILS, then revert. This is the SILENT_SHRINK_CHECKLIST §F step: break the check to prove it checks.

- [ ] **Step 4: Commit.**

```bash
git add tests/smoke/front-door.spec.js
git commit -m "smoke: Path stops sit on the road at 1280/1024/700"
```

---

### Task 5: Full gate and PR

- [ ] **Step 1:** Run `bash bin/verify.sh > "$TMPDIR/verify.log" 2>&1` in the background and poll it. Expected: ALL CHECKS PASSED. If a gate fails, prove it on clean `main` before blaming this change.
- [ ] **Step 2:** Run `python3 bin/signoff_impact.py`. Expected: no attested content pages are affected (Front Door shell code only).
- [ ] **Step 3:** Push and open a draft PR linking the spec and this plan, with before/after screenshots from Task 3 Step 6. Mark it ready once CI is green.

## Self-review notes

- Spec coverage:
  - geometry → T1
  - ring, count and flag → T2 + T3
  - labels on one baseline → T3 + T4
  - phone → T3 Step 4
  - contracts → T1–T4
  - CLASS-INVENTORY → T3 Step 7
- Deviation from the spec: a complete stop's count reads "n of n done" rather than "Complete", because the status pill already says "Complete".
- The spec's visual-baseline refresh is dropped: no Path screenshot baselines exist (`grep toHaveScreenshot` finds none for Path).
