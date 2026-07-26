import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

const STATUSES = new Set(['pending', 'reviewed']);
const RISK_KINDS = new Set([
  'general',
  'clinical',
  'legal',
  'formulary',
  'local-policy',
]);
const RISK_LEVELS = new Set(['low', 'moderate', 'high']);
const BASE_FIELDS = new Set([
  'kind',
  'status',
  'riskKind',
  'riskLevel',
  'reviewer',
  'reviewedAt',
]);
const PENDING_FIELDS = new Set([...BASE_FIELDS, 'reason', 'warning']);

function readJson(path, label, findings) {
  if (!existsSync(path)) {
    findings.push(`${label}: missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    findings.push(`${label}: invalid JSON`);
    return null;
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameTriplet(candidate, entry) {
  return record(candidate)
    && candidate.status === entry.status
    && candidate.riskKind === entry.riskKind
    && candidate.riskLevel === entry.riskLevel
    && Object.keys(candidate).length === 3;
}

function expectedEnvelope(entry) {
  return {
    reviewStatus: entry.status === 'reviewed' ? 'reviewed' : 'needs-review',
    attestationStatus: entry.status === 'reviewed'
      ? 'faculty-attested'
      : 'needs-attestation',
    reviewCategory: entry.riskKind,
    safetySeverity: entry.riskLevel,
  };
}

function markerCount(source, marker) {
  return source.split(marker).length - 1;
}

function directStatusBlock(source) {
  const match = source.match(
    /<!-- SURFACE-GOVERNANCE:START -->(.*?)<!-- SURFACE-GOVERNANCE:END -->/s,
  );
  return match ? match[1] : '';
}

export function validateSurfaceGovernance(siteDirectory) {
  const findings = [];
  const path = (...parts) => join(siteDirectory, ...parts);
  if (existsSync(path('reviewed.json'))) {
    findings.push('reviewed.json must not be published');
  }

  const governance = readJson(path('governance.json'), 'governance.json', findings);
  if (!governance) return findings;
  if (governance.schemaVersion !== 1
      || !['ms3', 'resident'].includes(governance.site)
      || !record(governance.items)) {
    findings.push('governance.json: invalid document');
    return findings;
  }

  for (const [slug, entry] of Object.entries(governance.items)) {
    if (!record(entry)
        || !['page', 'tool'].includes(entry.kind)
        || !STATUSES.has(entry.status)
        || !RISK_KINDS.has(entry.riskKind)
        || !RISK_LEVELS.has(entry.riskLevel)
        || typeof entry.reviewer !== 'string'
        || typeof entry.reviewedAt !== 'string') {
      findings.push(`governance entry invalid: ${slug}`);
      continue;
    }
    const expectedFields = entry.status === 'pending' ? PENDING_FIELDS : BASE_FIELDS;
    if (Object.keys(entry).some(field => !expectedFields.has(field))
        || Object.keys(entry).length !== expectedFields.size
        || (entry.status === 'pending'
          && (typeof entry.reason !== 'string' || typeof entry.warning !== 'string'))) {
      findings.push(`governance presentation fields invalid: ${slug}`);
    }
  }

  const nav = readJson(path('nav.json'), 'nav.json', findings);
  const navSlugs = new Set();
  if (Array.isArray(nav)) {
    for (const section of nav) {
      for (const item of Array.isArray(section?.items) ? section.items : []) {
        const slug = item?.f;
        if (typeof slug !== 'string') continue;
        navSlugs.add(slug);
        const entry = governance.items[slug];
        if (!entry) {
          findings.push(`nav governance missing artifact: ${slug}`);
        } else {
          const expectedKind = item.k === 'tool' ? 'tool' : item.k === 'md' ? 'page' : null;
          if (entry.kind !== expectedKind || !sameTriplet(item.governance, entry)) {
            findings.push(`nav governance mismatch: ${slug}`);
          }
        }
      }
    }
    for (const slug of Object.keys(governance.items)) {
      if (!navSlugs.has(slug)) findings.push(`governance artifact orphan: ${slug}`);
    }
  }

  const search = readJson(path('search-index.json'), 'search-index.json', findings);
  const searchDocuments = Array.isArray(search) ? search : search?.docs;
  if (Array.isArray(searchDocuments)) {
    for (const item of searchDocuments) {
      const slug = item?.f ?? item?.file ?? item?.path;
      if (typeof slug !== 'string') continue;
      const entry = governance.items[slug];
      if (!entry) {
        findings.push(`search governance missing artifact: ${slug}`);
      } else if (!record(item.governance)) {
        findings.push(`search governance missing: ${slug}`);
      } else if (!sameTriplet(item.governance, entry)) {
        findings.push(`search governance mismatch: ${slug}`);
      }
    }
  }

  const toolGovernance = readJson(
    path('tool-governance.json'),
    'tool-governance.json',
    findings,
  );
  const envelopes = new Map(
    (Array.isArray(toolGovernance?.items) ? toolGovernance.items : [])
      .filter(item => record(item) && typeof item.id === 'string')
      .map(item => [`${item.id.replace(/^tools\//, '')}.html`, item]),
  );

  for (const [slug, entry] of Object.entries(governance.items)) {
    if (entry.kind !== 'tool') continue;
    const toolPath = path('tools', slug);
    if (!existsSync(toolPath)) continue;
    const source = readFileSync(toolPath, 'utf8');
    if (markerCount(source, 'SURFACE-GOVERNANCE:START') !== 1
        || markerCount(source, 'SURFACE-GOVERNANCE:END') !== 1) {
      findings.push(`direct status marker count: ${slug}`);
    }
    const statusBlock = directStatusBlock(source);
    if (entry.status === 'pending' && entry.riskLevel === 'high'
        && !/surface-governance-pending-high[^>]*role="alert"/.test(statusBlock)) {
      findings.push(`direct high-risk alert missing: ${slug}`);
    }
    if (entry.status === 'pending' && entry.riskLevel !== 'high'
        && !/surface-governance-pending[^>]*role="status"/.test(statusBlock)) {
      findings.push(`direct pending status missing: ${slug}`);
    }
    if (entry.status === 'reviewed'
        && (!statusBlock.includes('surface-governance-receipt')
          || statusBlock.includes('Pending faculty review'))) {
      findings.push(`direct reviewed receipt invalid: ${slug}`);
    }

    const envelope = envelopes.get(slug);
    const expected = expectedEnvelope(entry);
    if (!envelope
        || Object.entries(expected).some(([field, value]) => envelope[field] !== value)) {
      findings.push(`tool envelope mismatch: ${slug}`);
    }
  }

  return [...new Set(findings)];
}
