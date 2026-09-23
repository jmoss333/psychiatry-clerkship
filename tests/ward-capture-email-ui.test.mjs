import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');
const email = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_capture_email.js', import.meta.url), 'utf8');
const start = shell.indexOf('/* ---- faculty email dialog ---- */');
const end = shell.indexOf('/* ---- end faculty email dialog ---- */', start);
assert.ok(start >= 0 && end > start, 'the real embedded faculty email dialog must exist');
const ui = shell.slice(start, end);
const bridge = `var fdCaptureEmail={
  address:fdEmailAddress,
  selection:fdEmailSelection,
  digest:function(selected){return fdEmailDigest({byRef:{}},selected,'https://example.test');},
  mailto:fdEmailMailto
};`;

function makeHarness({ long = false, clipboard = null } = {}) {
  const clicks = [], elements = [];
  const document = {
    removeEventListener() {},
    createElement(tag) {
      assert.equal(tag, 'a');
      const anchor = { href: '', click() { clicks.push(this.href); }, remove() { elements.push('removed'); } };
      elements.push(anchor);
      return anchor;
    },
  };
  const digest = { subject: 'Psychiatry learning questions (1)', body: 'A learner-prepared teaching digest.\nQuestion?' };
  const state = { selected: [{ id: 'one', text: 'Question?', route: null, ctx: null }], digest,
    localPart: 'faculty.name', affirmed: true };
  const make = new Function('document', 'navigator', 'long', `var capSheet=null;\n${email}\n${bridge}\n${ui}\nreturn {
    state:capEmailState, ready:capEmailReady, handoff:capEmailHandoff,
    copy:capEmailCopy, text:capEmailText, close:capEmailClose,
    getState:function(){return capEmailState;},
    reopen:function(body){
      capEmailSheet={};
      capEmailState={selected:[{id:'two',text:'New question',route:null,ctx:null}],
        digest:{subject:'Psychiatry learning questions (1)',body:body},
        localPart:'new.faculty',affirmed:true,showFallback:false};
    }
  };`);
  const harness = make(document, { clipboard }, long);
  Object.assign(harness.state, state);
  return { ...harness, clicks, elements };
}

test('Open email draft requires a selected item, valid one-address local part, and affirmation', () => {
  const h = makeHarness();
  assert.equal(h.ready(), true);
  h.state.affirmed = false;
  assert.equal(h.ready(), false);
  h.state.affirmed = true;
  h.state.localPart = 'faculty@other.org';
  assert.equal(h.ready(), false);
  h.state.localPart = 'faculty.name';
  h.state.selected = [];
  assert.equal(h.ready(), false);
});

test('explicit handoff clicks exactly one detached mailto anchor and leaves the preview data', () => {
  const h = makeHarness();
  assert.equal(h.handoff(), 'opened');
  assert.equal(h.clicks.length, 1);
  assert.match(h.clicks[0], /^mailto:faculty.name%40mainehealth.org\?subject=/);
  assert.deepEqual(h.elements.slice(1), ['removed']);
  assert.equal(h.state.selected.length, 1);
  assert.match(h.text(), /Question\?/);
});

test('a too-long draft never clicks an anchor and preserves the complete copy fallback', () => {
  const h = makeHarness();
  h.state.digest.body = 'Q'.repeat(3000);
  assert.equal(h.handoff(), 'too-long');
  assert.equal(h.clicks.length, 0);
  assert.equal(h.elements.length, 0);
  assert.match(h.text(), /Q{3000}/);
});

test('malformed Unicode leaves the full copy fallback instead of an inert email action', () => {
  const h = makeHarness();
  h.state.digest.body = 'Question with \uD800 marker';
  assert.equal(h.handoff(), 'invalid-digest');
  assert.equal(h.clicks.length, 0);
  assert.equal(h.state.showFallback, true);
  assert.match(h.text(), /Question with/);
});

test('clipboard absence or rejection reveals selectable fallback text', async () => {
  const absent = makeHarness();
  assert.equal(await absent.copy(), false);
  assert.equal(absent.state.showFallback, true);
  assert.match(absent.text(), /Psychiatry learning questions \(1\)/);

  const reject = makeHarness({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
  assert.equal(await reject.copy(), false);
  assert.equal(reject.state.showFallback, true);
});

test('closing the review dialog forgets recipient, affirmation, digest, and selection', () => {
  const h = makeHarness();
  h.close();
  assert.deepEqual(h.getState(), { selected: [], digest: null, localPart: '', affirmed: false, showFallback: false });
  assert.equal(h.ready(), false);
});

for (const outcome of ['resolve', 'reject']) {
  test(`a delayed clipboard ${outcome} from a closed dialog cannot affect a reopened draft`, async () => {
    let finish;
    const clipboard = { writeText: () => new Promise((resolve, reject) => { finish = outcome === 'resolve' ? resolve : reject; }) };
    const h = makeHarness({ clipboard });
    const oldCopy = h.copy();
    h.close();
    h.reopen('New question only');
    finish(outcome === 'resolve' ? undefined : new Error('clipboard denied'));
    assert.equal(await oldCopy, null, 'a stale completion must not claim success or failure on the new dialog');
    assert.equal(h.getState().showFallback, false);
    assert.equal(h.getState().digest.body, 'New question only');
  });
}

test('recipient input keeps the immutable domain in its screen reader description through validation', () => {
  const input = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name]; },
    focus() {},
  };
  const fallbackText = { value: '' };
  const nodes = {
    '#capEmailLocal': input,
    '#capEmailHint': { textContent: '' },
    '#capEmailOpenDraft': { disabled: true },
    '#capEmailFallback': { hidden: true, querySelector: () => fallbackText },
    '#capEmailCount': { textContent: '' },
    '#capEmailDigest': { textContent: '' },
  };
  const sheet = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener() {},
    querySelector(selector) { return nodes[selector]; },
    set innerHTML(value) {
      this.html = value;
      const field = value.match(/<input id="capEmailLocal"[^>]*aria-describedby="([^"]+)"/);
      assert.ok(field, 'the rendered field needs a description relationship');
      input.attrs['aria-describedby'] = field[1];
    },
  };
  const box = { checked: true, getAttribute: () => 'one' };
  const capture = {
    querySelectorAll: () => [box],
    setAttribute() {},
  };
  const document = {
    body: { appendChild() {} },
    createElement: (() => { let count = 0; return () => {
      count += 1;
      return count === 1 ? { addEventListener() {} } : sheet;
    }; })(),
    addEventListener() {},
  };
  const item = { id: 'one', text: 'Question?', route: null, state: 'open', ctx: null };
  const make = new Function('document', 'capSheet', 'capRead', 'location', 'facultyPreviewRequest',
    'FD_INDEX', `${email}\n${bridge}\n${ui}\nreturn {open:capEmailOpen,preview:capEmailPreview,getState:function(){return capEmailState;}};`);
  const h = make(document, capture, () => ({ items: [item] }), { origin: 'https://example.test' },
    null, { byRef: {} });
  h.open(null);
  assert.match(sheet.html, /<span id="capEmailSuffix">@mainehealth\.org<\/span>/);
  assert.equal(input.getAttribute('aria-describedby'), 'capEmailSuffix capEmailHint');
  h.getState().localPart = 'invalid@other.org';
  h.preview();
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.getAttribute('aria-describedby'), 'capEmailSuffix capEmailHint');
});
