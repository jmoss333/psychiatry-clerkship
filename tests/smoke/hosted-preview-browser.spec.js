// The hosted faculty preview, rendered in a real browser under the REAL response
// headers it ships with.
//
// This suite exists because the preview's own node tests drive a DOM stub, and a
// stub cannot observe a Content-Security-Policy violation, a computed style, or
// what is still on the page after Clear. Three defects reached the deployed preview
// through that gap: station styling blocked by style-src 'self' (R8), Clear leaving
// marked dialogue and learner notes rendered (R4), and a hard-coded gendered heading
// that was wrong for two of the three patients.
//
// No paid call is made: /api/dana-preview is fully mocked and audio is stubbed.
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW = path.join(ROOT, 'sp-preview');
const DIST = path.join(PREVIEW, 'dist');
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8'};

// Read the headers the preview actually deploys, so this suite cannot drift from
// the policy in netlify.toml. If someone loosens the CSP, these tests loosen with
// it — and sp-preview/tests/build.test.mjs is what pins the CSP itself.
function deployedHeaders() {
  const toml = readFileSync(path.join(PREVIEW, 'netlify.toml'), 'utf8');
  const block = toml.slice(toml.indexOf('[headers.values]'));
  const headers = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/);
    if (match) headers[match[1]] = match[2];
  }
  return headers;
}

const CASES = [
  {id: 'sp_depression_gated_si_001', name: 'Dana',   voice: 'Marin', doorNeedle: 'admitted voluntarily to adult inpatient psychiatry'},
  {id: 'sp_mania_redirect_001',      name: 'Marcus', voice: 'Cedar', doorNeedle: 'quad irrigation system'},
  {id: 'sp_psychosis_paranoid_001',  name: 'Ray',    voice: 'Cedar', doorNeedle: 'covering vents'},
];

// One reply, two segments, shaped exactly as the NDJSON parser requires.
function ndjson(turn) {
  const parts = ['A first sentence.', ' A second sentence.'];
  const audio = Buffer.alloc(150, 7).toString('base64');
  const events = [
    {type: 'reply', reply: parts.join(''), segments: parts.map(text => ({text})), state: `state-${turn}-r`, turn},
    ...parts.map((_, index) => ({type: 'audio', index, data: audio, state: `state-${turn}-a${index}`})),
    {type: 'complete', state: `state-${turn}-c`},
  ];
  return events.map(event => JSON.stringify(event)).join('\n') + '\n';
}

let server, base;

test.beforeAll(async () => {
  // build.mjs imports only node: modules, so this needs no install.
  execFileSync(process.execPath, [path.join(PREVIEW, 'build.mjs')], {cwd: PREVIEW, stdio: 'pipe'});
  if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('preview dist was not built');
  const headers = deployedHeaders();
  server = createServer((req, res) => {
    const name = (req.url || '/').split('?')[0];
    const file = path.join(DIST, name === '/' ? 'index.html' : name.replace(/^\/+/, ''));
    if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404, headers); res.end('not found'); return; }
    res.writeHead(200, {...headers, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

async function openPreview(page) {
  const violations = [], errors = [];
  page.on('console', message => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });
  page.on('pageerror', error => errors.push(String(error && error.message)));

  let turn = 0;
  await page.route('**/api/dana-preview', async route => {
    const body = route.request().postDataJSON() || {};
    const at = body.action === 'start' ? 0 : body.action === 'retry' ? body.turnId : ++turn;
    await route.fulfill({status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: ndjson(at)});
  });
  // Audio never really plays in a headless run; the encounter must still advance.
  await page.addInitScript(() => {
    window.Audio = function () {
      const listeners = {};
      const audio = {
        muted: true, playbackRate: 1,
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        removeEventListener() {}, pause() {}, removeAttribute() {}, load() {},
        play() { setTimeout(() => { if (audio.onended) audio.onended(); (listeners.ended || []).forEach(fn => fn()); }, 0); return Promise.resolve(); },
      };
      return audio;
    };
  });
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  return {violations, errors};
}

async function startEncounter(page, caseId) {
  await page.selectOption('#case-choice', caseId);
  await page.fill('#preview-key', 'a-passcode-for-the-mock-endpoint');
  await page.locator('#start').click();
  await expect(page.locator('#encounter-panel')).toBeVisible();
}

test.describe('hosted preview in a real browser under its deployed headers', () => {
  for (const patient of CASES) {
    test(`${patient.name}: the page names the patient it is talking to, and no other`, async ({page}) => {
      const {violations, errors} = await openPreview(page);
      await startEncounter(page, patient.id);

      await expect(page.locator('#patient-name')).toHaveText(patient.name);
      await expect(page.locator('#voice-tag')).toContainText(patient.voice);
      await expect(page.locator('#door-title')).toContainText(patient.name);
      await expect(page).toHaveTitle(new RegExp(patient.name));

      const body = await page.locator('body').innerText();
      expect(body).toContain(patient.doorNeedle);
      for (const other of CASES.filter(item => item.id !== patient.id)) {
        expect(body, `${patient.name} leaked ${other.name}'s door note`).not.toContain(other.doorNeedle);
      }
      // Dana is she/her; Marcus and Ray are he/him. Shared chrome must assume neither.
      expect(body, 'shared chrome assumed a pronoun').not.toMatch(/Begin with (her|his) story/i);

      expect(violations, 'CSP violations').toEqual([]);
      expect(errors, 'page errors').toEqual([]);
    });
  }

  test('station styling survives style-src self — the grid is a grid', async ({page}) => {
    const {violations} = await openPreview(page);
    await startEncounter(page, 'sp_depression_gated_si_001');
    const grid = page.locator('.sp-station .station-grid').first();
    await expect(grid).toBeAttached();
    // The R8 signature: with the rules blocked, this computed to `block`.
    await expect(grid).toHaveCSS('display', 'grid');
    expect(violations, 'the station must not need an inline style element').toEqual([]);
  });

  test('Clear removes the station copy from the page, not just the transcript', async ({page}) => {
    await openPreview(page);
    await startEncounter(page, 'sp_depression_gated_si_001');

    await page.locator('#composer').fill('A question I asked out loud');
    await page.locator('#send').click();
    await expect(page.locator('.message.you')).toHaveCount(1);

    await page.locator('[data-station="mark"]').click();
    const note = page.locator('[data-station="bookmarks"] textarea').first();
    await note.fill('A reflection only I should see');
    await page.locator('#end').click();
    await page.locator('#station-presentation').fill('My attending presentation');

    await page.locator('#clear').click();

    const body = await page.locator('body').innerText();
    expect(body, 'the learner question survived Clear').not.toContain('A question I asked out loud');
    expect(body, 'the reflection survived Clear').not.toContain('A reflection only I should see');
    expect(body, 'the presentation survived Clear').not.toContain('My attending presentation');
    await expect(page.locator('#station-root')).toBeEmpty();
    await expect(page.locator('#access-panel')).toBeVisible();
    await expect(page.locator('#preview-key')).toHaveValue('');
  });
});
