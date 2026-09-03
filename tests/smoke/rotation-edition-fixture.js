import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { routeFetchWithRetry } from './net-resilience.js';
import { projectAudience } from './audience.js';

export const ROTATION_CURATOR_PATH = '/tools/rotation-curator.html';
export const ROTATION_EDITION_ASSIGNMENT = 'var FD_ROTATION_EDITION_CATALOG=';
export const ROTATION_EDITION_ORDER = [
  'First day at the location',
  'Before you arrive',
  'Who to contact',
  "Today's checklist",
  'Typical day',
  'Team workflow',
  'Attendance and feedback',
  'Official resources',
];
export const ROTATION_EDITION_AUTHORITY = [
  'Reviewed clerkship Library',
  'Local rotation guidance',
  'Required by this local rotation',
  'Recommended by this local rotation',
  'Optional for this local rotation',
  'Locally curated official resource',
  'Use only the approved institutional record. Do not place patient information in this site. Complete documentation only with supervisor guidance and review.',
  'Local rotation guidance does not replace current institutional policy or supervision.',
];
export const ROTATION_EDITION_AFFIRMATIONS = {
  publicSafe: 'I confirm this edition contains no PHI, learner data, evaluations, credentials, private contact details, or access codes.',
  officialLinks: 'I confirm every linked local clinical protocol is an official HTTPS institutional source.',
  previewsReviewed: 'I reviewed both the desktop and 390 px mobile student previews.',
  forwardable: 'I understand anyone may forward this account-free link and I cannot revoke this edition from the link.',
};
export const ROTATION_EDITION_KEYS = {
  location: 'synthetic.location.primary@v1',
  alternateLocation: 'synthetic.location.alternate@v1',
  curator: 'synthetic.curator@v1',
  phrases: 'synthetic.phrases@v1',
  fullPreset: 'synthetic.preset.full@v1',
  reason: 'synthetic.choice.reason-one@v1',
  deprecatedReason: 'synthetic.choice.deprecated-reason@v1',
  blockedReason: 'synthetic.choice.blocked-reason@v1',
  place: 'synthetic.place.one@v1',
  crossLocationPlace: 'synthetic.place.alternate@v1',
  role: 'synthetic.choice.role-one@v1',
  arrivalLink: 'synthetic.link.arrival@v1',
  resourceLink: 'synthetic.link.resource@v1',
  crossLocationLink: 'synthetic.link.cross-location@v1',
};

const CATALOG = JSON.parse(readFileSync(new URL(
  '../fixtures/rotation-edition-catalog/valid-catalog.json', import.meta.url,
), 'utf8'));
const GOVERNANCE = JSON.parse(readFileSync(new URL(
  '../fixtures/rotation-edition-catalog/valid-governance.json', import.meta.url,
), 'utf8'));
const TARGET_PATHS = new Set(['/', '/index.html', ROTATION_CURATOR_PATH]);
const SYNTHETIC_PREFIX = 'synthetic.';
const RUNTIME_FAULT_SUBSTITUTIONS = Object.freeze({
  location: Object.freeze({
    needle: 'fdEditionInputs=fdEditionRuntimeInputs(window,fdDocument,fdApp,fdEditionMount,fdCatalogSnapshot,FD_SITE_CONTEXT);',
    replacement: 'fdEditionInputs=fdEditionRuntimeInputs(new URLSearchParams(location.search).get(\'task8-fault\')===\'location\'?{get location(){(window.__task8BoundaryFaultInvocations||(window.__task8BoundaryFaultInvocations=[])).push(\'location\');throw new Error(\'private synthetic location failure\');}}:window,fdDocument,fdApp,fdEditionMount,fdCatalogSnapshot,FD_SITE_CONTEXT);',
  }),
  reload: Object.freeze({
    needle: 'fdEditionBootLocation,fdEditionInputs.hashCleared,fdRecoverCommittedEdition))throw new Error(\'edition mount\');',
    replacement: '(new URLSearchParams(location.search).get(\'task8-fault\')===\'reload\'?{reload:function(){(window.__task8BoundaryFaultInvocations||(window.__task8BoundaryFaultInvocations=[])).push(\'reload\');throw new Error(\'private synthetic reload failure\');}}:fdEditionBootLocation),fdEditionInputs.hashCleared,fdRecoverCommittedEdition))throw new Error(\'edition mount\');',
  }),
});

export function rotationEditionCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(rotationEditionCanonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${rotationEditionCanonical(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function rotationEditionDigest(value) {
  return `sha256-${createHash('sha256').update(rotationEditionCanonical(value), 'utf8').digest('base64url')}`;
}

function clone(value) {
  return structuredClone(value);
}

function codePointSort(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fixtureLifecycle() {
  const values = new Map(GOVERNANCE.dispositions.map((row) => [row.key, row.status]));
  const records = CATALOG.records.filter((record) => record.key.startsWith(SYNTHETIC_PREFIX));
  if (records.length !== 46) throw new Error(`expected 46 synthetic fixture records, received ${records.length}`);
  for (const record of records) {
    if (!values.has(record.key)) throw new Error('synthetic fixture disposition missing');
  }
  return { records, values };
}

export function buildRotationEditionProjection(audience, revision, gate = 'enabled') {
  if (!['ms3', 'resident'].includes(audience)) throw new Error('unsupported synthetic audience');
  if (!/^sha256-[A-Za-z0-9_-]{43}$/.test(revision)) throw new Error('invalid built catalog revision');
  if (!['enabled', 'disabled'].includes(gate)) throw new Error('invalid synthetic publication gate');
  const fixture = fixtureLifecycle();
  const records = fixture.records.map((source) => {
    const record = clone(source);
    record.audiences = [audience];
    const bare = clone(record);
    delete bare.contentDigest;
    record.contentDigest = rotationEditionDigest(bare);
    return record;
  }).sort((left, right) => codePointSort(left.key, right.key));
  const status = (key) => fixture.values.get(key);
  const projection = {
    schemaVersion: 1,
    audience,
    revision,
    projectionDigest: '',
    rotationEditionV2: gate,
    selectionKeys: records.filter((record) => status(record.key) === 'reviewed').map((record) => record.key),
    resolutionRecords: records.filter((record) => ['reviewed', 'deprecated'].includes(status(record.key))),
    blockedKeys: records.filter((record) => status(record.key) === 'blocked').map((record) => record.key),
  };
  const bare = clone(projection);
  delete bare.projectionDigest;
  projection.projectionDigest = rotationEditionDigest(bare);
  return projection;
}

export function resealRotationEditionProjection(projection) {
  const next = clone(projection);
  delete next.projectionDigest;
  next.projectionDigest = rotationEditionDigest(next);
  return next;
}

function markerOffsets(source, marker) {
  const offsets = [];
  let cursor = 0;
  while (cursor <= source.length) {
    const offset = source.indexOf(marker, cursor);
    if (offset < 0) break;
    offsets.push(offset);
    cursor = offset + marker.length;
  }
  return offsets;
}

function jsonObjectEnd(source, start) {
  if (source[start] !== '{') throw new Error('catalog assignment is not an object');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return offset + 1;
      if (depth < 0) break;
    }
  }
  throw new Error('catalog assignment object is unterminated');
}

export function replaceRotationEditionCatalog(html, projection) {
  if (typeof html !== 'string' || Buffer.from(html, 'utf8').toString('utf8') !== html) {
    throw new Error('built HTML must round-trip as UTF-8');
  }
  const offsets = markerOffsets(html, ROTATION_EDITION_ASSIGNMENT);
  if (offsets.length !== 1) throw new Error(`expected one catalog assignment, found ${offsets.length}`);
  const valueStart = offsets[0] + ROTATION_EDITION_ASSIGNMENT.length;
  const valueEnd = jsonObjectEnd(html, valueStart);
  if (html[valueEnd] !== ';') throw new Error('catalog assignment semicolon is missing');
  const originalText = html.slice(valueStart, valueEnd);
  const originalProjection = JSON.parse(originalText);
  const prefix = html.slice(0, valueStart);
  const suffix = html.slice(valueEnd);
  const replacement = rotationEditionCanonical(projection);
  const body = `${prefix}${replacement}${suffix}`;
  if (body.slice(0, prefix.length) !== prefix || body.slice(prefix.length + replacement.length) !== suffix) {
    throw new Error('catalog route changed non-catalog bytes');
  }
  return { body, originalProjection, prefix, suffix, originalText, replacement };
}

export function replaceRotationEditionRuntimeFault(html, fault = '') {
  if (!fault) return { body: html, fault: '', count: 0, prefix: html, suffix: '' };
  if (!Object.hasOwn(RUNTIME_FAULT_SUBSTITUTIONS, fault)) {
    throw new Error(`unsupported runtime fault: ${fault}`);
  }
  const substitution = RUNTIME_FAULT_SUBSTITUTIONS[fault];
  const offsets = markerOffsets(html, substitution.needle);
  if (offsets.length !== 1) {
    throw new Error(`expected one ${fault} runtime fault target, found ${offsets.length}`);
  }
  const prefix = html.slice(0, offsets[0]);
  const suffix = html.slice(offsets[0] + substitution.needle.length);
  const body = `${prefix}${substitution.replacement}${suffix}`;
  if (body.slice(0, prefix.length) !== prefix
    || body.slice(prefix.length + substitution.replacement.length) !== suffix) {
    throw new Error(`${fault} runtime fault changed non-target bytes`);
  }
  return { body, fault, count: 1, prefix, suffix };
}

function readAudience(html) {
  const marker = 'var FD_AUDIENCE=';
  const offsets = markerOffsets(html, marker);
  if (offsets.length !== 1) throw new Error(`expected one audience assignment, found ${offsets.length}`);
  const start = offsets[0] + marker.length;
  const end = html.indexOf(';', start);
  if (end < 0) throw new Error('audience assignment semicolon is missing');
  const audience = JSON.parse(html.slice(start, end));
  if (!['ms3', 'resident'].includes(audience)) throw new Error('built audience is invalid');
  return audience;
}

export async function installRotationEditionRoute(page, options = {}) {
  const ledger = [];
  const gate = options.gate || 'enabled';
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!TARGET_PATHS.has(url.pathname)) {
      await route.continue();
      return;
    }
    const response = await routeFetchWithRetry(route);
    const html = await response.text();
    const audience = readAudience(html);
    const original = replaceRotationEditionCatalog(html, {
      schemaVersion: 1, audience, revision: `sha256-${'A'.repeat(43)}`,
      projectionDigest: `sha256-${'A'.repeat(43)}`, rotationEditionV2: 'disabled',
      selectionKeys: [], resolutionRecords: [], blockedKeys: [],
    }).originalProjection;
    if (original.audience !== audience || !/^sha256-[A-Za-z0-9_-]{43}$/.test(original.revision)) {
      throw new Error('built catalog audience/revision mismatch');
    }
    if (options.expectProduction !== false && (
      original.rotationEditionV2 !== 'disabled'
      || original.selectionKeys.length !== 0
      || original.resolutionRecords.length !== 0
      || original.blockedKeys.length !== 0
    )) throw new Error('checked-in build is not empty and disabled');
    let projection = buildRotationEditionProjection(audience, original.revision, gate);
    if (typeof options.mutateProjection === 'function') {
      projection = clone(projection);
      options.mutateProjection(projection, { audience, pathname: url.pathname });
      if (options.resealProjection !== false) projection = resealRotationEditionProjection(projection);
    }
    const replaced = replaceRotationEditionCatalog(html, projection);
    const runtimeFault = replaceRotationEditionRuntimeFault(replaced.body, options.runtimeFault || '');
    const headers = response.headers();
    const replacementBytes = Buffer.byteLength(runtimeFault.body, 'utf8');
    const fulfilledHeaders = { ...headers, 'content-length': String(replacementBytes) };
    ledger.push({
      url: url.href,
      pathname: url.pathname,
      audience,
      original: clone(original),
      projection: clone(projection),
      originalPrefix: replaced.prefix,
      originalSuffix: replaced.suffix,
      headers: clone(headers),
      status: response.status(),
      statusText: response.statusText(),
      replacementBytes,
      runtimeFault: runtimeFault.fault,
      runtimeFaultCount: runtimeFault.count,
      csp: headers['content-security-policy'] || '',
    });
    await route.fulfill({ response, headers: fulfilledHeaders, body: runtimeFault.body });
  });
  return ledger;
}

export function rotationEditionAudience(projectName) {
  return projectAudience(projectName);
}

export function rotationEditionStorageKeys(audience) {
  return audience === 'resident'
    ? { edition: 'rp_rotation_edition_resident_v2', local: 'rp_rotation_local_progress_resident_v2' }
    : { edition: 'cw_rotation_edition_ms3_v2', local: 'cw_rotation_local_progress_ms3_v2' };
}

export async function seedRotationEditionLearner(page, audience) {
  await page.addInitScript((viewWeek) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7) - ((viewWeek - 1) * 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!localStorage.getItem('cw_rotation_start')) localStorage.setItem('cw_rotation_start', start);
    if (!localStorage.getItem('cw_frontdoor_v1')) localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'today', viewWeek, week: viewWeek, autoAdvance: false,
    }));
    if (!localStorage.getItem('cw_progress_v1')) {
      localStorage.setItem('cw_progress_v1', '{"synthetic-core":{"done":true}}');
    }
  }, audience === 'resident' ? 4 : 1);
}

export function decodeRotationEditionLink(link) {
  const url = new URL(link);
  if (!url.hash.startsWith('#edition=')) throw new Error('edition fragment is missing');
  const payload = url.hash.slice('#edition='.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('edition payload is not base64url');
  const backupJson = Buffer.from(payload, 'base64url').toString('utf8');
  const envelope = JSON.parse(backupJson);
  if (rotationEditionCanonical(envelope) !== backupJson) throw new Error('edition backup is not canonical');
  return { url, payload, backupJson, envelope };
}

export function mutateRotationEditionLink(link, mutate) {
  const decoded = decodeRotationEditionLink(link);
  const envelope = clone(decoded.envelope);
  mutate(envelope);
  const preimage = { format: envelope.format, schemaVersion: envelope.schemaVersion, config: envelope.config };
  envelope.digest = rotationEditionDigest(preimage);
  const backupJson = rotationEditionCanonical(envelope);
  const payload = Buffer.from(backupJson, 'utf8').toString('base64url');
  return `${decoded.url.origin}/#edition=${payload}`;
}
