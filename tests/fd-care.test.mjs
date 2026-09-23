import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const careUrl = new URL(`${BUILD}/frontdoor/fd_care.js`, import.meta.url);
const careSrc = existsSync(careUrl) ? readFileSync(careUrl, 'utf8') : '';
const navigatorUrl = new URL(`${BUILD}/frontdoor/fd_care_navigator.js`, import.meta.url);
const navigatorSrc = existsSync(navigatorUrl) ? readFileSync(navigatorUrl, 'utf8') : '';
const dataSrc = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');
const curriculum = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../curriculum.schema.json', import.meta.url), 'utf8'));

let F = null;
if (careSrc) {
  // eslint-disable-next-line no-new-func
  F = new Function(`
    ${dataSrc}
    ${navigatorSrc}
    ${careSrc}
    return {
      fdCare: typeof fdCare === 'function' ? fdCare : null,
      fdCareNavigator: typeof fdCareNavigator === 'function' ? fdCareNavigator : null,
      fdCareNavigatorEntries: typeof fdCareNavigatorEntries === 'function' ? fdCareNavigatorEntries : null,
      fdCareNavigatorSelection: typeof fdCareNavigatorSelection === 'function' ? fdCareNavigatorSelection : null,
    };
  `)();
}

test('the care renderer is a registered standalone Front Door module', () => {
  assert.ok(careSrc, 'frontdoor/fd_care.js must exist');
  assert.equal(typeof F?.fdCare, 'function');
  const common = readFileSync(new URL(`${BUILD}/common.py`, import.meta.url), 'utf8');
  const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
  assert.match(common, /"\/\*__FD_CARE_NAVIGATOR__\*\/"\s*:\s*"frontdoor\/fd_care_navigator\.js"/);
  assert.match(shell, /\/\*__FD_CARE_NAVIGATOR__\*\//);
  assert.ok(common.indexOf('/*__FD_CARE_NAVIGATOR__*/') < common.indexOf('/*__FD_CARE__*/'));
  assert.ok(shell.indexOf('/*__FD_CARE_NAVIGATOR__*/') < shell.indexOf('/*__FD_CARE__*/'));
  assert.match(common, /"\/\*__FD_CARE__\*\/"\s*:\s*"frontdoor\/fd_care\.js"/);
  assert.match(shell, /\/\*__FD_CARE__\*\//);
});

test('the real curriculum carries five curated resources in two purposeful groups', () => {
  assert.deepEqual(curriculum.careResources.map(({ id, group }) => ({ id, group })), [
    { id: 'resource-finder', group: 'support' },
    { id: 'meeting-calendar', group: 'support' },
    { id: 'education-library', group: 'education' },
    { id: 'podcast-navigator', group: 'education' },
    { id: 'book-shelf', group: 'education' },
  ]);
  assert.equal(curriculum.careResources.find(({ id }) => id === 'book-shelf')?.url,
    'https://reconnect-tools.netlify.app/tools/relational-bibliotherapy.html');
});

const expectedNavigator = [
  ['services', 'resource-finder', ['meeting-calendar']],
  ['meetings', 'meeting-calendar', ['resource-finder']],
  ['explain', 'education-library', ['book-shelf', 'podcast-navigator']],
  ['listen', 'podcast-navigator', ['education-library', 'book-shelf']],
  ['books', 'book-shelf', ['education-library', 'podcast-navigator']],
  ['family-conversation', 'education-library', ['book-shelf', 'podcast-navigator']],
];

test('the navigator stylesheet and class inventory pin responsive accessible behavior', () => {
  const css = readFileSync(new URL(`${BUILD}/frontdoor/frontdoor.css`, import.meta.url), 'utf8');
  const inventory = readFileSync(new URL(
    '../docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md', import.meta.url), 'utf8');
  assert.match(css, /\.fd-care-navigator__choice\{[^}]*min-height:var\(--fd-target-touch\)/);
  assert.match(css, /\.fd-care-navigator__choice\[aria-pressed="true"\]/);
  assert.match(css, /\.fd-care-navigator__choice\[aria-pressed="true"\] \.fd-care-navigator__check\{[^}]*color:var\(--fd-on-accent\)/);
  assert.match(css, /\.fd-care-navigator__choice>span:last-child\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.fd-care-navigator__choices(?:,\.fd-care-navigator__alternatives)?\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(inventory, /\.fd-care-navigator__choice/);
  assert.match(inventory, /\.fd-care-navigator__choice\.is-selected/);
});

test('the navigator renders six fixed choices and no initial result', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  const html = F.fdCareNavigator(index, '');
  assert.equal((html.match(/data-fd-care-intent=/g) || []).length, 6);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 6);
  assert.match(html, /Choose the task—not patient details/);
  assert.doesNotMatch(html, /Best starting point|data-fd-care-clear/);
});

test('every intent resolves canonical primary and alternative records', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  for (const [id, primaryId, alternativeIds] of expectedNavigator) {
    const selected = F.fdCareNavigatorSelection(index, id);
    assert.equal(selected.primary.id, primaryId, id);
    assert.deepEqual(selected.alternatives.map((item) => item.id), alternativeIds, id);
    const html = F.fdCareNavigator(index, id);
    assert.match(html, /Best starting point/);
    assert.equal((html.match(/data-care-recommendation=/g) || []).length,
      1 + alternativeIds.length);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  }
});

test('an unknown selected intent returns the complete unselected navigator', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  assert.equal(F.fdCareNavigatorSelection(index, 'not-an-intent'), null);
  const html = F.fdCareNavigator(index, 'not-an-intent');
  assert.equal((html.match(/data-fd-care-intent=/g) || []).length, 6);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 6);
  assert.doesNotMatch(html, /Best starting point|data-fd-care-clear/);
});

test('non-string selections cannot resolve a Care intent', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  for (const selected of [['services'], { toString: () => 'services' }]) {
    assert.equal(F.fdCareNavigatorSelection(index, selected), null);
    assert.doesNotMatch(F.fdCareNavigator(index, selected), /Best starting point/);
  }
});

test('malformed navigator data fails soft without hiding the five-resource shelf', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: [{ id: 'broken', label: 'Broken', explanation: 'Broken mapping',
      primaryResourceId: 'missing', alternativeResourceIds: ['book-shelf'] }] };
  assert.equal(F.fdCareNavigator(index, 'broken'), '');
  const page = F.fdCare(index, 'broken');
  assert.equal((page.match(/class="fd-carelink"/g) || []).length, 5);
});

test('invalid alternatives drop while the valid primary remains', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: [{ id: 'partial', label: 'Partial choice',
      explanation: 'A valid primary remains available to the learner.',
      primaryResourceId: 'education-library',
      alternativeResourceIds: ['missing', 'book-shelf', 'book-shelf', 'education-library'] }] };
  const selected = F.fdCareNavigatorSelection(index, 'partial');
  assert.equal(selected.primary.id, 'education-library');
  assert.deepEqual(selected.alternatives.map((item) => item.id), ['book-shelf']);
});

test('inherited and non-string primary references never create navigator links', () => {
  for (const primaryResourceId of ['constructor', ['education-library']]) {
    const index = { careResources: curriculum.careResources,
      careNavigator: [{ id: 'unsafe', label: 'Unsafe choice', explanation: 'Bad reference.',
        primaryResourceId, alternativeResourceIds: [] }] };
    assert.deepEqual(F.fdCareNavigatorEntries(index), [], String(primaryResourceId));
    assert.equal(F.fdCareNavigator(index, 'unsafe'), '');
    assert.equal((F.fdCare(index, 'unsafe').match(/class="fd-carelink"/g) || []).length, 5);
  }
});

test('inherited and non-string alternatives drop without hiding a valid primary', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: [{ id: 'safe', label: 'Safe choice', explanation: 'Valid primary.',
      primaryResourceId: 'education-library',
      alternativeResourceIds: ['constructor', ['book-shelf'], 'podcast-navigator'] }] };
  const selected = F.fdCareNavigatorSelection(index, 'safe');
  assert.equal(selected.primary.id, 'education-library');
  assert.deepEqual(selected.alternatives.map((item) => item.id), ['podcast-navigator']);
  assert.equal((F.fdCareNavigator(index, 'safe').match(/data-care-recommendation=/g) || []).length, 2);
});

test('navigator rendering escapes every supplied field and stays browser-global free', () => {
  const index = {
    careResources: [{ id: 'safe', title: '<img src=x onerror=1>',
      description: '<script>bad()</script>', url: 'https://example.test/&bad' }],
    careNavigator: [{ id: 'intent', label: '<b>label</b>',
      explanation: '<svg onload=bad()>', primaryResourceId: 'safe',
      alternativeResourceIds: [] }],
  };
  const html = F.fdCareNavigator(index, 'intent');
  assert.doesNotMatch(html, /<img|<script|<svg/);
  assert.match(html, /&lt;b&gt;label&lt;\/b&gt;/);
  assert.match(html, /https:\/\/example\.test\/&amp;bad/);
  const hostileIdIndex = { careResources: index.careResources,
    careNavigator: [{ id: 'intent" onclick="bad()', label: 'Unsafe identifier',
      explanation: 'This malformed identifier must never enter a selector or attribute.',
      primaryResourceId: 'safe', alternativeResourceIds: [] }] };
  assert.equal(F.fdCareNavigator(hostileIdIndex, 'intent" onclick="bad()'), '');
  assert.doesNotMatch(navigatorSrc,
    /localStorage\.|sessionStorage\.|document\.|window\.|fetch\(|XMLHttpRequest|cwAnalytics|\.record\(|\bconst\s|\blet\s|=>/);
});

test('the Care page composes the selected navigator before its five-link shelf', () => {
  const index = { careResources: curriculum.careResources,
    careNavigator: curriculum.careNavigator };
  const html = F.fdCare(index, 'services');
  assert.ok(html.indexOf('fd-care-navigator') > html.indexOf('fd-care-page__notice'));
  assert.ok(html.indexOf('fd-care-navigator') < html.indexOf('fd-care-page__groups'));
  assert.match(html, /aria-pressed="true"/);
  assert.equal((html.match(/class="fd-carelink"/g) || []).length, 5);
  assert.equal((html.match(/data-care-recommendation=/g) || []).length, 2);
});

test('the curriculum carries the approved six-intent navigator map', () => {
  assert.deepEqual(curriculum.careNavigator.map((intent) => [
    intent.id, intent.primaryResourceId, intent.alternativeResourceIds,
  ]), expectedNavigator);
  assert.ok(schema.required.includes('careNavigator'));
  const navigatorSchema = schema.properties.careNavigator;
  assert.equal(navigatorSchema.minItems, 6);
  assert.equal(navigatorSchema.maxItems, 6);
  assert.equal(navigatorSchema.items.additionalProperties, false);
  assert.deepEqual(navigatorSchema.items.properties.id.enum,
    expectedNavigator.map(([id]) => id));
  assert.equal(navigatorSchema.items.properties.alternativeResourceIds.maxItems, 2);
});

test('the care page renders five static external links without forwarding context', () => {
  assert.ok(F?.fdCare, 'fdCare must exist before its behavior can be tested');
  const html = F.fdCare({ careResources: curriculum.careResources });
  assert.match(html, /^<section class="fd-care-page"/);
  assert.match(html, /<h1[^>]*>Patient care resources<\/h1>/);
  assert.match(html, /Find support and follow-up/);
  assert.match(html, /Teach and share/);
  assert.equal((html.match(/class="fd-carelink"/g) || []).length, 5);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 5);
  assert.equal((html.match(/data-care-resource=/g) || []).length, 5);
  for (const resource of curriculum.careResources) {
    assert.match(html, new RegExp(`href="${resource.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.ok(!/[?#]/.test(resource.url), `${resource.id} must remain a fixed URL with no patient context`);
  }
  assert.match(html, /Verify current details before sharing/);
  assert.match(html, /Do not enter patient-identifying information/);
  assert.match(html, /ReConnect collection/);
  assert.match(html, /Created by Joshua Moss, MD/);
  assert.match(html, /personally curated ReConnect databases developed over several years/);
});

test('the care renderer escapes curriculum copy and remains pure ES5', () => {
  assert.ok(F?.fdCare, 'fdCare must exist before its behavior can be tested');
  const evil = [{ id: 'x', group: 'support', title: '<img src=x onerror=1>',
    description: '<script>bad()</script>', url: 'https://example.test/', searchTerms: [] }];
  const html = F.fdCare({ careResources: evil });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(careSrc, /localStorage\.|document\.|window\.|\bconst\s|\blet\s|=>/);
});

test('the curriculum schema governs both care and external teaching resources', () => {
  assert.ok(schema.required.includes('careResources'));
  assert.ok(schema.required.includes('teachingResources'));
  assert.ok(schema.properties.careResources.items.properties.group);
  assert.deepEqual(schema.properties.careResources.items.properties.group.enum, ['support', 'education']);
  assert.equal(curriculum.teachingResources.length, 1);
  assert.equal(curriculum.teachingResources[0].id, 'family-therapy-companion');
  assert.equal(curriculum.teachingResources[0].url,
    'https://family-therapy-seminar-companion.netlify.app/');
});
