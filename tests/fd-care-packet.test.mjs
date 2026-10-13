// PR B of the Care aftercare packet: state, add buttons, bulk add, tray and review gate.
// Every test names the production change that would make it fail. The module is loaded the way the
// shell loads it (concatenated source), with `sessionStorage` bound as a parameter so the PRODUCTION
// default (no storage argument) is the path under test.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const base = '../13_Faculty_Resources/_automation/site_build/frontdoor/';
const read = name => {
  const url = new URL(base + name, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const PACKET = read('fd_care_packet.js');
const EXPORTS = `;return typeof fdCarePacketNormalize === 'function' ? {
  enabled: fdCarePacketEnabled, LIMIT: FD_CARE_PACKET_LIMIT, SUGGEST: FD_CARE_PACKET_SUGGEST, KEY: FD_CARE_PACKET_KEY,
  blank: fdCarePacketBlank, normalize: fdCarePacketNormalize, load: fdCarePacketLoad, save: fdCarePacketSave,
  ids: fdCarePacketIds, toggle: fdCarePacketToggle, addMany: fdCarePacketAddMany, move: fdCarePacketMove,
  remove: fdCarePacketRemove, canPrint: fdCarePacketCanPrint, context: fdCarePacketContext,
  button: fdCarePacketButton, bulk: fdCarePacketBulk, tray: fdCarePacketTray, create: fdCreateCarePacket,
  validate: fdCareDirectoryValidate, search: fdCareDirectorySearch, results: fdCareDirectoryResults,
  shell: fdCareSearch, createDirectory: fdCreateCareDirectory,
  displayOrder: typeof fdCarePacketDisplayOrder === 'function' ? fdCarePacketDisplayOrder : null,
  held: typeof fdCarePacketHeld === 'function' ? fdCarePacketHeld : null
} : null;`;
const load = (source = PACKET, storage = undefined) =>
  new Function('sessionStorage', read('fd_data.js') + source + read('fd_care_search.js') + EXPORTS)(storage);
const P = load();

const store = () => {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
};
const categoryIds = ['aftercare', 'crisis', 'peer_support', 'basic_needs', 'community_services', 'housing_shelters', 'recovery_meetings', 'telehealth_providers'];
const row = (n, more = {}) => ({ id: 'a' + n, category: 'aftercare', name: 'Support ' + n, description: 'Counseling', details: 'Adults',
  area: 'York', regions: ['Southern Maine'], phone: '207-700-0123', contactHref: 'tel:2077000123', website: 'https://example.org/',
  verifiedDate: '2026-10-01', reviewAfter: '2027-03-30', verificationRequired: false, ...more });
const feed = records => ({ schemaVersion: 1, generatedAt: '2026-10-12T00:00:00Z', sourceHash: 'a'.repeat(64),
  categories: categoryIds.map(id => ({ id, label: id === 'peer_support' ? 'Peer support' : id, available: true, count: records.filter(r => r.category === id).length })),
  regionOptions: ['Statewide', 'Southern Maine', 'NH'], records });
const dataOf = (count, more = () => ({})) => P.validate(feed(Array.from({ length: count }, (_, i) => row(i, more(i)))));
const idsOf = n => Array.from({ length: n }, (_, i) => 'a' + i);
const gateOn = { verification: true, region: true, identifiers: true, supervisor: true };

test('the module exists and the gate is OFF in the shipped source (production default)', () => {
  assert.ok(P, 'fd_care_packet.js exists and exports the packet API');
  assert.equal(P.enabled(), false);
  assert.equal(PACKET.split('var FD_CARE_PACKET_ENABLED=false;').length, 2, 'exactly one literal flag, so the test fixture can flip it');
  assert.equal(P.LIMIT, 12);
  assert.equal(P.SUGGEST, 8);
  assert.equal(P.KEY, 'fd_care_packet_v1');
});

test('normalize keeps only a well-formed packet and never trusts storage', () => {
  assert.deepEqual(P.normalize(null), P.blank());
  assert.deepEqual(P.normalize('x'), P.blank());
  const dirty = P.normalize({ ids: ['a1', 'a1', 7, '', null, 'a2', 'x'.repeat(200)], why: { a1: 'free text' }, inserts: { callback: true, bad: 'yes' }, mode: 'sideways' });
  assert.deepEqual(dirty.ids, ['a1', 'a2']);
  assert.deepEqual(dirty.why, {}, 'the why-line is held until MaineHealth approval (HANDOFF Q3)');
  assert.deepEqual(dirty.inserts, { callback: true });
  assert.equal(dirty.mode, 'review');
  assert.equal(P.normalize({ ids: idsOf(40) }).ids.length, 12, 'a hand-edited key cannot exceed the cap');
  assert.equal(P.normalize({ mode: 'final' }).mode, 'final');
});

test('load survives corrupt JSON and a storage that throws', () => {
  const s = store();
  s.m.set(P.KEY, '{not json');
  assert.deepEqual(P.load(s), P.blank());
  assert.deepEqual(P.load({ getItem() { throw new Error('blocked'); } }), P.blank());
  assert.deepEqual(P.load(undefined), P.blank());
});

test('save writes exactly one session key, removes it when the packet empties, and survives a full or blocked store', () => {
  const s = store();
  P.save(s, { ...P.blank(), ids: ['a1'] });
  assert.deepEqual([...s.m.keys()], ['fd_care_packet_v1']);
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)).ids, ['a1']);
  P.save(s, P.blank());
  assert.equal(s.m.size, 0, 'an empty packet leaves no residue in the tab');
  assert.doesNotThrow(() => P.save({ setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } }, { ...P.blank(), ids: ['a1'] }));
});

test('toggle adds, removes, refuses unknown ids and refuses to exceed the cap', () => {
  const data = dataOf(14);
  let st = P.blank();
  const r = P.toggle(st, 'a3', data);
  assert.equal(r.result, 'added');
  assert.deepEqual(r.state.ids, ['a3']);
  assert.equal(P.toggle(r.state, 'a3', data).result, 'removed');
  assert.equal(P.toggle(st, 'not-in-directory', data).result, 'unknown');
  st = P.addMany(st, idsOf(12), data).state;
  assert.equal(P.toggle(st, 'a13', data).result, 'full');
  assert.equal(P.toggle(st, 'a0', data).result, 'removed', 'a full packet still lets you take one out');
  assert.equal(st.ids.length, 12, 'toggle never mutates its input');
});

test('addMany adds min(N-k, 12-current), reports what it skipped, and never duplicates', () => {
  const data = dataOf(20);
  const st = P.addMany(P.blank(), ['a0', 'a1', 'a2'], data).state;
  const r = P.addMany(st, idsOf(20), data);
  assert.equal(r.added, 9);
  assert.equal(r.already, 3);
  assert.equal(r.skipped, 8);
  assert.equal(r.state.ids.length, 12);
  assert.equal(new Set(r.state.ids).size, 12);
  assert.deepEqual(r.state.ids.slice(0, 3), ['a0', 'a1', 'a2'], 'existing order is kept, new ones append in result order');
  const room = P.addMany(P.blank(), ['a0', 'zzz', 'a1'], data);
  assert.equal(room.added, 2);
  assert.equal(room.skipped, 0, 'an id the directory does not list is ignored, not counted as a full-packet skip');
});

test('ids() is filtered through the CURRENT directory so a stale id never renders', () => {
  const data = dataOf(5);
  const st = { ...P.blank(), ids: ['a4', 'gone', 'a1'] };
  assert.deepEqual(P.ids(st, data), ['a4', 'a1']);
  assert.deepEqual(P.ids(st, null), []);
});

test('move reorders only within a category and stops at the edges; remove drops one', () => {
  const data = P.validate(feed([row(1), row(2, { category: 'peer_support' }), row(3), row(4, { category: 'peer_support' })]));
  const st = { ...P.blank(), ids: ['a1', 'a2', 'a3', 'a4'] };
  assert.deepEqual(P.move(st, 'a3', -1, data).ids, ['a3', 'a2', 'a1', 'a4'], 'a3 swaps with the aftercare item above it, skipping peer support');
  assert.deepEqual(P.move(st, 'a1', -1, data).ids, st.ids, 'already first in its category');
  assert.deepEqual(P.move(st, 'a4', 1, data).ids, st.ids, 'already last in its category');
  assert.deepEqual(P.remove(st, 'a2').ids, ['a1', 'a3', 'a4']);
});

test('printing is allowed only when all four review checks are ticked AND the packet has a live listing', () => {
  const data = dataOf(3);
  const st = { ...P.blank(), ids: ['a1'] };
  assert.equal(P.canPrint(st, data, gateOn), true);
  for (const k of Object.keys(gateOn)) assert.equal(P.canPrint(st, data, { ...gateOn, [k]: false }), false, k);
  assert.equal(P.canPrint(P.blank(), data, gateOn), false, 'empty packet');
  assert.equal(P.canPrint({ ...P.blank(), ids: ['gone'] }, data, gateOn), false, 'only stale ids');
  assert.equal(P.canPrint(st, data, undefined), false);
  assert.equal(P.canPrint(st, data, { ...gateOn, supervisor: 'yes' }), false, 'strict true, not truthy');
});

test('the add button toggles by id, announces state with aria-pressed, and is disabled only when full and not in', () => {
  const data = dataOf(14);
  const idle = P.context({ ...P.blank(), ids: ['a1'] }, data);
  const off = P.button(data.records[0], idle);
  assert.match(off, /data-fd-care-packet="a0"/);
  assert.match(off, /aria-pressed="false"/);
  assert.doesNotMatch(off, /disabled/);
  assert.match(P.button(data.records[1], idle), /aria-pressed="true"/);
  const full = P.context({ ...P.blank(), ids: idsOf(12) }, data);
  assert.match(P.button(data.records[13], full), /disabled/);
  assert.doesNotMatch(P.button(data.records[3], full), /disabled/, 'a packed listing can still be removed when the packet is full');
  assert.match(off, />Add to packet</, 'the visible label never changes, so the accessible name always contains it');
  const tricky = P.button({ id: 'x', name: '<img src=x onerror=alert(1)>' }, idle);
  assert.doesNotMatch(tricky, /<img/);
  assert.match(tricky, /&lt;img/);
});

test('bulk buttons count only listings not already packed, across all pages, and disable when nothing can be added', () => {
  const data = dataOf(20);
  const result = P.search(data, 'support', '', '', 1);
  const none = P.bulk(result, P.context(P.blank(), data));
  assert.match(none, /Add this page \(5\)/);
  assert.match(none, /Add all results \(20\)/);
  const some = P.bulk(result, P.context({ ...P.blank(), ids: ['a0', 'a1', 'a19'] }, data));
  assert.match(some, /Add this page \(3\)/);
  assert.match(some, /Add all results \(17\)/);
  const full = P.bulk(result, P.context({ ...P.blank(), ids: idsOf(12) }, data));
  assert.equal((full.match(/disabled/g) || []).length, 2, 'both bulk buttons are disabled when the packet is full');
  assert.equal(P.bulk(P.search(data, '', '', '', 1), P.context(P.blank(), data)), '', 'hidden while idle');
  assert.equal(P.bulk(P.search(data, 'nothing-matches-this', '', '', 1), P.context(P.blank(), data)), '', 'hidden with zero results');
});

test('results carry add buttons and is-packed ONLY when a packet context is passed (flag-off output is unchanged)', () => {
  const data = dataOf(7);
  const result = P.search(data, 'support', '', '', 1);
  const without = P.results(data, result, '2026-10-12');
  assert.doesNotMatch(without, /data-fd-care-packet|is-packed|fd-care-search__pack|fd-care-search__bulk/);
  assert.equal(P.results(data, result, '2026-10-12', undefined), without);
  const ctx = P.context({ ...P.blank(), ids: ['a1'] }, data);
  const withCtx = P.results(data, result, '2026-10-12', ctx);
  assert.equal((withCtx.match(/data-fd-care-packet="a\d"/g) || []).length, 5, 'one add button per row on the page');
  assert.equal((withCtx.match(/<article class="is-packed">/g) || []).length, 1);
  assert.match(withCtx, /fd-care-search__packed/);
  assert.ok(withCtx.indexOf('fd-care-search__bulk') < withCtx.indexOf('<ol'), 'bulk bar sits in the results bar, above the list');
});

test('search results expose every matching id so "Add all results" means all pages, not the current one', () => {
  const data = dataOf(20);
  const result = P.search(data, 'support', '', '', 2);
  assert.equal(result.rows.length, 5);
  assert.equal(result.allIds.length, 20);
  assert.equal(P.search(data, '', '', '', 1).allIds.length, 0);
});

test('the tray is empty-state safe, grouped by category, escaped, and nudges at 9 and stops at 12', () => {
  const data = P.validate(feed([row(1), row(2, { category: 'peer_support', name: '<script>alert(1)</script>' }), row(3)]));
  const empty = P.tray(P.blank(), data, {});
  assert.match(empty, /No listings yet/);
  assert.doesNotMatch(empty, /data-fd-care-packet-clear/);
  const html = P.tray({ ...P.blank(), ids: ['a1', 'a2', 'a3'] }, data, {});
  assert.match(html, /Aftercare packet[\s\S]*>3</);
  assert.ok(html.indexOf('>aftercare<') < html.indexOf('>Peer support<'), 'groups follow the directory category order');
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-fd-care-packet-up="a1"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-down="a3"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-remove="a2"/);
  assert.match(html, /data-fd-care-packet-clear/);
  assert.doesNotMatch(html, /full at 12|hard to read/);
  const big = dataOf(14);
  assert.match(P.tray({ ...P.blank(), ids: idsOf(9) }, big, {}), /Eight or fewer/);
  assert.match(P.tray({ ...P.blank(), ids: idsOf(12) }, big, {}), /full at 12/);
});

test('the review gate has four unticked-by-default checks and reports readiness without any print button yet', () => {
  const data = dataOf(3);
  const st = { ...P.blank(), ids: ['a1'] };
  const html = P.tray(st, data, {});
  for (const k of ['verification', 'region', 'identifiers', 'supervisor']) assert.match(html, new RegExp('data-fd-care-packet-gate="' + k + '"'));
  assert.equal((html.match(/type="checkbox"/g) || []).length, 4);
  assert.doesNotMatch(html, /checked/);
  assert.match(html, /data-fd-care-packet-ready="false"/);
  const ready = P.tray(st, data, gateOn);
  assert.equal((ready.match(/ checked/g) || []).length, 4);
  assert.match(ready, /data-fd-care-packet-ready="true"/);
  assert.doesNotMatch(html + ready, /data-fd-care-packet-print|data-fd-care-packet-copy/, 'Print and Copy arrive in PR C');
  assert.match(P.tray(P.blank(), data, gateOn), /data-fd-care-packet-ready="false"/, 'an empty packet is never ready');
});

test('the search panel gets a tray mount only when the packet flag is on', () => {
  const off = P.shell({ careResources: [] });
  assert.doesNotMatch(off, /data-fd-care-packet/);
  const on = load(PACKET.replace('var FD_CARE_PACKET_ENABLED=false;', 'var FD_CARE_PACKET_ENABLED=true;')).shell({ careResources: [] });
  assert.match(on, /data-fd-care-packet-tray/);
  assert.ok(on.indexOf('data-care-directory-results') < on.indexOf('data-fd-care-packet-tray'), 'the tray sits after the results, outside the results mount');
});

test('the controller persists to the real session key, shares state across instances, and keeps it when you leave Care', () => {
  const s = store();
  const data = dataOf(6);
  const c = P.create({ storage: s });
  c.mount(null, null, () => data);
  assert.equal(c.toggle('a2'), 'added');
  assert.deepEqual(JSON.parse(s.m.get('fd_care_packet_v1')).ids, ['a2']);
  c.leave();
  const again = P.create({ storage: s });
  again.mount(null, null, () => data);
  assert.deepEqual(again.ids(), ['a2'], 'tab-scoped by design: leaving Care does not clear the packet');
  assert.equal(c.mode, 'review');
  assert.deepEqual(again.addMany(idsOf(6)), { added: 5, already: 1, skipped: 0 });
  again.clear();
  assert.equal(s.m.size, 0);
});

test('PRODUCTION default: with no storage argument the controller uses the page sessionStorage', () => {
  const s = store();
  const c = load(PACKET, s).create();
  c.mount(null, null, () => dataOf(3));
  c.toggle('a1');
  assert.deepEqual([...s.m.keys()], ['fd_care_packet_v1']);
  assert.doesNotThrow(() => load(PACKET, undefined).create().mount(null, null, () => dataOf(3)), 'no sessionStorage at all must degrade, not throw');
});

test('the gate resets when you leave Care, and changing it never touches storage', () => {
  const s = store();
  const data = dataOf(3);
  const c = P.create({ storage: s });
  c.mount(null, null, () => data);
  c.toggle('a1');
  const before = s.m.get('fd_care_packet_v1');
  c.setGate('verification', true);
  c.setGate('region', true);
  assert.equal(s.m.get('fd_care_packet_v1'), before);
  assert.equal(c.gate().verification, true);
  assert.equal(c.setGate('nonsense', true), false, 'unknown gate keys are ignored');
  c.leave();
  assert.deepEqual(c.gate(), { verification: false, region: false, identifiers: false, supervisor: false });
});

test('the packet module makes no network or persistence call beyond sessionStorage and uses only ES5', () => {
  for (const banned of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /localStorage/, /document\.cookie/, /\bhistory\./, /location\.(?:href|hash|search)\s*=/, /geolocation/]) {
    assert.doesNotMatch(PACKET, banned, String(banned));
  }
  for (const es6 of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\bclass\s+\w/, /\.\.\./, /\bPromise\b/]) {
    assert.doesNotMatch(PACKET, es6, 'ES5 only: ' + es6);
  }
  assert.match(PACKET, /fdEsc\(/, 'every interpolation goes through fdEsc');
});

// ---- Review findings (independent review of this PR): each test failed before its fix ----

const fakeLive = () => ({ textContent: '' });
const fakeButton = attrs => ({ hasAttribute: k => Object.prototype.hasOwnProperty.call(attrs, k), getAttribute: k => attrs[k] });
const settle = () => new Promise(resolve => setTimeout(resolve, 260));

test('the review confirmations are bound to the packet: adding or clearing resets them, an empty packet cannot be confirmed', () => {
  const data = dataOf(8);
  const confirm = c => { for (const k of Object.keys(gateOn)) c.setGate(k, true); };
  const c = P.create({ storage: store() });
  c.mount(null, null, () => data);
  assert.equal(c.setGate('verification', true), false, 'nothing to confirm while the packet is empty');
  assert.equal(c.gate().verification, false);
  c.toggle('a1');
  confirm(c);
  assert.deepEqual(c.gate(), gateOn);
  c.toggle('a2');
  assert.deepEqual(c.gate(), { verification: false, region: false, identifiers: false, supervisor: false }, 'a new listing was never confirmed');
  confirm(c);
  c.addMany(['a3', 'a4']);
  assert.equal(c.gate().supervisor, false, 'bulk add resets too');
  confirm(c);
  c.clear();
  assert.equal(c.gate().verification, false, 'clear resets');
  c.addMany(['a5']);
  assert.equal(c.gate().verification, false, 'and the old confirmations do not come back');
  confirm(c);
  c.addMany(['a5']);
  assert.equal(c.gate().verification, true, 'adding nothing new leaves the confirmations alone');
  c.move('a5', -1);
  assert.equal(c.gate().verification, true, 'reordering adds no unconfirmed listing');
  c.remove('a5');
  assert.equal(c.gate().verification, true, 'removing adds no unconfirmed listing');
});

test('the confirmation boxes are disabled while the packet is empty and there is no live-region on the readiness line', () => {
  const data = dataOf(3);
  const empty = P.tray(P.blank(), data, {});
  assert.equal((empty.match(/type="checkbox"[^>]*disabled/g) || []).length, 4);
  const filled = P.tray({ ...P.blank(), ids: ['a1'] }, data, {});
  assert.doesNotMatch(filled, /type="checkbox"[^>]*disabled/);
  assert.doesNotMatch(filled + empty, /role="status"/, 'a status region re-inserted on every repaint is announced unreliably and competes with the shared announcer');
});

test('announcements wait for focus to settle, carry the packet count, and say when confirmations were cleared', async () => {
  const data = dataOf(6);
  const live = fakeLive();
  const c = P.create({ storage: store() });
  c.mount(null, live, () => data);
  c.toggle('a1');
  assert.equal(live.textContent, '', 'not written in the same task as the DOM change');
  await settle();
  assert.match(live.textContent, /Added Support 1 to the packet\. 1 listing in packet\./);
  for (const k of Object.keys(gateOn)) c.setGate(k, true);
  c.toggle('a2');
  await settle();
  assert.match(live.textContent, /2 listings in packet\. Review confirmations cleared\./);
  c.remove('a2');
  await settle();
  assert.match(live.textContent, /Removed Support 2 from the packet\. 1 listing in packet\./);
  c.addMany(['a3', 'a4']);
  await settle();
  assert.match(live.textContent, /Added 2 listings\. 3 listings in packet\./);
  c.toggle('a1');
  c.toggle('a1');
  await settle();
  assert.match(live.textContent, /Added Support 1/, 'only the last of two quick messages is spoken');
  c.leave();
});

test('a message queued before leaving Care never lands afterwards, and readiness changes are announced', async () => {
  const data = dataOf(3);
  const live = fakeLive();
  const c = P.create({ storage: store() });
  c.mount(null, live, () => data);
  c.toggle('a1');
  c.leave();
  await settle();
  assert.equal(live.textContent, '');
  const again = fakeLive();
  const d = P.create({ storage: store() });
  d.mount(null, again, () => data);
  d.toggle('a1');
  await settle();
  for (const k of Object.keys(gateOn)) d.setGate(k, true);
  await settle();
  assert.equal(again.textContent, 'Review complete.');
  d.setGate('region', false);
  await settle();
  assert.match(again.textContent, /incomplete/i);
});

test('Remove hands focus to the next item ON SCREEN (category order), not the next in storage order', () => {
  const data = P.validate(feed([row(1), row(2, { category: 'peer_support' }), row(3)]));
  const order = P.displayOrder({ ...P.blank(), ids: ['a1', 'a2', 'a3'] }, data);
  assert.deepEqual(order, ['a1', 'a3', 'a2'], 'aftercare group first, then peer support, each in packet order');
  const c = P.create({ storage: store() });
  c.mount(null, null, () => data);
  c.addMany(['a1', 'a2', 'a3']);
  const hit = c.handleClick(fakeButton({ 'data-fd-care-packet-remove': 'a1' }));
  assert.deepEqual(hit, { attr: 'data-fd-care-packet-remove', id: 'a3' }, 'a3 is the next row under a1; a2 is in another group');
  const last = c.handleClick(fakeButton({ 'data-fd-care-packet-remove': 'a2' }));
  assert.equal(last.id, 'a3', 'removing the last row falls back to the previous one on screen');
});

test('a PARTIAL directory never destroys saved listings; a complete one drops listings it no longer carries', () => {
  const full = P.validate(feed([row(1), row(2), row(3)]));
  const partial = { ...full, records: full.records.filter(r => r.id !== 'a2'), partial: true };
  const st = { ...P.blank(), ids: ['a1', 'a2'] };
  const withPartial = P.toggle(st, 'a3', partial);
  assert.deepEqual(withPartial.state.ids, ['a1', 'a2', 'a3'], 'a2 is hidden, not gone: its category may simply not have loaded');
  assert.deepEqual(P.addMany(st, ['a3'], partial).state.ids, ['a1', 'a2', 'a3']);
  const complete = { ...partial, partial: false };
  assert.deepEqual(P.toggle(st, 'a3', complete).state.ids, ['a1', 'a3'], 'a complete feed that lacks a2 means a2 is stale');
  assert.equal(P.held(st, partial), 2, 'hidden listings still hold their slots while the feed is partial');
  assert.equal(P.held(st, complete), 1);
  assert.match(P.tray(st, partial, {}), /1 saved listing is hidden while the directory is incomplete/);
  assert.doesNotMatch(P.tray(st, complete, {}), /hidden while/);
});

test('hidden listings count toward the cap so a partial feed cannot push a stored packet past 12', () => {
  const full = dataOf(20);
  const partial = { ...full, records: full.records.filter(r => Number(r.id.slice(1)) >= 10), partial: true };
  const st = { ...P.blank(), ids: idsOf(10) };
  const r = P.addMany(st, ['a10', 'a11', 'a12', 'a13'], partial);
  assert.equal(r.state.ids.length, 12);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 2);
  assert.equal(P.toggle(r.state, 'a14', partial).result, 'full');
  assert.equal(P.context(r.state, partial).full, true);
});

test('stored insert switches are limited to the known inserts, so no stored key can shadow a built-in', () => {
  const dirty = P.normalize({ inserts: { constructor: true, prototype: true, hasownproperty: true, callback: false, meds: true, bogus: true } });
  assert.deepEqual(dirty.inserts, { callback: false, meds: true });
});

test('only the literal true opens the gate; no URL, storage or cookie value can', () => {
  const anyKey = () => ({ getItem: () => '1', setItem() {}, removeItem() {} });
  const loc = { search: '?tab=care&packet=1', hash: '#packet', href: 'https://x/?packet=1#packet' };
  const gate = src => new Function('sessionStorage', 'localStorage', 'location', 'window', 'document',
    read('fd_data.js') + src + ';return fdCarePacketEnabled();')(anyKey(), anyKey(), loc, { location: loc, sessionStorage: anyKey() }, { cookie: 'packet=1' });
  assert.equal(gate(PACKET), false);
  assert.equal(gate(PACKET.replace('var FD_CARE_PACKET_ENABLED=false;', 'var FD_CARE_PACKET_ENABLED="true";')), false, 'truthy is not true');
  assert.equal(gate(PACKET.replace('var FD_CARE_PACKET_ENABLED=false;', 'var FD_CARE_PACKET_ENABLED=true;')), true);
});

test('ids and category labels from the feed are escaped everywhere they are written into markup', () => {
  const hostile = '"><img src=x onerror=alert(1)>';
  const data = P.validate({ ...feed([row(1, { id: hostile }), row(2, { category: 'peer_support' })]),
    categories: categoryIds.map(id => ({ id, label: id === 'aftercare' ? '<b onmouseover=1>Aftercare</b>' : id, available: true, count: id === 'aftercare' || id === 'peer_support' ? 1 : 0 })) });
  const st = { ...P.blank(), ids: [hostile, 'a2'] };
  const html = P.tray(st, data, {}) + P.button(data.records[0], P.context(st, data)) +
    P.results(data, P.search(data, 'support', '', '', 1), '2026-10-12', P.context(st, data));
  assert.doesNotMatch(html, /<img|<b /);
  assert.match(html, /&lt;b onmouseover=1&gt;Aftercare/);
  assert.match(html, /data-fd-care-packet="&quot;&gt;&lt;img/);
});

test('single adds reach the cap at exactly 12, refuse the 13th, and the 12th still shows as full', () => {
  const data = dataOf(14);
  let st = P.blank();
  for (let i = 0; i < 12; i++) {
    const r = P.toggle(st, 'a' + i, data);
    assert.equal(r.result, 'added', 'add #' + (i + 1));
    st = r.state;
  }
  assert.equal(P.toggle(st, 'a12', data).result, 'full');
  assert.equal(P.context(st, data).full, true);
  assert.equal(P.context({ ...P.blank(), ids: idsOf(11) }, data).full, false);
});

test('the nudge starts at 9 and not at 8; bulk buttons disable at (0) even when the packet is not full', () => {
  const data = dataOf(20);
  assert.doesNotMatch(P.tray({ ...P.blank(), ids: idsOf(8) }, data, {}), /Eight or fewer/);
  assert.match(P.tray({ ...P.blank(), ids: idsOf(9) }, data, {}), /Eight or fewer/);
  const result = P.search(data, 'support', '', '', 1);
  const pagePacked = P.bulk(result, P.context({ ...P.blank(), ids: result.rows.map(r => r.id) }, data));
  assert.match(pagePacked, /data-fd-care-packet-page disabled>Add this page \(0\)/);
  assert.doesNotMatch(pagePacked, /data-fd-care-packet-all disabled/);
});

test('up and down are disabled at the edge of each category group, not only at the ends of the whole list', () => {
  const data = P.validate(feed([row(1), row(2), row(3, { category: 'peer_support' }), row(4, { category: 'peer_support' })]));
  const html = P.tray({ ...P.blank(), ids: ['a1', 'a2', 'a3', 'a4'] }, data, {});
  assert.match(html, /data-fd-care-packet-up="a1"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-down="a2"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-up="a3"[^>]*disabled/);
  assert.doesNotMatch(html, /data-fd-care-packet-down="a1"[^>]*disabled/);
  assert.doesNotMatch(html, /data-fd-care-packet-up="a4"[^>]*disabled/);
});

test('a packed listing keeps the same visible label and says it is pressed', () => {
  const data = dataOf(3);
  const html = P.button(data.records[0], P.context({ ...P.blank(), ids: ['a0'] }, data));
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, />Add to packet</, 'never flips to "In packet", or voice control (WCAG 2.5.3) loses the name');
  assert.match(html, /aria-label="Add to packet: Support 0"/);
});

test('fd_care_search.js stays ES5 and network-free too (PR B extends it)', () => {
  const search = read('fd_care_search.js');
  for (const es6 of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\bclass\s+\w/, /\.\.\./]) assert.doesNotMatch(search, es6, 'ES5 only: ' + es6);
  assert.equal((search.match(/\bfetch\s*\(/g) || []).length, 1, 'exactly the one fixed directory feed request');
  assert.doesNotMatch(search, /localStorage|sessionStorage|sendBeacon|XMLHttpRequest/);
});

test('the bulk bar really is emitted above the list (a missing bar can no longer pass)', () => {
  const data = dataOf(7);
  const html = P.results(data, P.search(data, 'support', '', '', 1), '2026-10-12', P.context(P.blank(), data));
  assert.ok(html.indexOf('fd-care-search__bulk') > -1);
  assert.ok(html.indexOf('fd-care-search__bulk') < html.indexOf('<ol'));
});

test('the gate is never read back from storage when the controller is created', () => {
  const s = store();
  s.m.set('fd_care_packet_v1', JSON.stringify({ ids: ['a1'], gate: gateOn, verification: true }));
  const c = P.create({ storage: s });
  c.mount(null, null, () => dataOf(3));
  assert.deepEqual(c.gate(), { verification: false, region: false, identifiers: false, supervisor: false });
  c.toggle('a2');
  assert.equal(Object.keys(JSON.parse(s.m.get('fd_care_packet_v1'))).sort().join(), 'ids,inserts,mode,why', 'only the four documented fields are ever written');
});
