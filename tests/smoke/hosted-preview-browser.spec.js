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
  {id: 'sp_alcohol_ambivalence_001', name: 'Morgan', voice: 'Marin', doorNeedle: 'addiction-medicine consultation', draft: true},
  {id: 'family_morgan_maya_001', name: 'Morgan and Maya', voice: 'Marin and Cedar', doorNeedle: 'Maya, their adult daughter', draft: true},
];
const FAMILY_ID = 'family_morgan_maya_001';

// One reply, two segments, shaped exactly as the NDJSON parser requires.
function ndjson(turn, speakerId, familyBid = false) {
  const bid = familyBid ? {speakerId: speakerId === 'morgan' ? 'maya' : 'morgan', text: 'Could I add something?'} : null;
  const parts = bid ? ['A first sentence. A second sentence.', ' ' + bid.text] : ['A first sentence.', ' A second sentence.'];
  const audio = Buffer.alloc(150, 7).toString('base64');
  const events = [
    {type: 'reply', reply: parts.join(''), segments: parts.map(text => ({text})), state: `state-${turn}-r`, turn, ...(speakerId ? {speakerId} : {}), ...(bid ? {familyBid: bid} : {})},
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

async function openPreview(page, {recognition = 'unavailable', manualAudio = false, momentsEnabled = false, capabilityResponse, capabilityStatus = 200, holdCapabilities = false, familyBidTurn = null, stubCueAudio = false} = {}) {
  const violations = [], errors = [];
  page.on('console', message => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });
  page.on('pageerror', error => errors.push(String(error && error.message)));

  let turn = 0;
  let familyTargets = {};
  let capabilityRoute;
  const requests = [], capabilityRequests = [];
  const fulfillCapabilities = route => route.fulfill({status: capabilityStatus, contentType: 'application/json', body: JSON.stringify(capabilityResponse === undefined ? {momentsEnabled} : capabilityResponse)});
  await page.route('**/api/preview-capabilities', async route => {
    capabilityRoute = route;capabilityRequests.push(route.request().method());
    if (!holdCapabilities) await fulfillCapabilities(route);
  });
  await page.route('**/api/dana-preview', async route => {
    const body = route.request().postDataJSON() || {};
    requests.push(body);
    const at = body.action === 'start' ? (turn = 0) : body.action === 'retry' ? body.turnId : ++turn;
    if (body.action === 'start') familyTargets = {};
    if (body.action === 'turn' && body.caseId === FAMILY_ID) familyTargets[at] = body.targetRoleId;
    const speakerId = body.caseId === FAMILY_ID ? body.action === 'start' ? 'morgan' : body.action === 'retry' ? familyTargets[body.turnId] : body.targetRoleId : undefined;
    await route.fulfill({status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: ndjson(at, speakerId, speakerId && body.action === 'turn' && at === familyBidTurn)});
  });
  // Audio never really plays in a headless run; the encounter must still advance.
  await page.addInitScript(({recognition, manualAudio, stubCueAudio}) => {
    // Capability is deliberate: Chromium advertises recognition even when the
    // headless environment cannot provide a usable microphone service.
    window.__previewRecognition = {instances: [], emit(text, isFinal = true) {
      const current = this.instances.findLast(instance => instance.active);
      if (!current) throw new Error('No active recognition session');
      const result = [{transcript: text}];
      result.isFinal = isFinal;
      current.results ||= [];current.cursor ||= 0;current.results[current.cursor]=result;
      if(isFinal)current.cursor++;current.onresult?.({results: current.results});
    }};
    window.SpeechRecognition = recognition === 'available' ? class {
      constructor() { this.active = false; window.__previewRecognition.instances.push(this); }
      start() { this.active = true; queueMicrotask(() => this.onstart?.()); }
      abort() { this.active = false; }
    } : undefined;
    window.webkitSpeechRecognition = undefined;
    window.__previewAudio=[];
    window.__previewCueAudio=[];
    if(stubCueAudio){
      window.AudioContext=class{
        constructor(){this.currentTime=0;this.closed=0;this.destination={};window.__previewCueAudio.push(this);}
        createOscillator(){return {frequency:{value:0},connect(){},start(){},stop(){}};}
        createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
        close(){this.closed++;return Promise.resolve();}
      };
      window.webkitAudioContext=undefined;
    }
    window.Audio = function () {
      const listeners = {};
      const audio = {
        muted: true, playbackRate: 1,
        addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
        pauses:0,plays:0,
        removeEventListener() {}, pause() {audio.pauses++;}, removeAttribute() {}, load() {},
        play() { audio.plays++;if(!manualAudio)setTimeout(() => { if (audio.onended) audio.onended(); (listeners.ended || []).forEach(fn => fn()); }, 0); return Promise.resolve(); },
      };
      window.__previewAudio.push(audio);
      return audio;
    };
  }, {recognition, manualAudio, stubCueAudio});
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  return {violations, errors, requests, capabilityRequests, releaseCapabilities:async()=>{await expect.poll(()=>!!capabilityRoute).toBe(true);await fulfillCapabilities(capabilityRoute);}};
}

async function finishAudio(page,index){
  await expect.poll(()=>page.evaluate(index=>window.__previewAudio[index]?.plays,index)).toBe(1);
  await page.evaluate(index=>window.__previewAudio[index].onended?.(),index);
}

async function completeReply(page,startIndex,phase='listening'){
  await finishAudio(page,startIndex);await finishAudio(page,startIndex+1);
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase',phase);
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

for(const width of [1440,360])test(`spoken interruption and faculty controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const {violations,errors,requests}=await openPreview(page,{recognition:'available',manualAudio:true});
  await expect(page.locator('#spoken-interrupt-entry')).not.toBeChecked();
  await page.locator('#faculty-voice-options summary').click();await page.selectOption('#delivery-intensity','expressive');
  await page.locator('#spoken-interrupt-entry').check();
  await page.screenshot({path:`/tmp/sp-voice-entry-${width}.png`,fullPage:true});
  await startEncounter(page,'sp_mania_redirect_001');await expect(page.locator('#status')).toContainText('microphone available');
  expect(requests[0].deliveryIntensity).toBe('expressive');
  await page.evaluate(()=>window.__previewRecognition.emit('A first sentence.'));
  await expect(page.locator('#spoken-draft')).toBeHidden();await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','speaking');
  await page.evaluate(()=>window.__previewRecognition.emit('Let us focus on sleep',false));
  await expect(page.locator('#interim-text')).toHaveText('Let us focus on sleep');
  await expect.poll(()=>page.evaluate(()=>window.__previewAudio[0].pauses)).toBe(1);
  await page.evaluate(()=>window.__previewRecognition.emit('Let us focus on sleep'));
  await expect(page.locator('#draft-text')).toHaveText('Let us focus on sleep');
  await page.screenshot({path:`/tmp/sp-voice-interruption-${width}.png`,fullPage:true});
  await expect.poll(()=>requests.length,{timeout:8000}).toBe(2);
  expect(requests[1].text).toBe('Let us focus on sleep');expect(requests[1].previousCompletedSegments).toBe(0);
  expect(requests[1].previousPlayback).toBe('interrupted');expect(requests[1].deliveryIntensity).toBeUndefined();
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','speaking');
  await page.keyboard.press('Escape');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');
  expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(violations).toEqual([]);expect(errors).toEqual([]);
});

test('moment format hides full-encounter experimental settings',async({page})=>{
  await openPreview(page,{recognition:'available',momentsEnabled:true});await page.selectOption('#experience-choice','moment');
  await expect(page.locator('#voice-experiment-options')).toBeHidden();await expect(page.locator('#faculty-voice-options')).toBeHidden();
});

test('capability discovery offers no moments until the runtime explicitly enables them',async({page})=>{
  const {requests,capabilityRequests,releaseCapabilities,errors,violations}=await openPreview(page,{momentsEnabled:true,holdCapabilities:true});
  const option=page.locator('#experience-choice option[value="moment"]');
  await expect(option).toHaveJSProperty('hidden',true);await expect(option).toBeDisabled();
  await expect(page.locator('#case-choice option')).toHaveCount(5);expect(requests).toHaveLength(0);
  await releaseCapabilities();await expect(option).not.toBeDisabled();await expect(option).toHaveJSProperty('hidden',false);
  await page.selectOption('#experience-choice','moment');await expect(page.locator('#case-choice option')).toHaveCount(3);
  expect(capabilityRequests).toEqual(['GET']);expect(requests).toHaveLength(0);expect(errors).toEqual([]);expect(violations).toEqual([]);
});

for(const capability of [
  {label:'production flag off',capabilityResponse:{momentsEnabled:false}},
  {label:'unavailable discovery',capabilityStatus:503,capabilityResponse:{momentsEnabled:false}},
  {label:'malformed discovery',capabilityResponse:{momentsEnabled:'true'}},
])test(`capability ${capability.label} keeps the working full encounters available`,async({page})=>{
  const {requests,capabilityRequests,errors,violations}=await openPreview(page,capability);
  await expect.poll(()=>capabilityRequests.length).toBe(1);
  await expect(page.locator('#experience-choice option[value="moment"]')).toBeDisabled();
  await expect(page.locator('#experience-choice option[value="moment"]')).toHaveJSProperty('hidden',true);
  await page.evaluate(()=>{const format=document.getElementById('experience-choice');format.value='moment';format.dispatchEvent(new Event('change'));});
  await expect(page.locator('#experience-choice')).toHaveValue('full');await expect(page.locator('#case-choice option')).toHaveCount(5);
  await startEncounter(page,CASES[0].id);await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','ready');
  expect(requests).toHaveLength(1);expect(requests[0].caseId).toBe(CASES[0].id);expect(errors).toEqual([]);expect(violations).toEqual([]);
});

test('a family spoken bid owns its audio and quotation, ignores its echo, and accepts a spoken invitation',async({page})=>{
  const {requests,errors,violations}=await openPreview(page,{recognition:'available',manualAudio:true,familyBidTurn:2});
  await page.locator('#spoken-interrupt-entry').check();await startEncounter(page,FAMILY_ID);await completeReply(page,0);
  for(let turn=1;turn<=2;turn++){
    await page.evaluate(text=>window.__previewRecognition.emit(text),'What support would feel useful '+turn+'?');
    await page.locator('#status').click();await page.keyboard.press('Space');
    await expect(page.locator('#status')).toContainText('Morgan is speaking');
    if(turn===1)await completeReply(page,2);
  }
  await expect(page.locator('#family-bid-offer')).toBeHidden();await finishAudio(page,4);
  await expect(page.locator('#status')).toContainText('Maya is speaking');
  await expect(page.locator('.family-bid .name')).toHaveText('Maya');
  await expect(page.locator('.message.dana:not(.family-bid)').last()).not.toContainText('Could I add something?');
  await page.evaluate(()=>window.__previewRecognition.emit('Could I add something?'));
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','speaking');
  expect(await page.evaluate(()=>window.__previewAudio[5].pauses)).toBe(0);
  await finishAudio(page,5);await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
  await expect(page.locator('#family-bid-name')).toHaveText('Maya asked to add something.');
  await expect(page.locator('.family-bid .delivery')).toHaveText('Voice completed');
  await page.locator('[data-station="mark"]').click();
  await expect(page.locator('[data-station="bookmarks"] blockquote')).toHaveText([
    'Morgan: A first sentence. A second sentence.',
    'Maya: Could I add something?',
  ]);
  await page.evaluate(()=>window.__previewRecognition.emit('Go ahead'));await page.locator('#status').click();await page.keyboard.press('Space');
  await expect.poll(()=>requests.length).toBe(4);expect(requests[3].targetRoleId).toBe('maya');expect(requests[3].previousCompletedSegments).toBe(2);
  await expect(page.locator('#family-bid-offer')).toBeHidden();await completeReply(page,6);await page.click('#end');
  expect(errors).toEqual([]);expect(violations).toEqual([]);
});

for(const decision of ['invite','defer'])test(`family bid ${decision} keeps the learner draft and waits for their next turn`,async({page})=>{
  const {requests,errors,violations}=await openPreview(page,{familyBidTurn:1});await startEncounter(page,FAMILY_ID);
  await askTyped(page,'What support would feel useful?');await expect(page.locator('#family-bid-offer')).toBeVisible();
  await page.fill('#composer','Tell me what matters to you.');await page.click('#family-bid-'+decision);
  await expect(page.locator('#family-bid-offer')).toBeHidden();await expect(page.locator('#composer')).toHaveValue('Tell me what matters to you.');
  await expect(page.locator('#family-speaker-choice')).toHaveValue(decision==='invite'?'maya':'morgan');expect(requests).toHaveLength(2);
  await page.click('#send');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','ready');
  expect(requests[2].targetRoleId).toBe(decision==='invite'?'maya':'morgan');expect(requests[2].text).toBe('Tell me what matters to you.');
  expect(errors).toEqual([]);expect(violations).toEqual([]);
});

test('an interrupted family bid is not offered or quoted as heard',async({page})=>{
  const {requests,errors,violations}=await openPreview(page,{manualAudio:true,familyBidTurn:1});await startEncounter(page,FAMILY_ID);await completeReply(page,0,'ready');
  await page.fill('#composer','What support would feel useful?');await page.click('#send');await finishAudio(page,2);
  await expect(page.locator('#status')).toContainText('Maya is speaking');await page.keyboard.press('Escape');
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');await expect(page.locator('#family-bid-offer')).toBeHidden();
  await expect(page.locator('.family-bid .delivery')).toContainText('not remembered as heard');
  await page.locator('[data-station="mark"]').click();
  await expect(page.locator('[data-station="bookmarks"] blockquote')).toHaveText(['Morgan: A first sentence. A second sentence.', '']);
  await expect(page.locator('[data-station="bookmarks"] blockquote').nth(1)).toBeHidden();
  expect(requests).toHaveLength(2);expect(errors).toEqual([]);expect(violations).toEqual([]);
});

test('faculty cue at rest preserves a spoken draft and is included once at320px',async({page})=>{
  await page.setViewportSize({width:320,height:844});const {requests,errors,violations}=await openPreview(page,{recognition:'available',stubCueAudio:true});
  await startEncounter(page,CASES[1].id);await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
  await page.evaluate(()=>window.__previewRecognition.emit('Let us return to sleep.'));
  await page.locator('#faculty-room-controls summary').click();await page.click('#cue-knock');
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');await expect(page.locator('#draft-text')).toHaveText('Let us return to sleep.');
  await expect(page.locator('#room-cue-notice')).toContainText('A brief knock at the closed door. No one enters.');
  await expect(page.locator('#cue-knock')).toBeDisabled();await expect(page.locator('#cue-chime')).toBeDisabled();
  expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);expect(requests).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.click('#send');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
  expect(requests[1].text).toBe('Let us return to sleep.');expect(requests[1].roomCueId).toBe('door_knock');
  await page.fill('#composer','Tell me more about that.');await page.click('#send');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
  expect(requests[2].roomCueId).toBeUndefined();await page.click('#end');expect(errors).toEqual([]);expect(violations).toEqual([]);
});

test('faculty cue during patient audio cancels queued speech and End stops its sound',async({page})=>{
  const {requests,errors,violations}=await openPreview(page,{recognition:'available',manualAudio:true,stubCueAudio:true});
  await page.locator('#spoken-interrupt-entry').check();await startEncounter(page,CASES[1].id);await expect(page.locator('#status')).toContainText('Marcus is speaking');
  await page.locator('#faculty-room-controls summary').click();await page.click('#cue-chime');
  await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');
  expect(await page.evaluate(()=>window.__previewAudio[0].pauses)).toBe(1);expect(await page.evaluate(()=>window.__previewAudio[1].plays)).toBe(0);
  expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);
  await expect(page.locator('#room-cue-notice')).toContainText('A short chime sounds in the hallway and stops.');
  await page.click('#end');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','ended');
  expect(await page.evaluate(()=>window.__previewCueAudio[0].closed)).toBe(1);expect(requests).toHaveLength(1);
  await page.click('#clear');await expect(page.locator('#room-cue-notice')).toBeHidden();expect(errors).toEqual([]);expect(violations).toEqual([]);
});

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

  test('mobile keyboard order reaches format then patient after the skip link', async ({page}) => {
    await page.setViewportSize({width: 320, height: 844});
    await openPreview(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', {name: 'Skip to the encounter'})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#experience-choice')).toBeFocused();
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

  for (const patient of CASES.filter(item => item.draft)) {
    test(`${patient.name}: draft review status and the new case fit a narrow mobile screen`, async ({page}) => {
      await page.setViewportSize({width: 320, height: 844});
      const {errors, violations} = await openPreview(page);
      await page.selectOption('#case-choice', patient.id);
      await expect(page.locator('#case-review-note')).toBeVisible();
      await expect(page.locator('#case-review-note')).toContainText('Faculty-review draft');
      await expect(page.locator('#start')).toBeInViewport({ratio: 1});
      await startEncounter(page, patient.id);
      await expect(page.locator('#preview-root')).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('#encounter-review-note')).toBeVisible();
      await expect(page.locator('#encounter-review-note')).toContainText('Faculty-review draft');
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

const MOMENTS=['moment_elena_rupture_001','moment_priya_formulation_001','moment_luis_teachback_001'];
async function openMoment(page,index=0,recognition='unavailable'){
 const result=await openPreview(page,{recognition,momentsEnabled:true});let turn=0;
 await page.route('**/api/practice-moment',async route=>{
  const b=route.request().postDataJSON();result.requests.push(b);
  const events=[{type:'review-start',state:'closed'},{type:'review-unavailable',code:'preview_review_unavailable'},{type:'review-complete',state:'closed'}];
  await route.fulfill({status:200,contentType:'application/x-ndjson',body:b.action==='debrief'?events.map(e=>JSON.stringify(e)+'\n').join(''):ndjson(b.action==='start'?(turn=0):b.action==='retry'?b.turnId:++turn)});
 });
 await page.selectOption('#experience-choice','moment');await page.selectOption('#case-choice',MOMENTS[index]);await page.fill('#preview-key','mock-preview-passcode');await page.click('#start');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase',recognition==='available'?'listening':'ready');return result;
}
for(const [index,id] of MOMENTS.entries())test(`${id}: four responses, fallback, alternative and fresh transfer`,async({page})=>{
 const {requests,errors,violations}=await openMoment(page,index);await expect(page.locator('[data-moment="draft-label"]')).toHaveText('Faculty-review draft');
 for(let i=0;i<4;i++){await page.fill('#composer','What matters to you?');await page.click('#send');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase',i===3?'ended':'ready');}
 await expect(page.locator('#turn-count')).toHaveText('4 of 4 responses');await page.locator('[data-moment="review"]').click();await expect(page.locator('[data-moment="review-fallback"]')).toBeVisible();expect(requests.filter(r=>r.action==='debrief')).toHaveLength(1);
 await page.locator('#moment-alternative-text').fill('Let me check what you mean.');await page.locator('[data-moment="submit-alternative"]').click();await expect(page.locator('[data-moment="alternative-result"]')).toBeVisible();await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','ended');expect(requests.filter(r=>r.action==='retry')).toHaveLength(1);
 await page.locator('[data-moment="transfer"]').click();await expect(page.locator('#entrance')).toBeVisible();expect(requests.filter(r=>r.action==='start')).toHaveLength(1);await expect(page.locator('#transcript')).toHaveText('');expect(errors).toEqual([]);expect(violations).toEqual([]);
});
test('moment private reflection focus and explicitly submitted spoken team formulation',async({page})=>{
 const {requests,errors,violations}=await openMoment(page,1,'available');await page.locator('[data-moment="reflect-open"]').click();await expect(page.locator('#moment-private-notes')).toBeFocused();await page.fill('#moment-private-notes','PRIVATE_REFLECTION_CANARY');await page.keyboard.press('Space');await page.keyboard.press('Escape');await expect(page.locator('[data-moment="reflect-open"]')).toBeFocused();expect(requests).toHaveLength(1);
 await page.fill('#composer','I want to check your concern.');await page.click('#send');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');await page.click('#end');await page.locator('[data-moment="record-summary"]').click();await page.evaluate(()=>window.__previewRecognition.emit('SUMMARY_CANARY wants help.'));await expect(page.locator('[data-moment="summary-capture"]')).toContainText('SUMMARY_CANARY');await page.locator('#status').click();await page.keyboard.press('Space');await expect(page.locator('#moment-team-formulation')).toHaveValue('SUMMARY_CANARY wants help.');expect(JSON.stringify(requests)).not.toContain('SUMMARY_CANARY');
 await page.locator('[data-moment="review"]').click();await expect(page.locator('[data-moment="review-fallback"]')).toBeVisible();expect(requests.at(-1).outputs.teamFormulation).toBe('SUMMARY_CANARY wants help.');expect(JSON.stringify(requests)).not.toContain('PRIVATE_REFLECTION_CANARY');await page.click('#clear');await expect(page.locator('#station-root')).toBeEmpty();expect(await page.evaluate(()=>[localStorage.length,sessionStorage.length])).toEqual([0,0]);expect(errors).toEqual([]);expect(violations).toEqual([]);
});
for(const target of ['team_formulation','alternative'])test(`moment ${target} recording resumes after Pause and visibility loss`,async({page})=>{
 const {requests,errors,violations}=await openMoment(page,1,'available');
 await page.evaluate(()=>window.__previewRecognition.emit('I want to understand.'));
 await page.locator('#status').click();await page.keyboard.press('Space');
 await expect(page.locator('.message.you')).toHaveCount(1);await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');await page.click('#end');
 if(target==='alternative'){
  await page.locator('[data-moment="review"]').click();await expect(page.locator('[data-moment="review-fallback"]')).toBeVisible();
 }
 await page.locator(`[data-moment="${target==='team_formulation'?'record-summary':'record-alternative'}"]`).click();
 await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
 const before=requests.length;
 await page.click('#pause');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');
 await expect(page.locator('#resume')).toBeVisible();await expect(page.locator('#status')).toContainText('Microphone paused');
 expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);
 await page.click('#resume');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
 await page.evaluate(()=>{
  window.__previewRecognition.emit('Keep these words.');
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');
 await expect(page.locator('#draft-text')).toHaveText('Keep these words.');
 await page.click('#resume');expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');expect(requests).toHaveLength(before);
 await page.click('#resume');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
 await page.locator('[data-moment="reflect-open"]').click();await page.keyboard.press('Escape');
 await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','paused');await expect(page.locator('#draft-text')).toHaveText('Keep these words.');
 expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);
 await page.click('#resume');await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','listening');
 await page.evaluate(()=>window.__previewRecognition.emit('And these too.'));
 await page.locator('#status').click();await page.keyboard.press('Space');
 await expect(page.locator('#preview-root')).toHaveAttribute('data-phase','ended');
 if(target==='team_formulation'){
  await expect(page.locator('#moment-team-formulation')).toHaveValue('Keep these words. And these too.');expect(requests).toHaveLength(before);
 }else{
  expect(requests.at(-1).action).toBe('retry');expect(requests.at(-1).text).toBe('Keep these words. And these too.');expect(requests).toHaveLength(before+1);
 }
 await expect(page.locator('#resume')).toBeHidden();expect(await page.evaluate(()=>window.__previewRecognition.instances.some(r=>r.active))).toBe(false);
 await page.click('#clear');await expect(page.locator('#station-root')).toBeEmpty();expect(errors).toEqual([]);expect(violations).toEqual([]);
});
test('moment 320px layout and zero-turn static ending',async({page})=>{
 await page.setViewportSize({width:320,height:740});const {requests,errors,violations}=await openMoment(page,2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.click('#end');await expect(page.locator('[data-moment="zero-turn"]')).toBeVisible();await expect(page.locator('[data-moment="review"]')).toBeHidden();expect(requests).toHaveLength(1);expect(errors).toEqual([]);expect(violations).toEqual([]);
});

test('moment review renders cited original context with a separate uncertainty',async({page})=>{
 const {errors,violations}=await openMoment(page);await askTyped(page,'Hello Elena.');await page.click('#end');
 await page.route('**/api/practice-moment',async route=>{
  const b=route.request().postDataJSON(),report={schemaVersion:1,scenarioId:b.scenarioId,findings:[{criterionId:'E_PATIENT_FOCUS',status:'observed',observationId:'attention_returned',evidence:[{sourceId:'l1',start:0,end:12,quote:'Hello Elena.'}],uncertaintyId:'trust_unknown',nextAttemptId:'return_attention',observationText:'Your next move returned attention to what Elena wanted understood.',uncertaintyText:'This exchange does not establish whether trust was restored.',nextAttemptText:"After acknowledging the mismatch, return attention to the patient's concern."}]};
  await route.fulfill({status:200,contentType:'application/x-ndjson',body:[{type:'review-start',state:'closed'},{type:'review',report},{type:'review-complete',state:'closed'}].map(e=>JSON.stringify(e)+'\n').join('')});
 });
 await page.locator('[data-moment="review"]').click();await expect(page.locator('[data-moment="report"]')).toContainText('This exchange does not establish whether trust was restored.');await page.locator('[data-moment="quote-context"] > summary').click();await expect(page.locator('[data-moment="quote-context"] p')).toHaveText('Hello Elena.');expect(errors).toEqual([]);expect(violations).toEqual([]);
 await expect(page.locator('#station-root')).toHaveCSS('display','grid');expect((await page.locator('#station-root').boundingBox()).width).toBeGreaterThan(900);
 await page.screenshot({path:path.join(ROOT,'output/practice-moment/review-desktop.png'),fullPage:true});
 await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:path.join(ROOT,'output/practice-moment/review-mobile.png'),fullPage:true});
});
