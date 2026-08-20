import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SOURCE_URL = new URL('../13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js', import.meta.url);
const LICENSE_URL = new URL('../13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.LICENSE', import.meta.url);
const CURATOR_URL = new URL('../13_Faculty_Resources/Rotation_Curation/rotation-curator.html', import.meta.url);
const SHELL_URL = new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url);
const COMMON_URL = new URL('../13_Faculty_Resources/_automation/site_build/common.py', import.meta.url);
const CURATOR_JS_URL = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js', import.meta.url);
const STATIC_QA_URL = new URL('../13_Faculty_Resources/_automation/site_build/check-static-site.mjs', import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_SHA256 = '18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780';
const LICENSE_SHA256 = '3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c';
const NPM_TARBALL_SHA256 = 'ab6ed47d378877441deae95972e07b2716c26545a735a23aa6b9d442b33026ed';
const NPM_TARBALL_INTEGRITY = 'sha512-HM7yY8O2ilqhmULxGMpcHSF1EhJJ9yBj8gvDEuZ6M+KGJ0YY2hKpnXvRD+hZPLrDVck3ExIGhmPtSdcjC+guuw==';
const TAG_LICENSE_URL = 'https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/js1.4.4/LICENSE';
const source = existsSync(SOURCE_URL) ? readFileSync(SOURCE_URL, 'utf8') : '';
const license = existsSync(LICENSE_URL) ? readFileSync(LICENSE_URL, 'utf8') : '';

test('vendored qrcode-generator 1.4.4 source and tag-specific MIT license bytes are pinned beside npm receipts', () => {
  assert.equal(existsSync(SOURCE_URL), true, 'vendored source must exist'); assert.equal(existsSync(LICENSE_URL), true, 'adjacent license must exist');
  assert.equal(createHash('sha256').update(Buffer.from(source)).digest('hex'), SOURCE_SHA256);
  assert.equal(createHash('sha256').update(Buffer.from(license)).digest('hex'), LICENSE_SHA256);
  assert.match(source.slice(0, 700), /QR Code Generator for JavaScript/); assert.match(source.slice(0, 700), /Copyright \(c\) 2009 Kazuhiko Arase/); assert.match(source.slice(0, 700), /Licensed under the MIT license/);
  assert.match(license, /^MIT License\n\nCopyright \(c\) 2009 Kazuhiko Arase\n/); assert.match(license, /SOFTWARE\.\n$/);
});

test('the unique QR vendor marker is curator-only and maps to the exact local source', () => {
  const marker = '/*__QR_GENERATOR_1_4_4__*/'; const curator = readFileSync(CURATOR_URL, 'utf8'); const shell = readFileSync(SHELL_URL, 'utf8'); const common = readFileSync(COMMON_URL, 'utf8');
  assert.equal(curator.split(marker).length - 1, 1); assert.equal(shell.includes(marker), false);
  assert.match(common, /"\/\*__QR_GENERATOR_1_4_4__\*\/"\s*:\s*"vendor\/qrcode-generator-1\.4\.4\.js"/);
  assert.equal(curator.indexOf(marker) < curator.indexOf('/*__FD_CURATOR__*/'), true, 'QR global must precede the curator consumer');

  const tracked = spawnSync('git', ['ls-files', '--', '*.html'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const consumers = tracked.filter((path) => readFileSync(join(ROOT, path), 'utf8').includes(marker));
  assert.deepEqual(consumers, ['13_Faculty_Resources/Rotation_Curation/rotation-curator.html']);
});

test('the adjacent non-executable vendoring receipt binds package, tarball, source, and tag-license provenance', () => {
  const curator = readFileSync(CURATOR_URL, 'utf8');
  const match = curator.match(/<!-- QR-VENDOR-RECEIPT ([^\n]+) -->\s*\/\*__QR_GENERATOR_1_4_4__\*\//);
  assert.ok(match, 'one receipt must sit immediately beside the QR marker');
  const entries = [...match[1].matchAll(/([a-z0-9-]+)="([^"]+)"/g)].map((item) => [item[1], item[2]]);
  const receipt = Object.fromEntries(entries); assert.equal(entries.length, 6); assert.equal(Object.keys(receipt).length, 6);
  assert.deepEqual(receipt, {
    package: 'qrcode-generator@1.4.4', 'npm-integrity': NPM_TARBALL_INTEGRITY,
    'tarball-sha256': NPM_TARBALL_SHA256, 'source-sha256': SOURCE_SHA256,
    'license-url': TAG_LICENSE_URL, 'license-sha256': LICENSE_SHA256,
  });
  assert.equal(createHash('sha256').update(readFileSync(SOURCE_URL)).digest('hex'), receipt['source-sha256']);
  assert.equal(createHash('sha256').update(readFileSync(LICENSE_URL)).digest('hex'), receipt['license-sha256']);
});

test('vendored QR code has no executable remote import or request path', () => {
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(executable, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\b/);
  assert.doesNotMatch(executable, /\b(?:script|img|image)\s*\.\s*src\s*=/i); assert.doesNotMatch(executable, /\bimport\s*\(/);
});

function runStaticQa(extra, indexExtra = '') {
  const directory = mkdtempSync(join(tmpdir(), 'rotation-qr-qa-'));
  const sourceMap = `${directory}.source-map.json`;
  try {
    mkdirSync(join(directory, 'tools'));
    writeFileSync(join(directory, 'index.html'), `<!doctype html><html><head><title>Fixture</title></head><body>${indexExtra}</body></html>`);
    writeFileSync(join(directory, 'tools', 'rotation-curator.html'), `<!doctype html><html><head><title>Curator</title><meta name="viewport" content="width=device-width"></head><body>${extra}</body></html>`);
    const root = new URL('../', import.meta.url).pathname;
    const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    const sources = tracked.filter((relative) => {
      const parts = relative.split('/'); if (!/^\d{2}_/.test(parts[0]) || parts[0] === '00_START_HERE' || parts[0] === '99_Archive' || parts.some((part) => part.startsWith('_'))) return false;
      const filename = parts.at(-1); return /_inpatient(?:_teaching)?\.md$|_pocket_(?:guide|card)\.md$/.test(filename) || /^01_Six_Week_Curriculum\/Week_[^/]+\/README\.md$/.test(relative);
    });
    writeFileSync(sourceMap, JSON.stringify({ sources }));
    return spawnSync(process.execPath, [STATIC_QA_URL.pathname, directory], { encoding: 'utf8', env: { ...process.env, STRICT: '0' } });
  } finally { rmSync(directory, { recursive: true, force: true }); rmSync(sourceMap, { force: true }); }
}

test('static QA mechanically rejects remote QR script/image destinations and executable network transports', () => {
  const signature = '<script>var qrcode = function(){}</script>';
  const baseline = runStaticQa(`${signature}<link rel="stylesheet" href="../frontdoor.css"><svg aria-label="local QR"></svg>`); assert.equal(baseline.status, 0, `${baseline.stdout}\n${baseline.stderr}`);
  const leaked = runStaticQa(signature, signature); assert.notEqual(leaked.status, 0); assert.match(`${leaked.stdout}\n${leaked.stderr}`, /QR vendor signature outside rotation-curator\.html/);
  for (const [label, html, expected] of [
    ['script', '<script src="https://remote.invalid/qr.js"></script>', /remote script source in rotation-curator\.html/],
    ['unquoted script', '<script src=https://remote.invalid/qr.js></script>', /remote script source in rotation-curator\.html/],
    ['image', '<img src="//remote.invalid/qr.png" alt="QR">', /remote image source in rotation-curator\.html/],
    ['image srcset', '<img src="local.png" srcset="local.png 1x, https://remote.invalid/qr.png 2x" alt="QR">', /remote image source in rotation-curator\.html/],
    ['srcset before data src', '<img srcset="https://remote.invalid/qr.png 2x" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="QR">', /remote image source in rotation-curator\.html/],
    ['picture source', '<picture><source srcset="https://remote.invalid/qr.webp 1x"><img src="local.png" alt="QR"></picture>', /remote image source in rotation-curator\.html/],
    ['unquoted image', '<img src=https://remote.invalid/qr.png alt="QR">', /remote image source in rotation-curator\.html/],
    ['SVG use href', '<svg><use href="https://remote.invalid/qr.svg#code"></use></svg>', /remote image source in rotation-curator\.html/],
    ['mixed-case SVG use unquoted xlink href', '<svg><USE XLINK:HREF=https://remote.invalid/qr.svg#code></USE></svg>', /remote image source in rotation-curator\.html/],
    ['SVG feImage unquoted href', '<svg><filter><feImage href=https://remote.invalid/qr.svg></feImage></filter></svg>', /remote image source in rotation-curator\.html/],
    ['mixed-case SVG feImage quoted xlink href', '<svg><filter><FEIMAGE xlink:href="https://remote.invalid/qr.svg"></FEIMAGE></filter></svg>', /remote image source in rotation-curator\.html/],
    ['stylesheet', '<link rel="stylesheet" href="https://remote.invalid/qr.css">', /remote stylesheet source in rotation-curator\.html/],
    ['unquoted stylesheet', '<link rel=stylesheet href=https://remote.invalid/qr.css>', /remote stylesheet source in rotation-curator\.html/],
    ['CSS url', '<style>.qr{background-image:url(https://remote.invalid/qr.png)}</style>', /remote CSS destination in rotation-curator\.html/],
    ['CSS import', '<style>@import "https://remote.invalid/qr.css";</style>', /remote CSS destination in rotation-curator\.html/],
    ['transport', '<script>fetch("https://remote.invalid/edition")</script>', /network transport API in rotation-curator\.html/],
    ['dynamic Image sink', '<script>var beacon=new Image(); beacon.src="https://remote.invalid/edition";</script>', /network transport API in rotation-curator\.html/],
    ['dynamic SVG href sink', '<svg><image></image></svg><script>var image=document.querySelector("image"); image.setAttribute("href","https://remote.invalid/qr.svg");</script>', /network transport API in rotation-curator\.html/],
    ['dynamic SVG xlink href sink', '<svg><image></image></svg><script>var image=document.querySelector("image"); image.setAttribute("xlink:href","https://remote.invalid/qr.svg");</script>', /network transport API in rotation-curator\.html/],
    ['transport between comment-like string literals', '<script>const start="/*"; fetch("https://remote.invalid/edition"); const end="*/";</script>', /network transport API in rotation-curator\.html/],
  ]) {
    const result = runStaticQa(html); assert.notEqual(result.status, 0, label); assert.match(`${result.stdout}\n${result.stderr}`, expected, label);
  }
});

function loadQrApi() {
  assert.ok(source); const curatorSource = readFileSync(CURATOR_JS_URL, 'utf8');
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', `${source}\n${curatorSource}\nreturn {qrcode,fdCuratorQrSvg};`)(TextEncoder, TextDecoder, atob, btoa);
}
function svgGeometry(svg) {
  const view = svg.match(/viewBox="0 0 ([0-9]+) ([0-9]+)"/); const rects = [...svg.matchAll(/<rect x="([0-9]+)" y="([0-9]+)" width="4" height="4"\/>/g)];
  return { width: view ? Number(view[1]) : 0, height: view ? Number(view[2]) : 0, cells: rects.map((m) => [Number(m[1]), Number(m[2])]) };
}

test('QR wrapper calls automatic version M with explicit Byte mode and emits the exact accessible 4px grid', () => {
  const api = loadQrApi(); const calls = []; const actualFactory = api.qrcode;
  const spy = function(type, correction) { calls.push(['factory', type, correction]); const qr = actualFactory(type, correction); const add = qr.addData; qr.addData = function(data, mode) { calls.push(['addData', data, mode]); return add.call(qr, data, mode); }; return qr; };
  const curatorSource = readFileSync(CURATOR_JS_URL, 'utf8');
  const wrapped = new Function('qrcode', `${curatorSource}\nreturn fdCuratorQrSvg;`)(spy);
  const url = `https://example.test/#edition=${'A'.repeat(80)}`; const result = wrapped(url);
  assert.deepEqual(calls[0], ['factory', 0, 'M']); assert.deepEqual(calls[1], ['addData', url, 'Byte']);
  assert.equal(result.ok, true); assert.equal(result.code, 'QR_READY'); assert.match(result.svg, /^<svg /); assert.match(result.svg, /role="img"/); assert.match(result.svg, /<title[^>]*>Rotation edition link QR code<\/title>/);
  const qr = actualFactory(0, 'M'); qr.addData(url, 'Byte'); qr.make(); const geometry = svgGeometry(result.svg); const count = qr.getModuleCount();
  assert.equal(geometry.width, (count + 8) * 4); assert.equal(geometry.height, (count + 8) * 4);
  const expected = []; for (let row = 0; row < count; row += 1) for (let col = 0; col < count; col += 1) if (qr.isDark(row, col)) expected.push([(col + 4) * 4, (row + 4) * 4]);
  assert.deepEqual(geometry.cells, expected);
});

test('QR length boundary is exactly 1,800/1,801 ASCII URL characters', () => {
  const { qrcode, fdCuratorQrSvg } = loadQrApi(); const prefix = 'https://example.test/#edition=';
  const atLimit = prefix + 'A'.repeat(1800 - prefix.length); const above = prefix + 'A'.repeat(1801 - prefix.length);
  const accepted = fdCuratorQrSvg(atLimit); assert.equal(accepted.ok, true); assert.equal(accepted.code, 'QR_READY'); assert.ok(accepted.svg.length > 1000);
  const pinned = qrcode(0, 'M'); pinned.addData(atLimit, 'Byte'); pinned.make();
  const geometry = svgGeometry(accepted.svg); const count = pinned.getModuleCount();
  assert.deepEqual([geometry.width, geometry.height], [(count + 8) * 4, (count + 8) * 4]);
  const expected = []; for (let row = 0; row < count; row += 1) for (let col = 0; col < count; col += 1) if (pinned.isDark(row, col)) expected.push([(col + 4) * 4, (row + 4) * 4]);
  assert.deepEqual(geometry.cells, expected, 'the 1,800-character SVG must preserve every pinned dark module');
  assert.deepEqual(fdCuratorQrSvg(above), { ok: false, code: 'QR_TOO_LONG' });
  assert.deepEqual(fdCuratorQrSvg(`https://example.test/#edition=caf\u00e9`), { ok: false, code: 'QR_INVALID' });
});
