/* fd_icons.js (C1, icons & wayfinding): the pure ES5 helper that points at the vendored sprite.
   Spec: docs/superpowers/specs/icon-nav-handoff/PROMPT.md ("C1: icon module") and LUCIDE-PIN.md.
   The sprite generator and its build wiring are pinned in fd-icon-sprite.test.mjs; the ReConnect
   parity check is fd-icons-reconnect-drift.test.mjs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const iconsSrc = readFileSync(new URL(`${BUILD}/frontdoor/fd_icons.js`, import.meta.url), 'utf8');
const dataSrc = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL(`${BUILD}/clinical-warm.css`, import.meta.url), 'utf8');
const VENDOR_JSON = new URL(`${BUILD}/vendor/lucide-static-1.54.0.icons.json`, import.meta.url);
const VENDOR_LICENSE = new URL(`${BUILD}/vendor/lucide-static-1.54.0.LICENSE`, import.meta.url);
const vendor = JSON.parse(readFileSync(VENDOR_JSON, 'utf8'));
const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// eslint-disable-next-line no-new-func
const F = new Function(`
  ${dataSrc}
  ${iconsSrc}
  return { fdIcon: fdIcon, fdIconId: fdIconId, FD_ICON_NAMES: FD_ICON_NAMES,
           FD_ICON_ALIASES: FD_ICON_ALIASES, FD_ICON_SIZES: FD_ICON_SIZES,
           FD_ICON_SOURCE: FD_ICON_SOURCE };
`)();

// The C0 registry (LUCIDE-PIN.md, "Site A subset"): registry name -> upstream Lucide name.
const C0_REGISTRY = {
  today: 'sun', path: 'route', library: 'library', care: 'hand-heart',
  ask: 'message-circle-question', settings: 'settings-2', chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left', chevronDown: 'chevron-down', arrowRight: 'arrow-right',
  external: 'external-link', plus: 'plus', check: 'check', close: 'x', filter: 'list-filter',
  thisWeek: 'calendar', startHere: 'flag', pocketCard: 'wallet-cards', diagnoses: 'brain',
  medication: 'pill', family: 'users', exam: 'clipboard-check', tool: 'wrench',
  systems: 'network', scholarship: 'pen-line', skills: 'messages-square',
  evidence: 'graduation-cap', reading: 'book-open', deck: 'layers', podcast: 'headphones',
  bookList: 'library-big', caseVignette: 'user-round', journey: 'footprints',
  reference: 'file-text',
};
// Planned for C2/C3 by the C1 brief, beyond the C0 table: the calm-notice / crisis / time glyphs
// ReConnect already ships (circle-alert, life-buoy) plus clock.
const C1_EXTRA = ['life-buoy', 'circle-alert', 'clock'];

// ---- provenance --------------------------------------------------------------------------

test('vendored subset names lucide-static 1.54.0 and the npm receipts C0 pinned', () => {
  assert.equal(vendor.source.package, 'lucide-static');
  assert.equal(vendor.source.version, '1.54.0');
  assert.equal(vendor.source.shasum, '3addc8999298b41f788f3b15cf8042a4607293c6');
  assert.equal(vendor.source.integrity,
    'sha512-Y0NVQ7uX17m+Jee/coLs7uxGF3bEyWHXiXFBXxmE7BnjjMa5o0s1gR4zQHBQHN19RYaQWVG2cx4GdrW/WroyrA==');
  assert.equal(F.FD_ICON_SOURCE, 'lucide-static@1.54.0');
  assert.match(iconsSrc.slice(0, 400), /lucide-static@1\.54\.0 \(ISC; MIT for the Feather-derived glyphs\)/);
});

test('vendored LICENSE is the release file byte for byte (ISC + Feather MIT)', () => {
  const bytes = readFileSync(VENDOR_LICENSE);
  // sha256 of lucide-static-1.54.0.tgz:package/LICENSE == docs/.../icon-nav-handoff/LICENSE-lucide.txt
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57');
  // The C0 spec carries the same file (#1012). Compared once it is on the branch; until C0 merges
  // the sha256 above is the pin (cmp'd against #1012 head 5faf27c0 when this was vendored).
  const specUrl = new URL('../docs/superpowers/specs/icon-nav-handoff/LICENSE-lucide.txt', import.meta.url);
  if (existsSync(specUrl)) assert.ok(readFileSync(specUrl).equals(bytes), 'must equal the C0 spec copy');
  const text = bytes.toString('utf8');
  assert.match(text, /^ISC License\n\nCopyright \(c\) 2026 Lucide Icons and Contributors\n/);
  assert.match(text, /The MIT License \(MIT\) \(for the icons listed above\)\n\nCopyright \(c\) 2013-present Cole Bemis\n/);
});

test('every vendored glyph body is a run of plain self-closed shapes (no script, no handlers, no colour)', () => {
  for (const [name, entry] of Object.entries(vendor.icons)) {
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, name);
    assert.match(entry.body, /^(?:<(?:path|circle|rect|line|polyline|polygon|ellipse)\s[^<>]*\/>)+$/, name);
    assert.doesNotMatch(entry.body, /\son[a-z]+=|<script|#[0-9a-fA-F]{3,6}\b|fill=|stroke=|style=/, name);
    assert.equal(typeof entry.feather, 'boolean', name);
  }
});

test('glyph sizes match the bytes C0 measured (LUCIDE-PIN.md) for every C0 row', () => {
  const C0_BYTES = {
    sun: 241, route: 124, library: 80, 'hand-heart': 343, 'message-circle-question': 205,
    'settings-2': 100, 'chevron-right': 25, 'chevron-left': 26, 'chevron-down': 24,
    'arrow-right': 45, 'external-link': 112, plus: 40, check: 27, x: 44, 'list-filter': 58,
    calendar: 105, flag: 158, 'wallet-cards': 155, brain: 361, pill: 100, users: 159,
    'clipboard-check': 163, wrench: 205, network: 217, 'pen-line': 160, 'messages-square': 241,
    'graduation-cap': 192, 'book-open': 171, layers: 290, headphones: 135, 'library-big': 189,
    'user-round': 63, footprints: 296, 'file-text': 216,
  };
  let total = 0;
  for (const [name, bytes] of Object.entries(C0_BYTES)) {
    assert.ok(vendor.icons[name], `${name} missing from the vendored subset`);
    assert.equal(Buffer.byteLength(vendor.icons[name].body), bytes, name);
    total += bytes;
  }
  assert.equal(total, 5070, 'C0 table total');
});

test('Feather (MIT) marks match the release LICENSE, including renamed glyphs', () => {
  const feather = Object.keys(vendor.icons).filter((n) => vendor.icons[n].feather).sort();
  assert.deepEqual(feather, ['arrow-right', 'calendar', 'check', 'chevron-down', 'chevron-left',
    'chevron-right', 'circle-alert', 'clock', 'external-link', 'headphones', 'life-buoy', 'plus', 'x']);
});

// ---- the name tables -----------------------------------------------------------------------

test('FD_ICON_NAMES is exactly the vendored glyph set (helper and sprite cannot drift)', () => {
  assert.deepEqual(Object.keys(F.FD_ICON_NAMES).sort(), Object.keys(vendor.icons).sort());
});

test('the subset is the C0 table plus the C1 additions, nothing else', () => {
  const want = new Set([...Object.values(C0_REGISTRY), ...C1_EXTRA]);
  assert.deepEqual(Object.keys(vendor.icons).sort(), [...want].sort());
  for (const name of ['layers', 'book-open', 'headphones', 'library-big', 'wallet-cards',
    'clipboard-check', 'route', 'file-text', 'sun', 'message-circle-question', 'life-buoy',
    'circle-alert', 'clock', 'check']) {
    assert.ok(F.FD_ICON_NAMES[name], `${name} (planned for C2/C3) must be vendored`);
  }
});

test('FD_ICON_ALIASES is the C0 registry exactly, and every alias resolves to a vendored glyph', () => {
  assert.deepEqual({ ...F.FD_ICON_ALIASES }, C0_REGISTRY);
  for (const [alias, target] of Object.entries(C0_REGISTRY)) {
    assert.equal(F.fdIconId(alias), target, alias);
  }
});

test('size table equals the --fd-glyph-sm/md/lg tokens in clinical-warm.css', () => {
  for (const size of ['sm', 'md', 'lg']) {
    const m = cssSrc.match(new RegExp(`--fd-glyph-${size}:(\\d+)px`));
    assert.ok(m, `--fd-glyph-${size} token`);
    assert.equal(F.FD_ICON_SIZES[size], Number(m[1]), size);
  }
  assert.deepEqual(Object.keys(F.FD_ICON_SIZES).sort(), ['lg', 'md', 'sm']);
});

// ---- fdIcon behaviour ------------------------------------------------------------------------

test('every vendored glyph and every registry name renders one <svg><use> at its sprite id', () => {
  for (const name of [...Object.keys(vendor.icons), ...Object.keys(C0_REGISTRY)]) {
    const html = F.fdIcon(name);
    const id = F.fdIconId(name);
    assert.ok(id, name);
    assert.equal(html, '<svg class="fd-icon fd-icon--md" aria-hidden="true" focusable="false" width="18" height="18"'
      + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ` stroke-linecap="round" stroke-linejoin="round"><use href="#ic-${id}"></use></svg>`, name);
  }
});

test('unknown, non-string and prototype names return the empty string', () => {
  for (const bad of ['', 'nope', 'Sun', 'ic-sun', 'sun ', ' sun', 'book_open', '#sun',
    '"><script>alert(1)</script>', 'constructor', '__proto__', 'toString', 'hasOwnProperty',
    'valueOf', null, undefined, 0, 1, true, {}, [], ['sun'], () => 'sun']) {
    assert.equal(F.fdIcon(bad), '', String(bad));
    assert.equal(F.fdIcon(bad, { label: 'x' }), '', String(bad));
  }
});

test('decorative by default: aria-hidden, unfocusable, no role, no label, no <title>', () => {
  const html = F.fdIcon('sun');
  assert.match(html, /^<svg [^>]*aria-hidden="true"/);
  assert.match(html, /focusable="false"/);
  assert.doesNotMatch(html, /role=|aria-label|<title/);
  for (const label of ['', '   ', null, undefined, 42, {}]) {
    const h = F.fdIcon('sun', { label });
    assert.match(h, /aria-hidden="true"/, String(label));
    assert.doesNotMatch(h, /role=|aria-label|<title/, String(label));
  }
});

test('labelled: role="img" + aria-label (trimmed, escaped), still unfocusable, never aria-hidden, no <title>', () => {
  const html = F.fdIcon('life-buoy', { label: '  Safety  ' });
  assert.match(html, /^<svg class="fd-icon fd-icon--md" role="img" aria-label="Safety" focusable="false"/);
  assert.doesNotMatch(html, /aria-hidden|<title/);
  const evil = F.fdIcon('sun', { label: '"><script>alert(1)</script><x a=\'' });
  assert.match(evil, /aria-label="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&lt;x a=&#39;"/);
  assert.doesNotMatch(evil, /<script|<x /);
  assert.equal((evil.match(/</g) || []).length, 4, 'only <svg>, <use>, </use>, </svg>');
});

test('size option maps to class + token-sized width/height; anything else falls back to md', () => {
  assert.match(F.fdIcon('sun', { size: 'sm' }), /class="fd-icon fd-icon--sm"[^>]* width="16" height="16"/);
  assert.match(F.fdIcon('sun', { size: 'lg' }), /class="fd-icon fd-icon--lg"[^>]* width="22" height="22"/);
  for (const size of ['xl', 'SM', '', 18, null, 'constructor', '__proto__']) {
    assert.match(F.fdIcon('sun', { size }), /class="fd-icon fd-icon--md"[^>]* width="18" height="18"/, String(size));
  }
});

test('className keeps safe class tokens and drops anything that could break out of the attribute', () => {
  assert.match(F.fdIcon('sun', { className: 'fd-dock__icon is-active' }),
    /class="fd-icon fd-icon--md fd-dock__icon is-active"/);
  const html = F.fdIcon('sun', { className: 'ok "bad onload=x <b> 9no -no' });
  assert.match(html, /class="fd-icon fd-icon--md ok"/);
  assert.doesNotMatch(html, /onload|<b>|9no|-no|"bad/);
  assert.match(F.fdIcon('sun', { className: 42 }), /class="fd-icon fd-icon--md"/);
});

test('output carries no script, event handler, hex colour, inline style or audience token', () => {
  for (const name of Object.keys(vendor.icons)) {
    for (const opts of [undefined, { label: 'Reading list' }, { size: 'lg', className: 'fd-x' }]) {
      const html = F.fdIcon(name, opts);
      assert.doesNotMatch(html, /<script|\son[a-z]+=|#[0-9a-fA-F]{3,6}\b|style=|<title|xlink/, name);
      assert.doesNotMatch(html, AUDIENCE_TOKEN_RE, name);
      assert.match(html, /stroke="currentColor"/, name);
    }
  }
});

test('pure: same input, same output; opts are not mutated', () => {
  const opts = Object.freeze({ size: 'sm', label: 'Today', className: 'a b' });
  const a = F.fdIcon('today', opts);
  assert.equal(F.fdIcon('today', opts), a);
  assert.deepEqual(opts, { size: 'sm', label: 'Today', className: 'a b' });
});

test('fd_icons.js is ES5, touches no DOM / storage / clock / network, and carries no path data', () => {
  assert.doesNotMatch(iconsSrc, /\bconst\s|\blet\s|=>|`|\bclass\s+[A-Z]|\.\.\.[A-Za-z_$]/,
    'fd_icons.js is a build-injected snippet -- ES5 only (var/function)');
  assert.doesNotMatch(iconsSrc, /localStorage|sessionStorage|document\.|window\.|Date\.now|new Date|fetch\(|XMLHttpRequest|setTimeout/);
  assert.doesNotMatch(iconsSrc, /\sd="|<path|<circle/, 'glyph bytes live in the sprite only');
  assert.doesNotMatch(iconsSrc.replace(/\/\*[\s\S]*?\*\//g, ''), AUDIENCE_TOKEN_RE,
    'shared front-door code stays audience-neutral');
});

test('nothing in the front door calls fdIcon yet (C1 changes no visible UI)', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL(`${BUILD}/frontdoor/`, import.meta.url);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js') || file === 'fd_icons.js') continue;
    assert.doesNotMatch(readFileSync(new URL(file, dir), 'utf8'), /\bfdIcon\(/, file);
  }
  const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /\bfdIcon\(|#ic-/, 'the shell must not adopt an icon in C1');
});
