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
  {id: 'sp_alcohol_ambivalence_001', name: 'Morgan', voice: 'Marin', doorNeedle: 'addiction-medicine consultation', addedInExtension: true},
  {id: 'family_morgan_maya_001', name: 'Morgan and Maya', voice: 'Marin and Cedar', doorNeedle: 'Maya, their adult daughter', addedInExtension: true},
];
const FAMILY_ID = 'family_morgan_maya_001';

// One reply, two segments, shaped exactly as the NDJSON parser requires.
function ndjson(turn, speakerId) {
  const parts = ['A first sentence.', ' A second sentence.'];
  const audio = Buffer.alloc(150, 7).toString('base64');
  const events = [
    {type: 'reply', reply: parts.join(''), segments: parts.map(text => ({text})), state: `state-${turn}-r`, turn, ...(speakerId ? {speakerId} : {})},
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

async function openPreview(page, {recognition = 'unavailable'} = {}) {
  const violations = [], errors = [];
  page.on('console', message => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });
  page.on('pageerror', error => errors.push(String(error && error.message)));

  let turn = 0;
  let familyTargets = {};
  const requests = [];
  await page.route('**/api/dana-preview', async route => {
    const body = route.request().postDataJSON() || {};
    requests.push(body);
    const at = body.action === 'start' ? (turn = 0) : body.action === 'retry' ? body.turnId : ++turn;
    if (body.action === 'start') familyTargets = {};
    if (body.action === 'turn' && body.caseId === FAMILY_ID) familyTargets[at] = body.targetRoleId;
    const speakerId = body.caseId === FAMILY_ID ? body.action === 'start' ? 'morgan' : body.action === 'retry' ? familyTargets[body.turnId] : body.targetRoleId : undefined;
    await route.fulfill({status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: ndjson(at, speakerId)});
  });
  // Audio never really plays in a headless run; the encounter must still advance.
  await page.addInitScript(({recognition}) => {
    // Capability is deliberate: Chromium advertises recognition even when the
    // headless environment cannot provide a usable microphone service.
    window.__previewRecognition = {instances: [], emit(text, isFinal = true) {
      const current = this.instances.findLast(instance => instance.active);
      if (!current) throw new Error('No active recognition session');
      const result = [{transcript: text}];
      result.isFinal = isFinal;
      current.onresult?.({results: [result]});
    }};
    window.SpeechRecognition = recognition === 'available' ? class {
      constructor() { this.active = false; window.__previewRecognition.instances.push(this); }
      start() { this.active = true; queueMicrotask(() => this.onstart?.()); }
      abort() { this.active = false; }
    } : undefined;
    window.webkitSpeechRecognition = undefined;
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
  }, {recognition});
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  return {violations, errors, requests};
}

async function startEncounter(page, caseId) {
  await page.selectOption('#case-choice', caseId);
  await page.fill('#preview-key', 'a-passcode-for-the-mock-endpoint');
  await page.locator('#start').click();
  await expect(page.locator('#encounter-panel')).toBeVisible();
}

async function askTyped(page, text) {
  await expect(page.locator('#composer')).toBeEditable();
  await page.locator('#composer').fill(text);
  await page.locator('#send').click();
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'ready');
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

    await askTyped(page, 'A question I asked out loud');
    await expect(page.locator('.message.you')).toHaveCount(1);

    await page.locator('[data-station="mark"]').click();
    const note = page.locator('[data-station="bookmarks"] textarea').first();
    await note.fill('A reflection only I should see');
    await expect(note).toHaveValue('A reflection only I should see');
    await page.locator('#end').click();
    await page.locator('#station-presentation').fill('My attending presentation');
    await expect(page.locator('#station-presentation')).toHaveValue('My attending presentation');

    await page.locator('#clear').click();

    const body = await page.locator('body').innerText();
    expect(body, 'the learner question survived Clear').not.toContain('A question I asked out loud');
    expect(body, 'the reflection survived Clear').not.toContain('A reflection only I should see');
    expect(body, 'the presentation survived Clear').not.toContain('My attending presentation');
    await expect(page.locator('#station-root')).toBeEmpty();
    await expect(page.locator('#access-panel')).toBeVisible();
    await expect(page.locator('#preview-key')).toHaveValue('');
    await expect(page.locator('#voice-entry-tip')).toBeHidden();
    await expect(page.locator('#preview-key')).toBeFocused();
    await expect(page.locator('#transcript')).toBeEmpty();
    await expect(page.locator('#composer')).toHaveValue('');
    await expect(page.locator('#typing-panel')).not.toHaveAttribute('open', '');
    await expect(page.locator('#room-layout')).toBeHidden();
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'gate');
    expect(await page.evaluate(() => ({local: localStorage.length, session: sessionStorage.length}))).toEqual({local: 0, session: 0});
  });

  test('mobile entry keeps Start in view and updates the case brief before any request', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    const {requests, errors, violations} = await openPreview(page);
    await expect(page.locator('#start')).toBeInViewport({ratio: 1});
    const selectBox = await page.locator('#case-choice').boundingBox();
    expect(selectBox.height).toBeGreaterThanOrEqual(44);
    for (const patient of CASES) {
      await page.selectOption('#case-choice', patient.id);
      await expect(page.locator('#case-preview-note')).toContainText(patient.doorNeedle);
      for (const other of CASES.filter(item => item.id !== patient.id)) {
        await expect(page.locator('#case-preview-note')).not.toContainText(other.doorNeedle);
      }
    }
    expect(requests, 'reading a case brief must not start a paid encounter').toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(violations).toEqual([]);
  });

  test('mobile keyboard order reaches Patient directly after the skip link', async ({page}) => {
    await page.setViewportSize({width: 320, height: 844});
    await openPreview(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', {name: 'Skip to the encounter'})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#case-choice')).toBeFocused();
    await expect(page.locator('#case-choice')).toBeInViewport({ratio: 1});
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('#preview-key')).toBeFocused();
    await expect(page.locator('#start')).toBeInViewport({ratio: 1});
  });

  test('enabled field boundaries have at least 3 to 1 contrast against adjacent backgrounds', async ({page}) => {
    await openPreview(page);
    async function checkBoundary(selector) {
      const values = await page.locator(selector).evaluate(element => {
        const style = getComputedStyle(element);
        let parent = element.parentElement;
        while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
        return {border: style.borderTopColor, inside: style.backgroundColor, outside: parent ? getComputedStyle(parent).backgroundColor : 'rgb(255, 255, 255)', width: parseFloat(style.borderTopWidth), disabled: element.disabled};
      });
      function luminance(color) {
        const components = color.match(/[\d.]+/g).map(Number);
        expect(components.length === 3 || components[3] === 1, `${selector}: opaque measured color`).toBe(true);
        return components.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      }
      expect(values.disabled).toBe(false);
      expect(values.width).toBeGreaterThan(0);
      for (const background of [values.inside, values.outside]) {
        const levels = [luminance(values.border), luminance(background)].sort((a, b) => b - a);
        expect((levels[0] + 0.05) / (levels[1] + 0.05), `${selector}: visible field boundary`).toBeGreaterThanOrEqual(3);
      }
    }
    await checkBoundary('#case-choice');
    await checkBoundary('#preview-key');
    await startEncounter(page, CASES[0].id);
    await expect(page.locator('#composer')).toBeEditable();
    await checkBoundary('#composer');
  });

  test('chart disclosures preserve keyboard focus and expose their expanded state', async ({page}) => {
    const {requests} = await openPreview(page);
    await startEncounter(page, CASES[0].id);
    const chart = page.locator('[data-station="chart"]');
    await chart.locator('summary').focus();
    await page.keyboard.press('Enter');
    const control = chart.getByRole('button', {name: 'Admission context', exact: true});
    await control.focus();
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    const contentId = await control.getAttribute('aria-controls');
    expect(contentId).toBeTruthy();
    const content = page.locator(`[id="${contentId}"]`);
    await expect(content).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toBeVisible();
    await expect(content).not.toHaveText('');
    const order = await control.evaluate((button, id) => !!(button.compareDocumentPosition(document.getElementById(id)) & Node.DOCUMENT_POSITION_FOLLOWING), contentId);
    expect(order, 'expanded content follows its control in reading order').toBe(true);
    await page.keyboard.press('Enter');
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toBeHidden();
    expect(requests, 'chart disclosure is local and must not ask the actor').toHaveLength(1);
  });

  test('choosing another case after Clear does not leave the previous patient on the entrance', async ({page}) => {
    await openPreview(page);
    await startEncounter(page, CASES[0].id);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'ready');
    await page.locator('#end').click();
    await page.locator('#clear').click();
    await page.selectOption('#case-choice', CASES[1].id);
    await expect(page.locator('#case-preview-note')).toContainText(CASES[1].doorNeedle);
    await expect(page.locator('#door-title')).not.toContainText(CASES[0].name);
    await expect(page).not.toHaveTitle(new RegExp(CASES[0].name));
  });

  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    test(`conversation and controls remain together at ${viewport.width}px`, async ({page}) => {
      await page.setViewportSize(viewport);
      const {errors, violations} = await openPreview(page);
      await startEncounter(page, CASES[0].id);
      await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'ready');
      const geometry = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {conversation: rect('#conversation-panel'), controls: rect('.controls'), room: rect('#encounter-panel'), brief: rect('#station-root'), width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth};
      });
      expect(geometry.controls.top - geometry.conversation.bottom).toBeGreaterThanOrEqual(-1);
      expect(geometry.controls.top - geometry.conversation.bottom).toBeLessThanOrEqual(2);
      expect(geometry.overflow).toBe(false);
      for (const region of [geometry.room, geometry.controls, geometry.brief]) {
        expect(region.left).toBeGreaterThanOrEqual(0);
        expect(region.right).toBeLessThanOrEqual(geometry.width);
      }
      if (viewport.width > 700) expect(geometry.brief.left).toBeGreaterThan(geometry.room.right);
      else expect(geometry.brief.top).toBeGreaterThan(geometry.room.bottom);
      await expect(page.locator('#encounter-title')).toBeFocused();
      expect(errors).toEqual([]);
      expect(violations).toEqual([]);
    });
  }

  test('typing opens automatically when recognition is unavailable', async ({page}) => {
    await openPreview(page);
    await expect(page.locator('#voice-mode')).toBeDisabled();
    await expect(page.locator('#voice-mode')).not.toBeChecked();
    await startEncounter(page, CASES[1].id);
    await expect(page.locator('#typing-panel')).toHaveAttribute('open', '');
    await askTyped(page, 'Help me understand your plans.');
    await expect(page.locator('.message.you')).toHaveText(/Help me understand your plans/);
  });

  test('pausing voice reveals typing and resuming voice retains explicit microphone control', async ({page}) => {
    const {requests} = await openPreview(page, {recognition: 'available'});
    await startEncounter(page, CASES[0].id);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    await expect(page.locator('#typing-panel')).not.toHaveAttribute('open', '');
    await page.locator('#pause').click();
    await expect(page.locator('#typing-panel')).toHaveAttribute('open', '');
    await expect(page.locator('#composer')).toBeEditable();
    expect(await page.evaluate(() => window.__previewRecognition.instances.some(instance => instance.active))).toBe(false);
    await page.locator('#resume').click();
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    expect(await page.evaluate(() => window.__previewRecognition.instances.filter(instance => instance.active).length)).toBe(1);
    await page.locator('#end').click();
    await page.locator('#clear').click();
    expect(await page.evaluate(() => window.__previewRecognition.instances.some(instance => instance.active))).toBe(false);
    await expect(page.locator('#station-root')).toBeEmpty();
    await expect(page.locator('#transcript')).toBeEmpty();
    expect(requests).toHaveLength(1);
  });

  test('speech updates preserve reflection focus and selection, and Space respects text fields', async ({page}) => {
    const {requests} = await openPreview(page, {recognition: 'available'});
    await startEncounter(page, CASES[0].id);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    await page.locator('.speaking-options summary').click();
    await page.locator('#hold-turn').check();
    await page.evaluate(() => window.__previewRecognition.emit('What has been hardest?'));
    await page.locator('#transcript').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.message.you')).toHaveCount(1);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    await page.locator('[data-station="mark"]').click();
    const note = page.locator('[aria-label="Reflection on moment 1"]');
    await note.fill('Ask what made that difficult.');
    await note.evaluate(element => element.setSelectionRange(4, 8));
    await page.evaluate(() => window.__previewRecognition.emit('Could you tell me', false));
    await expect(note).toBeFocused();
    expect(await note.evaluate(element => [element.selectionStart, element.selectionEnd])).toEqual([4, 8]);
    await expect(note).toHaveValue('Ask what made that difficult.');
    await page.evaluate(() => window.__previewRecognition.emit('Could you tell me more?'));
    await page.keyboard.press('Space');
    expect(requests).toHaveLength(2);
    await expect(page.locator('#draft-text')).toHaveText('Could you tell me more?');
    await page.locator('#transcript').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.message.you')).toHaveCount(2);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    expect(requests).toHaveLength(3);
  });

  for (const patient of CASES.filter(item => item.addedInExtension)) {
    test(`${patient.name}: review note stays hidden now that faculty attested this case, and it fits a narrow mobile screen`, async ({page}) => {
      await page.setViewportSize({width: 320, height: 844});
      const {errors, violations} = await openPreview(page);
      await page.selectOption('#case-choice', patient.id);
      await expect(page.locator('#case-review-note')).toBeHidden();
      await expect(page.locator('#start')).toBeInViewport({ratio: 1});
      await startEncounter(page, patient.id);
      await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('#encounter-review-note')).toBeHidden();
      await expect(page.locator('#patient-name')).toHaveText(patient.name);
      if (patient.id === FAMILY_ID) await expect(page.locator('#family-speaker-controls')).toBeVisible();
      else await expect(page.locator('#family-speaker-controls')).toBeHidden();
      await askTyped(page, 'What would make this conversation useful to you?');
      await expect(page.locator('.message.you')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      expect(violations).toEqual([]);
    });
  }

  test('family selector and spoken names route distinct respondents, preserve quotes, and clear together', async ({page}) => {
    const {requests, errors, violations} = await openPreview(page, {recognition: 'available'});
    await startEncounter(page, FAMILY_ID);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    await expect(page.locator('#family-speaker-choice')).toHaveValue('morgan');
    await expect(page.locator('.message.dana .name').last()).toHaveText('Morgan');
    expect(await page.evaluate(() => window.DanaStationContent.getProfile('family_morgan_maya_001').participants.map(({id,voice}) => ({id,voice})))).toEqual([{id: 'morgan', voice: 'Marin'}, {id: 'maya', voice: 'Cedar'}]);
    await page.locator('.speaking-options summary').click();
    await page.locator('#hold-turn').check();

    await page.selectOption('#family-speaker-choice', 'maya');
    await page.evaluate(() => window.__previewRecognition.emit('What support could work for you?'));
    await page.locator('#transcript').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    await expect(page.locator('.message.you .name').last()).toHaveText('You, to Maya');
    await expect(page.locator('.message.dana .name').last()).toHaveText('Maya');
    expect(requests.at(-1).targetRoleId).toBe('maya');
    await page.locator('[data-station="mark"]').click();
    await expect(page.locator('[data-station="bookmarks"] blockquote')).toHaveText('Maya: A first sentence. A second sentence.');
    await page.locator('[aria-label="Reflection on moment 1"]').fill('Ask Maya what support she can sustain.');

    await page.evaluate(() => window.__previewRecognition.emit('Morgan, what matters most to you?'));
    await expect(page.locator('#family-speaker-choice')).toHaveValue('morgan');
    await page.locator('#transcript').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.message.you')).toHaveCount(2);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'listening');
    await expect(page.locator('.message.you .name').last()).toHaveText('You, to Morgan');
    await expect(page.locator('.message.dana .name').last()).toHaveText('Morgan');
    expect(requests.at(-1).targetRoleId).toBe('morgan');
    await expect(page.locator('[data-station="bookmarks"] blockquote')).toHaveText('Maya: A first sentence. A second sentence.');

    await page.locator('#end').click();
    await expect(page.locator('[data-station="retry"] blockquote')).toContainText('You, to Maya:');
    await expect(page.locator('[data-station="retry"] blockquote')).toContainText('Maya: A first sentence.');
    await page.getByRole('textbox', {name: 'Your alternative question', exact: true}).fill('What would a weekly call involve?');
    await page.getByRole('button', {name: 'Ask this moment again', exact: true}).click();
    await expect(page.locator('.message.you')).toHaveCount(3);
    await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'ended');
    await expect(page.locator('.message.dana .name').last()).toHaveText('Maya');
    expect(requests.at(-1).action).toBe('retry');
    expect(requests.at(-1).turnId).toBe(1);

    await page.locator('#clear').click();
    await expect(page.locator('#family-speaker-controls')).toBeHidden();
    await expect(page.locator('#family-speaker-choice')).toHaveValue('morgan');
    await expect(page.locator('#station-root')).toBeEmpty();
    await expect(page.locator('#transcript')).toBeEmpty();
    await expect(page.locator('#preview-key')).toHaveValue('');
    expect(await page.evaluate(() => window.__previewRecognition.instances.some(instance => instance.active))).toBe(false);
    await page.selectOption('#case-choice', CASES[0].id);
    await expect(page.locator('#case-review-note')).toBeHidden();
    await startEncounter(page, CASES[0].id);
    await expect(page.locator('#encounter-review-note')).toBeHidden();
    await expect(page.locator('#family-speaker-controls')).toBeHidden();
    expect(errors).toEqual([]);
    expect(violations).toEqual([]);
  });

  test('new replies follow the bottom but preserve reading position until Latest message', async ({page}) => {
    await openPreview(page);
    await startEncounter(page, CASES[0].id);
    for (let at = 1; at <= 4; at++) await askTyped(page, `Question ${at}: Please tell me more about how things have been for you.`);
    const log = page.locator('#transcript');
    const distance = () => log.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight);
    expect(await distance()).toBeLessThanOrEqual(1);
    expect(await log.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await page.setViewportSize({width: 390, height: 844});
    await expect.poll(distance).toBeLessThanOrEqual(1);
    await log.evaluate(element => { element.scrollTop = 0; });
    await expect(page.locator('#latest-message')).toBeVisible();
    await askTyped(page, 'Question 5: What would you like us to understand?');
    expect(await log.evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.locator('#latest-message')).toBeVisible();
    await page.setViewportSize({width: 1440, height: 1000});
    await expect.poll(() => log.evaluate(element => element.scrollTop)).toBe(0);
    await page.locator('#latest-message').click();
    expect(await distance()).toBeLessThanOrEqual(1);
    await expect(page.locator('#latest-message')).toBeHidden();
    await expect(log).toBeFocused();
    await askTyped(page, 'Question 6: Is there anything else you want to add?');
    expect(await distance()).toBeLessThanOrEqual(1);
  });
});
