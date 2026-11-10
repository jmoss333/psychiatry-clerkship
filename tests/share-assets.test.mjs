// Share surface (link-preview card, home-screen icon, web manifest) — share_assets.py.
// Runs the real installer against a fixture index in a temp dir: no build needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_BUILD = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build');

function install(dir, site) {
  const code = 'import sys; sys.path.insert(0, sys.argv[1]); import share_assets; share_assets.install(sys.argv[2], sys.argv[3])';
  return execFileSync('python3', ['-c', code, SITE_BUILD, dir, site], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fixture(t, head) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-assets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html><html><head>\n${head}\n</head><body></body></html>`);
  return dir;
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${file} is a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const DESC = '<meta name="description" content="A private learning hub.">';

test('install writes the card, icons and manifest and one share block', (t) => {
  const dir = fixture(t, DESC);
  install(dir, 'ms3');
  assert.deepEqual(pngSize(path.join(dir, 'og-card.png')), [1200, 630]);
  assert.deepEqual(pngSize(path.join(dir, 'apple-touch-icon.png')), [180, 180]);
  assert.deepEqual(pngSize(path.join(dir, 'icon-192.png')), [192, 192]);
  assert.deepEqual(pngSize(path.join(dir, 'icon-512.png')), [512, 512]);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(dir, icon.src)), `${icon.src} shipped`);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal(html.split('<!--share-meta-->').length - 1, 1);
  assert.match(html, /<meta property="og:image" content="https:\/\/une-ms3-psychiatry\.netlify\.app\/og-card\.png">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/);
  assert.ok(html.indexOf(DESC) < html.indexOf('<!--share-meta-->'), 'block follows the description');
});

test('install is idempotent', (t) => {
  const dir = fixture(t, DESC);
  install(dir, 'ms3');
  const once = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  install(dir, 'ms3');
  assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), once);
});

test('the resident install replaces an inherited MS3 block, card and manifest', (t) => {
  const dir = fixture(t, DESC);
  install(dir, 'ms3');
  const ms3Card = fs.readFileSync(path.join(dir, 'og-card.png'));
  install(dir, 'res');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.equal(html.split('<!--share-meta-->').length - 1, 1);
  assert.ok(!html.includes('une-ms3-psychiatry.netlify.app'), 'no MS3 origin survives');
  assert.match(html, /og:image" content="https:\/\/mmc-psychiatry-residents-sanford\.netlify\.app\/og-card\.png"/);
  assert.notDeepEqual(fs.readFileSync(path.join(dir, 'og-card.png')), ms3Card);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'site.webmanifest'), 'utf8'));
  assert.match(manifest.name, /Resident/);
});

test('an index with no description meta fails loudly instead of shipping no card', (t) => {
  const dir = fixture(t, '<title>x</title>');
  assert.throws(() => install(dir, 'ms3'), /expected exactly one <meta name="description">/);
});

test('both builds call the installer for their own site', () => {
  const ms3 = fs.readFileSync(path.join(SITE_BUILD, 'build_deploy.py'), 'utf8');
  const res = fs.readFileSync(path.join(SITE_BUILD, 'resident_section.py'), 'utf8');
  assert.match(ms3, /_share_assets\.install\(OUT,"ms3"\)/);
  assert.match(res, /_share_assets\.install\(OUT,"res"\)/);
});
