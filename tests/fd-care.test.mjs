import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const careUrl = new URL(`${BUILD}/frontdoor/fd_care.js`, import.meta.url);
const careSrc = existsSync(careUrl) ? readFileSync(careUrl, 'utf8') : '';
const dataSrc = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');
const curriculum = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../curriculum.schema.json', import.meta.url), 'utf8'));

let F = null;
if (careSrc) {
  // eslint-disable-next-line no-new-func
  F = new Function(`
    ${dataSrc}
    ${careSrc}
    return { fdCare: typeof fdCare === 'function' ? fdCare : null };
  `)();
}

test('the care renderer is a registered standalone Front Door module', () => {
  assert.ok(careSrc, 'frontdoor/fd_care.js must exist');
  assert.equal(typeof F?.fdCare, 'function');
  const common = readFileSync(new URL(`${BUILD}/common.py`, import.meta.url), 'utf8');
  const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
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
