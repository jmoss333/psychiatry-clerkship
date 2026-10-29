// Behavioural contract for the DRAFT pre/post knowledge-check scaffold (frontdoor/fd_prepost.js,
// L8 outcomes design). The snippet is evaluated with the few shell globals it uses stubbed.
// Pins: code format and counterbalancing; scoring; the export carries only the documented
// fields (no name, no free text, dates not timestamps); withdraw deletes the local record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_prepost.js', import.meta.url), 'utf8');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), keys: () => [...m.keys()] };
}

const FORMS = {
  A: [{ id: 'qb_mood_002', cat: 'mood', stem: 's', options: [{ key: 'A', t: 'a', c: true }, { key: 'B', t: 'b', c: false }] },
    { id: 'qb_psy_002', cat: 'psychosis', stem: 's', options: [{ key: 'A', t: 'a', c: false }, { key: 'B', t: 'b', c: true }] }],
  B: [{ id: 'qb_mood_003', cat: 'mood', stem: 's', options: [{ key: 'A', t: 'a', c: true }, { key: 'B', t: 'b', c: false }] },
    { id: 'qb_psy_003', cat: 'psychosis', stem: 's', options: [{ key: 'A', t: 'a', c: true }, { key: 'B', t: 'b', c: false }] }],
};

function load() {
  const ls = memStorage();
  const el = { innerHTML: '', className: '', textContent: '', querySelectorAll: () => [] };
  const doc = { getElementById: () => el, createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  // eslint-disable-next-line no-new-func
  const make = new Function('localStorage', 'document', 'window', 'contentEl', 'esc', 'fetch', 'Blob', 'URL', `
    ${snippet}
    return { ppLoad, ppSave, ppNewCode, ppOrder, ppFormFor, ppSubmit, ppExport, fdPrepostSectionHtml,
      fdPrepostHandleClick, PP_CODE_RE, setForms: (f, phase, ans) => { PP_FORMS = f; ppPhase = phase; ppAnswers = ans; } };`);
  let exported = null;
  class FakeBlob { constructor(parts) { exported = JSON.parse(parts.join('')); } }
  const api = make(ls, doc, { crypto: { getRandomValues: (u) => { for (let i = 0; i < u.length; i++) u[i] = (i * 37 + 11) % 256; return u; } } },
    el, (s) => String(s), () => Promise.resolve({ ok: false }), FakeBlob, { createObjectURL: () => 'blob:x' });
  return { ...api, ls, exported: () => exported };
}

test('codes match the documented format and avoid look-alike characters', () => {
  const { ppNewCode, PP_CODE_RE } = load();
  const code = ppNewCode();
  assert.match(code, PP_CODE_RE);
  assert.doesNotMatch(code.slice(3), /[ILO01]/);
  for (const bad of ['PP-ILO000', 'pp-ABCDEF', 'PP-ABCDE', 'PP-ABCDEFG', 'S-ABCDEF']) assert.doesNotMatch(bad, PP_CODE_RE);
});

test('counterbalancing: the pre and post forms always differ, and both orders occur', () => {
  const { ppFormFor } = load();
  const seen = new Set();
  for (const code of ['PP-AAAAAA', 'PP-AAAAAB', 'PP-AAAAA2', 'PP-AAAAA3']) {
    const d = { code };
    assert.notEqual(ppFormFor(d, 'pre'), ppFormFor(d, 'post'));
    seen.add(ppFormFor(d, 'pre'));
  }
  assert.deepEqual([...seen].sort(), ['A', 'B']);
});

test('nothing renders as started before the learner consents', () => {
  const { fdPrepostSectionHtml, ls } = load();
  const html = fdPrepostSectionHtml();
  assert.match(html, /data-prepost="about"/);
  assert.doesNotMatch(html, /data-prepost="start-pre"/);
  assert.deepEqual(ls.keys(), []);
});

test('scoring, then an export with only the documented fields', () => {
  const t = load();
  t.ppSave({ v: 1, code: 'PP-AAAAAB', consentedOn: '2026-10-16', pre: null, post: null }); // even last char: A then B
  t.setForms(FORMS, 'pre', { 0: 'A', 1: 'A' }); // 1 of 2
  t.ppSubmit();
  t.setForms(FORMS, 'post', { 0: 'A' }); // 1 of 2, second unanswered
  t.ppSubmit();
  const d = t.ppLoad();
  assert.equal(d.pre.form, 'A'); assert.equal(d.pre.score, 1);
  assert.equal(d.post.form, 'B'); assert.equal(d.post.score, 1);
  assert.deepEqual(d.post.items.map((x) => x.a), [1, null]);
  assert.match(d.pre.on, /^\d{4}-\d{2}-\d{2}$/, 'a date, not a timestamp');
  t.ppExport();
  const file = t.exported();
  assert.deepEqual(Object.keys(file).sort(), ['code', 'order', 'post', 'pre', 'restored', 'schema', 'status']);
  assert.deepEqual(Object.keys(file.pre).sort(), ['form', 'items', 'n', 'on', 'score']);
  assert.deepEqual(Object.keys(file.pre.items[0]).sort(), ['a', 'cat', 'id']);
  assert.equal(file.status, 'draft');
});

test('withdraw deletes the local record', () => {
  const t = load();
  t.ppSave({ v: 1, code: 'PP-AAAAAA', pre: null, post: null });
  const target = { closest: (sel) => (sel === '[data-prepost]' ? { getAttribute: () => 'withdraw' } : null) };
  assert.equal(t.fdPrepostHandleClick(target, { preventDefault() {} }), true);
  assert.equal(t.ppLoad(), null);
});

test('clicks it does not own fall through to the shell', () => {
  const t = load();
  assert.equal(t.fdPrepostHandleClick({ closest: () => null }, { preventDefault() {} }), false);
});
