// Four shipped pages carry NO pre-paint boot: apply_dark_mode() skips THEME_INIT wherever
// 'cw_theme' already appears, and decision-aids.html, review.html, interview-circle.html and
// feedback.html all trip that with theme code of their own. test_common.py's boot census is
// scoped to <head> for exactly that reason and says so in its own docstring, so it structurally
// cannot speak about these four. This file is where their theme behaviour is pinned instead.
//
// The defect it exists for: theme is now two values, not one. The MODE a learner picks lives in
// cw_theme and may be 'system'; the ATTRIBUTE the page paints is only ever light or dark. A page
// that writes its resolved attribute back into cw_theme converts "follow my phone" into a pinned
// mode — silently, with no gesture anywhere. decision-aids.html did that on MOUNT, from a
// useEffect with a [theme] dep array, which runs on the first render and not only on the page's
// own ☾ toggle. The line was inert while cw_theme only ever held light/dark; adding 'system' —
// and making unset mean system — is what made it destructive, and it ships to both sites.
//
// Grepping the effect body would pass over any respelling of the same write, so this mounts the
// page's REAL app module with a fake React and a recording localStorage, and asserts over what
// actually happened: what got painted, and what got stored. The click half is asserted too —
// a "fix" that deleted the write outright would break persistence and must not be green.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PAGE = new URL('../04_Acute_and_Safety/Decision_Aids/decision-aids.html', import.meta.url);
const html = readFileSync(PAGE, 'utf8');

const TOGGLE_LABEL = 'Toggle light/dark theme';

// The page's app module: the last inline <script>, the one that builds the React tree. Bounded by
// an assertion rather than by a slice, because a harness aimed at the wrong script would run
// nothing and report success over it.
const APP_SOURCE = (() => {
  const anchor = html.indexOf('var e=React.createElement');
  assert.ok(anchor > 0, 'decision-aids.html no longer opens its app with React.createElement; '
    + 'this harness is pointed at nothing and every assertion below is vacuous');
  const open = html.lastIndexOf('<script>', anchor);
  const close = html.indexOf('</script>', anchor);
  assert.ok(open !== -1 && close > anchor, 'could not bound the app script');
  const body = html.slice(open + '<script>'.length, close);
  assert.match(body, /ReactDOM\.createRoot/, 'the extracted script must be the one that mounts');
  return body;
})();

function children(node) {
  return node && typeof node === 'object' && !Array.isArray(node) ? node.children : null;
}

function findByLabel(node, label) {
  if (Array.isArray(node)) {
    for (const n of node) { const hit = findByLabel(n, label); if (hit) return hit; }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (node.props && node.props['aria-label'] === label) return node;
  return findByLabel(children(node), label);
}

// A React small enough to read and faithful on the two things under test: useState keeps its slot
// across renders (so the initial value is used once, as React does), and useEffect runs AFTER the
// render that queued it and only when its deps changed — which is the whole mechanism that made a
// mount-time write possible.
function mount({ stored = null, prefersDark = false } = {}) {
  const writes = [];
  const painted = [];
  let store = stored;

  const localStorage = {
    getItem: (k) => (k === 'cw_theme' ? store : null),
    setItem: (k, v) => { writes.push([k, String(v)]); if (k === 'cw_theme') store = String(v); },
  };
  const documentElement = {
    setAttribute: (k, v) => { if (k === 'data-theme') painted.push(v); },
    getAttribute: (k) => (k === 'data-theme' && painted.length ? painted[painted.length - 1] : null),
  };
  const document = { getElementById: () => ({}), documentElement };
  const matchMedia = (q) => ({ matches: /dark/.test(q) && prefersDark });
  const window = { matchMedia };

  const states = [];
  const deps = [];
  let stateIdx = 0;
  let effectIdx = 0;
  let queued = [];
  let top = null;
  let tree = null;

  function pass() {
    stateIdx = 0;
    effectIdx = 0;
    queued = [];
    tree = top();
    const due = queued;
    queued = [];
    for (const fn of due) fn();
  }

  const React = {
    createElement: (type, props, ...kids) => ({ type, props: props || {}, children: kids }),
    useState(initial) {
      const i = stateIdx++;
      if (!(i in states)) states[i] = initial;
      return [states[i], (next) => {
        states[i] = typeof next === 'function' ? next(states[i]) : next;
        pass();
      }];
    },
    useEffect(fn, dep) {
      const i = effectIdx++;
      const prev = deps[i];
      const changed = prev === undefined || dep === undefined
        || dep.length !== prev.length || dep.some((v, k) => v !== prev[k]);
      deps[i] = dep;
      if (changed) queued.push(fn);
    },
  };
  const ReactDOM = {
    createRoot: () => ({ render: (el) => { top = () => el.type(el.props); pass(); } }),
  };

  // eslint-disable-next-line no-new-func
  new Function('React', 'ReactDOM', 'localStorage', 'document', 'window', 'matchMedia', APP_SOURCE)(
    React, ReactDOM, localStorage, document, window, matchMedia,
  );

  assert.ok(tree, 'the app never mounted; nothing below is measuring the page');
  return { writes, painted, tree: () => tree, stored: () => store };
}

test('mounting the page paints the resolved attribute', () => {
  assert.deepEqual(mount({ stored: null, prefersDark: true }).painted, ['dark']);
  assert.deepEqual(mount({ stored: null, prefersDark: false }).painted, ['light']);
  assert.deepEqual(mount({ stored: 'dark', prefersDark: false }).painted, ['dark']);
});

// The defect, in the learner's own terms. Unset means system since this branch, so this is the
// default state of every device that never touched a theme control.
test('opening the page writes nothing: a mount is not a gesture', () => {
  const app = mount({ stored: null, prefersDark: true });
  assert.deepEqual(app.writes, [],
    'opening a page is not a choice; it must not persist a theme the learner never picked');
  assert.equal(app.stored(), null, 'and unset must still be unset afterwards');
});

test('a learner on System still has System after opening the page', () => {
  const app = mount({ stored: 'system', prefersDark: true });
  assert.equal(app.stored(), 'system',
    "the page painted dark for the OS and must not have pinned the learner's mode to it");
  assert.deepEqual(app.painted, ['dark'], 'while still painting what the OS asked for');
});

// The other half: the gesture must still persist, or the "fix" is a removal.
test("the page's own toggle is what persists the mode", () => {
  const app = mount({ stored: 'system', prefersDark: true });
  const toggle = findByLabel(app.tree(), TOGGLE_LABEL);
  assert.ok(toggle && typeof toggle.props.onClick === 'function',
    `no control labelled "${TOGGLE_LABEL}" in the rendered tree; the click half is untested`);
  toggle.props.onClick();
  assert.deepEqual(app.writes, [['cw_theme', 'light']],
    'the toggle is a real gesture and must persist exactly one explicit mode');
  assert.equal(app.painted[app.painted.length - 1], 'light',
    'and the page must repaint to match what it just stored');
});
