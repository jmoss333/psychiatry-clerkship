import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const packUrl = new URL(`${BUILD}/frontdoor/fd_care_pack.js`, import.meta.url);
const packSrc = existsSync(packUrl) ? readFileSync(packUrl, 'utf8') : '';
const dataSrc = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');
const qrSrc = readFileSync(new URL(
  `${BUILD}/vendor/qrcode-generator-1.4.4.js`, import.meta.url), 'utf8');
const curriculum = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));
const crisis = JSON.parse(readFileSync(new URL('../crisis_resources.json', import.meta.url), 'utf8'));

function api(qrSource = qrSrc) {
  // eslint-disable-next-line no-new-func
  return new Function(`${dataSrc}\n${qrSource}\n${packSrc}\nreturn {
    resources: typeof fdCarePackResources === 'function' ? fdCarePackResources : null,
    ids: typeof fdCarePackIds === 'function' ? fdCarePackIds : null,
    toggle: typeof fdCarePackToggle === 'function' ? fdCarePackToggle : null,
    qr: typeof fdCarePackQrSvg === 'function' ? fdCarePackQrSvg : null,
    render: typeof fdCarePack === 'function' ? fdCarePack : null,
  };`)();
}

const F = api();
const index = { careResources: curriculum.careResources };
const crisisHtml = '<section class="crisis-block" aria-labelledby="crisis-block-heading">'
  + '<h2 id="crisis-block-heading">If someone is in crisis</h2><ul><li>governed</li></ul></section>';

test('the pack is registered after the local QR vendor and before Care and the controller', () => {
  assert.ok(packSrc, 'frontdoor/fd_care_pack.js must exist');
  const common = readFileSync(new URL(`${BUILD}/common.py`, import.meta.url), 'utf8');
  const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
  assert.match(common,
    /"\/\*__FD_CARE_PACK__\*\/"\s*:\s*"frontdoor\/fd_care_pack\.js"/);
  for (const source of [common, shell]) {
    assert.ok(source.indexOf('/*__QR_GENERATOR_1_4_4__*/')
      < source.indexOf('/*__FD_CARE_PACK__*/'));
    assert.ok(source.indexOf('/*__FD_CARE_PACK__*/') < source.indexOf('/*__FD_CARE__*/'));
    assert.ok(source.indexOf('/*__FD_CARE_PACK__*/') < source.indexOf('/*__FD_WIRE__*/'));
  }
});

test('resource validation admits only complete canonical HTTPS records', () => {
  assert.equal(typeof F.resources, 'function');
  const rows = [
    { id: 'safe', title: 'Safe title', description: 'Safe description',
      url: 'https://example.test/resource' },
    { id: 'constructor', title: 'Inherited key', description: 'No',
      url: 'https://example.test/inherited' },
    { id: ['array'], title: 'Array ID', description: 'No', url: 'https://example.test/array' },
    { id: 'http', title: 'HTTP', description: 'No', url: 'http://example.test/http' },
    { id: 'script', title: 'Script', description: 'No', url: 'javascript:alert(1)' },
    { id: 'empty-title', title: '', description: 'No', url: 'https://example.test/empty' },
    { id: 'empty-description', title: 'No', description: '', url: 'https://example.test/empty' },
  ];
  assert.deepEqual(F.resources({ careResources: rows }), [rows[0]]);
  assert.deepEqual(F.resources({ careResources: null }), []);
});

test('selection is unique, capped at three, and rendered in curriculum order', () => {
  assert.equal(typeof F.ids, 'function');
  assert.deepEqual(F.ids(index, [
    'podcast-navigator', 'resource-finder', 'podcast-navigator', 'missing',
    'meeting-calendar', 'education-library', 'book-shelf', 'constructor', ['book-shelf'],
  ]), ['resource-finder', 'meeting-calendar', 'education-library']);
  assert.deepEqual(F.ids(index, 'resource-finder'), []);
});

test('toggle removes an included resource and rejects a fourth without replacement', () => {
  assert.equal(typeof F.toggle, 'function');
  assert.deepEqual(F.toggle(index,
    ['resource-finder', 'meeting-calendar', 'education-library'], 'book-shelf'),
  ['resource-finder', 'meeting-calendar', 'education-library']);
  assert.deepEqual(F.toggle(index,
    ['resource-finder', 'meeting-calendar', 'education-library'], 'meeting-calendar'),
  ['resource-finder', 'education-library']);
  assert.deepEqual(F.toggle(index, ['book-shelf'], 'podcast-navigator'),
    ['podcast-navigator', 'book-shelf']);
  assert.deepEqual(F.toggle(index, ['book-shelf'], 'constructor'), ['book-shelf']);
});

test('QR generation encodes the exact canonical URL and emits local accessible SVG', () => {
  const calls = [];
  const actualFactory = api().qr ? new Function(`${qrSrc}\nreturn qrcode;`)() : null;
  assert.equal(typeof actualFactory, 'function');
  const spyFactory = function(type, correction) {
    calls.push(['factory', type, correction]);
    const qr = actualFactory(type, correction);
    const add = qr.addData;
    qr.addData = function(value, mode) {
      calls.push(['addData', value, mode]);
      return add.call(qr, value, mode);
    };
    return qr;
  };
  const spySource = `var qrcode = (${spyFactory.toString()});`;
  // spyFactory closes over these names when evaluated in the generated function.
  // eslint-disable-next-line no-new-func
  const spyApi = new Function('calls', 'actualFactory', `${dataSrc}\n${spySource}\n${packSrc}\nreturn fdCarePackQrSvg;`)(calls, actualFactory);
  const url = 'https://reconnect-tools.netlify.app/tools/podcast-navigator.html';
  const result = spyApi(url, 'Find a podcast to share');
  assert.deepEqual(calls[1], ['addData', url, 'Byte']);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'QR_READY');
  assert.match(result.svg, /^<svg /);
  assert.match(result.svg, /role="img"/);
  assert.match(result.svg, /aria-label="QR code for Find a podcast to share"/);
  assert.doesNotMatch(result.svg, /(?:href|src)=/);
});

test('the empty builder shows five choices, automatic crisis inclusion, and no printable action', () => {
  assert.equal(typeof F.render, 'function');
  const html = F.render(index, [], crisisHtml);
  assert.equal((html.match(/data-fd-care-pack="/g) || []).length, 5);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 5);
  assert.match(html, /0 of 3 selected/);
  assert.match(html, /Crisis resources are included automatically/);
  assert.match(html, /<section class="crisis-block"/);
  assert.match(html, /data-fd-care-pack-print[^>]*disabled/);
  assert.match(html, /Choose at least one resource to prepare the handout/);
  assert.doesNotMatch(html, /<input|<textarea|contenteditable/i);
});

test('three selections render exact links, QR codes, a fixed count, and disabled remaining choices', () => {
  const ids = ['resource-finder', 'education-library', 'book-shelf'];
  const html = F.render(index, ids, crisisHtml);
  assert.match(html, /3 of 3 selected/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 3);
  assert.equal((html.match(/data-fd-care-pack="[^\"]+"[^>]*disabled/g) || []).length, 2);
  assert.equal((html.match(/class="fd-care-pack__resource"/g) || []).length, 3);
  assert.equal((html.match(/class="fd-care-pack__qr"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-fd-care-pack-print[^>]*disabled/);
  for (const id of ids) {
    const item = curriculum.careResources.find((row) => row.id === id);
    assert.ok(item);
    assert.match(html, new RegExp(`href="${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(html, new RegExp(`>${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  }
  assert.equal((html.match(/<section class="crisis-block"/g) || []).length, 1);
});

test('missing QR support keeps the canonical link and reports the local fallback', () => {
  const noQr = api('var qrcode = null;');
  const item = curriculum.careResources[0];
  const html = noQr.render(index, [item.id], crisisHtml);
  assert.match(html, /QR unavailable/);
  assert.match(html, new RegExp(`href="${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.doesNotMatch(html, /class="fd-care-pack__qr"/);
  assert.doesNotMatch(html, /data-fd-care-pack-print[^>]*disabled/);
});

test('missing crisis HTML fails closed and disables printing without inventing contacts', () => {
  const html = F.render(index, ['resource-finder'], '');
  assert.match(html, /crisis-resource block did not load/);
  assert.doesNotMatch(html, /Crisis resources are included automatically/);
  assert.match(html, /data-fd-care-pack-print[^>]*disabled/);
  for (const resource of crisis.resources) {
    assert.doesNotMatch(html, new RegExp(resource.contact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('the pure module is ES5, browser-global free, and contains no crisis contacts', () => {
  assert.doesNotMatch(packSrc,
    /localStorage\.|sessionStorage\.|document\.|window\.|fetch\(|XMLHttpRequest|cwAnalytics|\.record\(|\bconst\s|\blet\s|=>|`/);
  for (const resource of crisis.resources) {
    assert.ok(resource.contact.length > 0);
    assert.doesNotMatch(packSrc,
      new RegExp(resource.contact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
