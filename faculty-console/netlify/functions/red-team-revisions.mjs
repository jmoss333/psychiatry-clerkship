// Read-only production revision facts for the Interview Room red-team panel.
// The guided preflight remains the authority for live pack and mechanical checks.
import { createHash } from 'node:crypto';

const REPO = 'jmoss333/psychiatry-clerkship';
const CONFIG_PATH = '13_Faculty_Resources/_automation/maintenance/maintenance_config.json';
const PACK_PATH = '_prototypes/sp-interview/sp-interview.pack.json';
const GITHUB_API = `https://api.github.com/repos/${REPO}`;
const NETLIFY_API = 'https://api.netlify.com/api/v1';
const COMMIT = /^[0-9a-f]{40}$/;
const DEPLOY_ID = /^[0-9a-f]{24}$/;

class Unverified extends Error {}

function sameKey(candidate, expected) {
  const left = String(candidate || '');
  const right = String(expected || '');
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function json(status, body) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function getJson(fetchImpl, url, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('upstream status');
    return await response.json();
  } catch {
    throw new Unverified('revision source unavailable');
  }
}

function sourceFile(body) {
  if (!body || body.type !== 'file' || body.encoding !== 'base64'
      || typeof body.content !== 'string') throw new Unverified('source file unavailable');
  const encoded = body.content.replace(/[\r\n]/g, '');
  if (!encoded || encoded.length > 4_000_000
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Unverified('source file invalid');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64') !== encoded) {
    throw new Unverified('source file invalid');
  }
  return bytes;
}

function configuredSites(config) {
  const learners = config?.sites;
  if (!Array.isArray(learners) || learners.length !== 2) {
    throw new Unverified('site configuration invalid');
  }
  const sites = {
    proxy: config.spProxy,
    ms3: learners.find(site => site?.name === 'ms3'),
    res: learners.find(site => site?.name === 'res'),
  };
  const ids = new Set();
  for (const site of Object.values(sites)) {
    if (!site || typeof site.siteId !== 'string' || !site.siteId || ids.has(site.siteId)) {
      throw new Unverified('site configuration invalid');
    }
    ids.add(site.siteId);
    let base;
    try { base = new URL(site.baseUrl); } catch { throw new Unverified('site URL invalid'); }
    if (base.protocol !== 'https:' || !base.hostname.endsWith('.netlify.app')
        || base.username || base.password || base.port || base.pathname !== '/'
        || base.search || base.hash) throw new Unverified('site URL invalid');
  }
  return sites;
}

function normalizeDeploy(record, site, deployId) {
  if (!record || record.id !== deployId || record.site_id !== site.siteId
      || record.context !== 'production' || record.state !== 'ready'
      || typeof record.commit_ref !== 'string' || !COMMIT.test(record.commit_ref)
      || typeof record.published_at !== 'string'
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(record.published_at)
      || Number.isNaN(Date.parse(record.published_at))) {
    throw new Unverified('production deploy detail mismatch');
  }
  const expectedUrl = `https://${deployId}--${new URL(site.baseUrl).hostname}`;
  const supplied = record.links?.permalink;
  // The raw API often omits links and gives deploy_ssl_url as a moving alias.
  if (supplied !== undefined && supplied !== expectedUrl && supplied !== `${expectedUrl}/`) {
    throw new Unverified('immutable deploy URL mismatch');
  }
  return {
    siteId: site.siteId,
    deployId,
    commitRef: record.commit_ref,
    deployUrl: expectedUrl,
    publishedAt: record.published_at,
  };
}

async function latestDeploy(fetchImpl, site) {
  const listing = await getJson(fetchImpl,
    `${NETLIFY_API}/sites/${encodeURIComponent(site.siteId)}/deploys?production=true&latest-published=true&per_page=1`);
  if (!Array.isArray(listing) || listing.length !== 1 || !DEPLOY_ID.test(listing[0]?.id)) {
    throw new Unverified('published production deploy unavailable');
  }
  const deployId = listing[0].id;
  const detail = await getJson(fetchImpl, `${NETLIFY_API}/deploys/${deployId}`);
  return normalizeDeploy(detail, site, deployId);
}

async function sourceAt(fetchImpl, token, commit, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const body = await getJson(fetchImpl,
    `${GITHUB_API}/contents/${encodedPath}?ref=${commit}`,
    { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' });
  return sourceFile(body);
}

export async function loadRevisions(fetchImpl, githubToken, now = () => new Date().toISOString()) {
  if (!githubToken) throw new Unverified('GitHub token unavailable');
  const ref = await getJson(fetchImpl, `${GITHUB_API}/git/ref/heads/main`,
    { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' });
  const sourceCommit = ref?.object?.sha;
  if (!COMMIT.test(sourceCommit || '')) throw new Unverified('main source revision unavailable');

  const [configBytes, packBytes] = await Promise.all([
    sourceAt(fetchImpl, githubToken, sourceCommit, CONFIG_PATH),
    sourceAt(fetchImpl, githubToken, sourceCommit, PACK_PATH),
  ]);
  let config;
  let pack;
  try {
    config = JSON.parse(configBytes.toString('utf8'));
    pack = JSON.parse(packBytes.toString('utf8'));
  } catch { throw new Unverified('source metadata invalid'); }
  const sites = configuredSites(config);
  if (typeof pack?.version !== 'string' || !pack.version
      || typeof pack?.engine?.modelPinned !== 'string' || !pack.engine.modelPinned) {
    throw new Unverified('pack metadata invalid');
  }
  const [proxy, ms3, res] = await Promise.all([
    latestDeploy(fetchImpl, sites.proxy),
    latestDeploy(fetchImpl, sites.ms3),
    latestDeploy(fetchImpl, sites.res),
  ]);
  return {
    state: 'metadata-verified',
    fetchedAt: now(),
    pack: {
      sourceCommit,
      sha256: createHash('sha256').update(packBytes).digest('hex'),
      version: pack.version,
      model: pack.engine.modelPinned,
    },
    deployments: { proxy, ms3, res },
  };
}

export function createHandler({
  fetchImpl = globalThis.fetch,
  getEnv = key => globalThis.Netlify?.env?.get(key) || '',
  now = () => new Date().toISOString(),
} = {}) {
  return async function redTeamRevisions(request) {
    if (request?.method !== 'GET') return json(405, { state: 'unverified' });
    const requestUrl = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== requestUrl.origin) return json(403, { state: 'unverified' });
    const facultyKey = getEnv('FACULTY_ATTEST_PASSWORD');
    if (!facultyKey) return json(503, { state: 'unverified' });
    if (!sameKey(request.headers.get('x-faculty-key'), facultyKey)) {
      return json(401, { state: 'unverified' });
    }
    try {
      return json(200, await loadRevisions(fetchImpl, getEnv('GITHUB_TOKEN'), now));
    } catch {
      return json(503, {
        state: 'unverified',
        message: 'Exact revision evidence is unavailable. Use the guided red-team preflight.',
      });
    }
  };
}

export default createHandler();

export const config = { path: '/api/red-team-revisions' };
