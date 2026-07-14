import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repo, '13_Faculty_Resources/Outreach/alex-tour');
const indexPath = path.join(source, 'index.html');
const configPath = path.join(source, 'netlify.toml');

const destinations = new Map([
  ['resident-library', 'https://mmc-psychiatry-residents-sanford.netlify.app/'],
  ['ms3-library', 'https://une-ms3-psychiatry.netlify.app/'],
  ['sp-interview', 'https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html'],
  ['faculty-console', 'https://clerkship-faculty-attest.netlify.app/'],
  ['reconnect-tools', 'https://reconnect-tools.netlify.app/'],
  ['therapy-match', 'https://therapymatch-maine.netlify.app/'],
  ['mental-health-library', 'https://mental-health-education-library.netlify.app/'],
  [
    'family-therapy-companion',
    'https://family-therapy-seminar-companion.netlify.app/',
  ],
]);

const questions = [
  [
    'Where should a workforce-education pilot begin: residents, MS3 learners,',
    'or faculty development?',
  ].join(' '),
  [
    'Could faculty attestation, visible review status, and auditable repository history',
    "be adapted to MaineHealth's governance requirements?",
  ].join(' '),
  [
    'What 60–90-day pilot could demonstrate learning value without creating',
    'substantial faculty or operational burden?',
  ].join(' '),
];

const html = fs.readFileSync(indexPath, 'utf8');
const netlify = fs.readFileSync(configPath, 'utf8');

function normalizeText(value) {
  return value
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(
      /<([a-z][\w:-]*)\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

const pageText = normalizeText(html);

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('base64');
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('contains exactly one canonical anchor for every destination', () => {
  const tags = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  const registered = tags
    .map((tag) => attribute(tag, 'data-destination'))
    .filter(Boolean)
    .sort();
  assert.deepEqual(registered, [...destinations.keys()].sort());
  for (const [id, href] of destinations) {
    const matches = tags.filter((tag) => attribute(tag, 'data-destination') === id);
    assert.equal(matches.length, 1, `${id} must appear exactly once`);
    assert.equal(attribute(matches[0], 'href'), href, `${id} URL changed`);
  }

  const external = tags.filter((tag) => (attribute(tag, 'href') || '').startsWith('https://'));
  assert.equal(external.length, destinations.size, 'Unexpected external anchor found');
  for (const tag of external) {
    assert.ok(attribute(tag, 'data-destination'), 'External anchor is not registered');
    assert.equal(attribute(tag, 'target'), '_blank');
    const rel = new Set((attribute(tag, 'rel') || '').split(/\s+/));
    assert.ok(rel.has('noopener'));
    assert.ok(rel.has('noreferrer'));
  }

  const completeAnchors = [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)];
  for (const match of completeAnchors) {
    const tag = match[1];
    if (!(attribute(tag, 'href') || '').startsWith('https://')) continue;
    const accessibleName = attribute(tag, 'aria-label') || normalizeText(match[2]);
    assert.ok(accessibleName, `External link has no accessible name: ${tag}`);
  }
});

test('preserves the approved hero and disclosure', () => {
  for (const text of [
    'Faculty-governed psychiatry workforce education',
    'A six-minute guided tour from supervised learning to accountable scale.',
    'Joshua Moss, MD | Psychiatrist',
    'Start the six-minute tour',
    'Working prototypes for discussion. No patient data. No implied institutional endorsement.',
  ]) {
    assert.ok(pageText.includes(text), `Missing approved hero text: ${text}`);
  }
  assert.match(html, /<a\b[^>]*href="#resident-education"[^>]*>/);
});

test('preserves the approved route and questions', () => {
  for (const heading of [
    'Resident education — two minutes',
    'MS3 education and simulation — two minutes',
    'Patient and family infrastructure — two minutes',
  ]) {
    assert.ok(html.includes(heading), `Missing route heading: ${heading}`);
  }
  const questionList = html.match(/<ol class="question-list">([\s\S]*?)<\/ol>/);
  assert.ok(questionList, 'Rendered collaboration-question list missing');
  const renderedQuestions = [...questionList[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map((match) => normalizeText(match[1]));
  assert.deepEqual(renderedQuestions, questions, 'Rendered question items changed');
  assert.doesNotMatch(pageText, /initialRecords|prefers-reduced-motion/);
});

test('keeps the governance preview synthetic and read only', () => {
  const start = html.indexOf('<section id="governance-preview"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start, 'Governance preview section missing');
  const preview = html.slice(start, end);
  assert.ok(
    preview.includes('Read-only demonstration — synthetic records; no repository access.'),
  );
  assert.ok(preview.includes('Reset demonstration'));
  assert.doesNotMatch(preview, /Save reviews|Submit attestation|Mark all shown reviewed/i);
  assert.ok(html.includes('Production console — faculty credential required'));
});

test('has no duplicate IDs or hidden data pathways', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const hiddenPathways = [
    'fetch\\s*\\(',
    'XMLHttpRequest',
    'sendBeacon',
    'WebSocket',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'document\\.cookie',
  ].join('|');
  assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML id found');
  assert.doesNotMatch(html, /\sstyle="/i, 'Inline style attributes are forbidden');
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, new RegExp(hiddenPathways, 'i'));
  assert.doesNotMatch(html, /gtag\s*\(|google-analytics|plausible|segment\.com|mixpanel/i);
  assert.doesNotMatch(
    html,
    /x-student-key|cw_sp_passcode|GITHUB_TOKEN|FACULTY_ATTEST_PASSWORD/i,
  );
});

test('keeps the endpoint visible once and copies from visible text', () => {
  const endpoint = 'https://sp-interview-proxy.netlify.app/api/sp';
  assert.equal(html.split(endpoint).length - 1, 1);
  assert.match(html, /getElementById\(['"]sp-endpoint['"]\)\.textContent/);
});

test('preserves the standardized-patient setup runbook and safety language', () => {
  for (const text of [
    'Open The Interview Room.',
    'Select ⚙ setup.',
    'Live patient (LLM proxy)',
    'Enter the passcode sent separately by Joshua.',
    'Save & test connection',
    'After Connected, choose Supported or Realistic.',
    'Fictional supervised-learning simulation — not clinical decision support.',
    'Do not enter real-patient information.',
  ]) {
    assert.ok(pageText.includes(text), `Missing setup or safety text: ${text}`);
  }
});

test('preserves the three contextual prototype labels', () => {
  for (const label of [
    'Working prototype — access and referral navigation',
    'Working library — patient and family education',
    'Teaching companion — family systems and supervision',
  ]) {
    assert.equal(pageText.split(label).length - 1, 1, `Prototype label changed: ${label}`);
  }

  const expectedNames = new Map([
    ['therapy-match', 'Open TherapyMatch Maine'],
    ['mental-health-library', 'Open Mental Health Education Library'],
    ['family-therapy-companion', 'Open Family Therapy Seminar Companion'],
  ]);
  const anchors = [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)];
  for (const [destination, expectedName] of expectedNames) {
    const matches = anchors.filter(
      (match) => attribute(match[1], 'data-destination') === destination,
    );
    assert.equal(matches.length, 1, `${destination} link must appear once`);
    assert.equal(normalizeText(matches[0][2]), expectedName);
  }
});

test('updates a governance toggle in place to preserve keyboard focus', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.match(script, /function updateToggle\(toggle, record\)/);
  const listener = script.match(
    /toggle\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\s*\}\);/,
  );
  assert.ok(listener, 'Governance toggle listener missing');
  assert.match(listener[1], /record\.demoReviewed = !record\.demoReviewed/);
  assert.match(listener[1], /updateToggle\(toggle, record\)/);
  assert.doesNotMatch(listener[1], /renderRecords/);
});

test('uses verified contrast for small clay text', () => {
  const paper = html.match(/--paper:\s*(#[0-9A-F]{6});/i)?.[1];
  const clayText = html.match(/--clay-text:\s*(#[0-9A-F]{6});/i)?.[1];
  assert.ok(paper && clayText, 'Small-text contrast tokens missing');
  assert.ok(
    contrastRatio(clayText, paper) >= 4.5,
    `${clayText} does not meet 4.5:1 on ${paper}`,
  );
  assert.match(html, /\.runbook h3\s*\{[^}]*color:\s*var\(--clay-text\)/s);
  assert.match(html, /\.governance-banner\s*\{[^}]*color:\s*var\(--clay-text\)/s);
});

test('uses one hashed style and one hashed script block', () => {
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(styles.length, 1);
  assert.equal(scripts.length, 1);
  assert.doesNotMatch(html, /<script\b[^>]+src=/i);

  const styleHash = `sha256-${sha256(styles[0][1])}`;
  const scriptHash = `sha256-${sha256(scripts[0][1])}`;
  assert.ok(netlify.includes(`'${styleHash}'`), `Missing style hash: ${styleHash}`);
  assert.ok(netlify.includes(`'${scriptHash}'`), `Missing script hash: ${scriptHash}`);
  assert.doesNotMatch(netlify, /unsafe-inline/);
});

test('declares accessibility, print, and browser-security contracts', () => {
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /@media\s+print/);
  for (const directive of [
    "default-src 'self'",
    "connect-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]) {
    assert.ok(netlify.includes(directive), `Missing CSP directive: ${directive}`);
  }
  const headers = [
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['X-Robots-Tag', 'noindex, nofollow'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
  ];
  for (const [name, value] of headers) {
    assert.ok(netlify.includes(`${name} = "${value}"`), `Missing header: ${name}`);
  }
});
