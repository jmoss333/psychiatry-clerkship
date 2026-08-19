import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js', import.meta.url);
const source = readFileSync(SOURCE, 'utf8');

// eslint-disable-next-line no-new-func
const F = new Function(`${source}\nreturn {
  card:typeof fdEditionCardMarkup==='function'?fdEditionCardMarkup:null,
  core:typeof fdEditionCoreMetaMarkup==='function'?fdEditionCoreMetaMarkup:null,
  orientation:typeof fdEditionLocalOrientationMarkup==='function'?fdEditionLocalOrientationMarkup:null,
  resources:typeof fdEditionWeekResourcesMarkup==='function'?fdEditionWeekResourcesMarkup:null,
  domain:typeof fdEditionExternalDomain==='function'?fdEditionExternalDomain:null
};`)();

const CURRENT_REVISION = '1234567890abcdef1234567890abcdef12345678';
const ORIGINAL_REVISION = 'abcdef1234567890abcdef1234567890abcdef12';
const FINGERPRINT = 'BHU2-MS3-4F7C2Q';

function edition(overrides = {}) {
  const base = {
    fingerprint: FINGERPRINT,
    editionNumber: 7,
    createdAgainstCoreRevision: ORIGINAL_REVISION,
    envelope: { config: { audience: 'ms3', pathId: 'ms3-six-week' } },
    card: {
      title: 'Adult inpatient handoff', locationName: 'Example Teaching Unit', locationCode: 'BHU2',
      curatorName: 'Jordan Example', curatorRole: 'Attending psychiatrist',
      rotationStart: '2026-09-01', rotationEnd: '2026-10-12', lastVerified: '2026-08-19',
    },
    changeNote: 'Clarified the first-day sequence.',
    localOrientation: {
      firstDayArrival: 'Meet at the teaching room.',
      dailySchedule: 'Morning team handoff, then rounds.', roundsWorkflow: '',
      presentationExpectations: '', documentationExpectations: '', attendanceExpectations: '',
      feedbackProcess: '', accessPreparation: 'Complete the required training before arrival.',
      contacts: [{ role: 'Education office', directoryUrl: 'https://directory.example.edu/education' }],
      checklist: [{ id: 'local:check:1', label: 'Review the local orientation', priority: 'required' }],
      resources: [{
        id: 'local:resource:1', title: 'Local orientation guide',
        url: 'https://policy.example.edu/orientation?audience=learner&view=week1',
        priority: 'recommended', week: 1, rationale: 'Read before the first team handoff.',
      }],
    },
  };
  return Object.assign(base, overrides);
}

test('the compact native details card keeps the full identity summary outside expanded metadata', () => {
  assert.equal(typeof F.card, 'function');
  const html = F.card(edition(), CURRENT_REVISION);
  const summaryEnd = html.indexOf('</summary>');
  assert.match(html, /^<details class="fd-edition-card">/);
  assert.doesNotMatch(html, /^<details[^>]* open/);
  assert.ok(summaryEnd > 0);
  const summary = html.slice(0, summaryEnd);
  const expanded = html.slice(summaryEnd);
  for (const value of ['Example Teaching Unit', 'Edition 7', FINGERPRINT, 'Locally curated']) {
    assert.match(summary, new RegExp(value));
  }
  for (const value of [
    'Jordan Example', 'Attending psychiatrist', 'MS3', '6 weeks', '2026-09-01', '2026-10-12',
    '2026-08-19', CURRENT_REVISION, ORIGINAL_REVISION, 'Clarified the first-day sequence.',
    'Identity not digitally verified', 'configuration equality only',
  ]) assert.match(expanded, new RegExp(value));
  assert.equal((html.match(new RegExp(FINGERPRINT, 'g')) || []).length, 1,
    'the full fingerprint belongs on the quiet summary tab, not a shortened duplicate');
});

test('card, core metadata, local orientation, checklist, links, and attributes re-escape hostile values', () => {
  const hostile = '<img src=x onerror="alert(1)"> & "quoted" \'single\'';
  const risky = edition({
    fingerprint: FINGERPRINT,
    card: Object.assign({}, edition().card, {
      title: hostile, locationName: hostile, curatorName: hostile, curatorRole: hostile,
    }),
    changeNote: hostile,
    localOrientation: Object.assign({}, edition().localOrientation, {
      firstDayArrival: hostile,
      contacts: [{ role: hostile, directoryUrl: 'https://directory.example.edu/a?x=%22%3E%3Cimg%20src=x%3E&y=1' }],
      checklist: [{ id: 'local:check:hostile', label: hostile, priority: 'optional' }],
      resources: [{
        id: 'local:resource:hostile', title: hostile,
        url: 'https://policy.example.edu/a?x=%22%3E%3Cimg%20src=x%3E&y=1',
        priority: 'required', week: 1, rationale: hostile,
      }],
    }),
  });
  const html = F.card(risky, CURRENT_REVISION)
    + F.core({ editionPriority: 'required', editionRationale: hostile })
    + F.orientation(risky, { checklist: {}, resources: {} })
    + F.resources(risky, 1, { checklist: {}, resources: {} });
  assert.doesNotMatch(html, /<img|onerror="/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &quot;quoted&quot; &#39;single&#39;/);
  assert.match(html, /href="https:\/\/policy\.example\.edu\/a\?x=%22%3E%3Cimg%20src=x%3E&amp;y=1"/);
  assert.doesNotMatch(html, /href="[^"]*"quoted|data-local-id="[^"]*"quoted/);
});

test('all three local priorities are written as text and rationale is optional', () => {
  assert.equal(typeof F.core, 'function');
  for (const [priority, label] of [
    ['required', 'Required'], ['recommended', 'Recommended'], ['optional', 'Optional'],
  ]) {
    const html = F.core({ editionPriority: priority, editionRationale: `Why ${priority}.` });
    assert.match(html, new RegExp(`Local priority: ${label}`));
    assert.match(html, new RegExp(`Attending rationale: Why ${priority}\\.`));
  }
  const empty = F.core({ editionPriority: 'recommended', editionRationale: '' });
  assert.match(empty, /Local priority: Recommended/);
  assert.doesNotMatch(empty, /Attending rationale:/);
  assert.equal(F.core({}), '');
});

test('local orientation and week resources are explicitly attending-provided and use separate completion', () => {
  assert.equal(typeof F.orientation, 'function');
  assert.equal(typeof F.resources, 'function');
  const progress = {
    checklist: { 'local:check:1': true }, resources: { 'local:resource:1': true },
  };
  const orientation = F.orientation(edition(), progress);
  const resources = F.resources(edition(), 1, progress);
  assert.match(orientation, /Attending-provided local orientation/);
  assert.match(orientation, /Attending-provided first-day checklist/);
  assert.match(orientation, /data-fd-local-toggle="checklist" data-local-id="local:check:1"[^>]*aria-pressed="true"/);
  assert.match(resources, /Attending-provided local resources/);
  assert.match(resources, /Attending-provided local resource/);
  assert.match(resources, /policy\.example\.edu/);
  assert.match(resources, /target="_blank" rel="noopener noreferrer"/);
  assert.match(resources, /data-fd-local-toggle="resources" data-local-id="local:resource:1"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(orientation + resources, /attested|institutionally approved/i);
});

test('long valid text is preserved and empty optional fields produce no empty labels', () => {
  const longText = 'Orientation detail '.repeat(30).trim();
  const value = edition({
    changeNote: '',
    localOrientation: {
      firstDayArrival: longText, dailySchedule: '', roundsWorkflow: '',
      presentationExpectations: '', documentationExpectations: '', attendanceExpectations: '',
      feedbackProcess: '', accessPreparation: '', contacts: [], checklist: [], resources: [],
    },
  });
  const card = F.card(value, CURRENT_REVISION);
  const orientation = F.orientation(value, { checklist: {}, resources: {} });
  assert.doesNotMatch(card, /What changed/);
  assert.match(orientation, new RegExp(longText));
  assert.doesNotMatch(orientation, /Typical daily schedule|Rounds workflow|Access preparation/);
  assert.equal(F.resources(value, 1, { checklist: {}, resources: {} }), '');
});

test('external domains are HTTPS-only, credential-free, and fail closed', () => {
  assert.equal(typeof F.domain, 'function');
  assert.equal(F.domain('https://Sub.Example.EDU/path?q=1'), 'sub.example.edu');
  for (const url of [
    'http://example.edu/path', 'javascript:alert(1)', 'https://user:pass@example.edu/path',
    'https://', '', 'not a url',
  ]) assert.equal(F.domain(url), '');
});

test('throwing render inputs and invalid URLs fail closed without leaking private errors', () => {
  const hostile = new Proxy({}, { get() { throw new Error('private render secret'); } });
  for (const call of [
    () => F.card(hostile, CURRENT_REVISION),
    () => F.core(hostile),
    () => F.orientation(hostile, hostile),
    () => F.resources(hostile, 1, hostile),
    () => F.domain(hostile),
  ]) {
    let output;
    assert.doesNotThrow(() => { output = call(); });
    assert.equal(output, '');
    assert.doesNotMatch(output, /private render secret/);
  }
});
