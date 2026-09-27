// Read-only: what the learner sites serve, what is merged to main but not live yet, and when
// the release train next publishes. Judgement lives in ../../release-status.mjs; this file
// only reads. Every read that fails becomes a named gap in the payload, never a zero.
import {
  checksVerdict,
  firstParentChain,
  nextTrainSlot,
  releaseHeadline,
  SITE_KEYS,
  TRAIN_WORKFLOW,
  waitingChange,
} from '../../release-status.mjs';
import { latestDeploy } from './red-team-revisions.mjs';

const REPO = 'jmoss333/psychiatry-clerkship';
const CONFIG_PATH = '13_Faculty_Resources/_automation/maintenance/maintenance_config.json';
const GITHUB_API = `https://api.github.com/repos/${REPO}`;
const SHA = /^[0-9a-f]{40}$/;
const COMPARE_PAGE = 100;
const COMPARE_MAX_PAGES = 5;
const SERVED_REVISION_PATH = '/tool-governance.json';
const SERVED_MAX_BYTES = 4 * 1024 * 1024;

/** The console's reader: each site's latest published production deploy (Netlify). */
function deployReader(fetchImpl) {
  const read = async site => {
    const deploy = await latestDeploy(fetchImpl, site);
    return { commitRef: deploy.commitRef, publishedAt: deploy.publishedAt, deployUrl: deploy.deployUrl };
  };
  read.basis = 'published deploys';
  return read;
}

/**
 * The daily watch's reader: the revision each site SERVES, from its own
 * /tool-governance.json, with no credential -- the rule the production canary's
 * production_revision_parity.py applies (every item names this repository and one shared
 * 40-hex revision, or the read fails). Netlify's API is not needed from a GitHub runner.
 */
export function servedRevisionReader(fetchImpl) {
  const read = async site => {
    const response = await fetchImpl(`${String(site.baseUrl).replace(/\/+$/, '')}${SERVED_REVISION_PATH}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`served manifest answered ${response.status}`);
    const type = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (type !== 'application/json') throw new Error('served manifest is not JSON');
    const text = await response.text();
    if (text.length > SERVED_MAX_BYTES) throw new Error('served manifest too large');
    const data = JSON.parse(text);
    const items = Array.isArray(data?.items) ? data.items : [];
    const revisions = new Set(items.map(item => (item?.source?.repository === REPO ? item.source.revision : null)));
    const [revision] = revisions;
    if (!items.length || revisions.size !== 1 || !SHA.test(revision || '')) {
      throw new Error('served revision missing or ambiguous');
    }
    return { commitRef: revision, publishedAt: null, deployUrl: String(site.baseUrl) };
  };
  read.basis = 'served revisions';
  return read;
}

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

function githubReader(fetchImpl, token) {
  return async function github(path) {
    const response = await fetchImpl(`${GITHUB_API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'faculty-attest',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response.json();
  };
}

async function learnerSites(github) {
  const file = await github(`/contents/${CONFIG_PATH.split('/').map(encodeURIComponent).join('/')}?ref=main`);
  if (file?.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('site configuration unreadable');
  const config = JSON.parse(Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8'));
  const sites = {};
  for (const key of SITE_KEYS) {
    const site = config?.sites?.find(entry => entry?.name === key);
    if (!site?.siteId || !site?.baseUrl) throw new Error('site configuration invalid');
    sites[key] = site;
  }
  return sites;
}

/** Every commit of base...head, paging until total_commits is covered (or the page cap). */
async function compare(github, base, head) {
  const commits = [];
  let first = null;
  for (let page = 1; page <= COMPARE_MAX_PAGES; page += 1) {
    const body = await github(`/compare/${base}...${head}?per_page=${COMPARE_PAGE}&page=${page}`);
    first ??= body;
    const batch = Array.isArray(body?.commits) ? body.commits : [];
    commits.push(...batch);
    if (batch.length < COMPARE_PAGE || commits.length >= (first.total_commits || 0)) break;
  }
  return { status: first?.status, total: first?.total_commits ?? commits.length, commits };
}

export async function loadReleaseStatus(fetchImpl, token, {
  now = Date.now, ledgerMode = false, readSite = deployReader(fetchImpl),
} = {}) {
  if (!token) throw new Error('GitHub token unavailable');
  const github = githubReader(fetchImpl, token);
  const nowMs = now();
  const gaps = [];
  const note = (what, error) => gaps.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);

  const ref = await github('/git/ref/heads/main');
  const mainSha = ref?.object?.sha;
  if (!SHA.test(mainSha || '')) throw new Error('main revision unavailable');

  const [sitesResult, releaseResult, checksResult, runsResult] = await Promise.allSettled([
    learnerSites(github).then(sites => Promise.all(SITE_KEYS.map(async key => {
      try {
        return [key, await readSite(sites[key])];
      } catch (error) {
        note(`${key} ${readSite.basis === 'served revisions' ? 'served revision' : 'published deploy'}`, error);
        return [key, null];
      }
    }))),
    github('/git/ref/heads/release'),
    github(`/commits/${mainSha}/check-runs?per_page=100`),
    github(`/actions/workflows/${TRAIN_WORKFLOW}/runs?per_page=1`),
  ]);

  const sites = Object.fromEntries(SITE_KEYS.map(key => [key, null]));
  if (sitesResult.status === 'fulfilled') Object.assign(sites, Object.fromEntries(sitesResult.value));
  else note('learner site configuration', sitesResult.reason);

  const release = releaseResult.status === 'fulfilled' && SHA.test(releaseResult.value?.object?.sha || '')
    ? releaseResult.value.object.sha : null;
  if (!release) note('release branch', releaseResult.reason || 'unreadable');

  let mainChecks = null;
  if (checksResult.status === 'fulfilled' && Array.isArray(checksResult.value?.check_runs)) {
    mainChecks = checksVerdict(checksResult.value.check_runs);
  } else note("main's required checks", checksResult.reason || 'unreadable');

  let lastRun = null;
  if (runsResult.status === 'fulfilled' && Array.isArray(runsResult.value?.workflow_runs)) {
    const run = runsResult.value.workflow_runs[0];
    if (run) {
      lastRun = {
        at: run.run_started_at || run.created_at,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        url: /^https:\/\/github\.com\//.test(run.html_url || '') ? run.html_url : null,
      };
    }
  } else note('release-train runs', runsResult.reason || 'unreadable');

  // What learners are served: the published deploys. When both sites are unreadable, fall
  // back to the release branch and say so — it is what the next build of each site uses.
  const served = SITE_KEYS.map(key => sites[key]?.commitRef).filter(Boolean);
  const sitesDisagree = new Set(served).size > 1;
  let liveBasis = null;
  let live = null;
  if (served.length) {
    liveBasis = readSite.basis || 'published deploys';
    // Compare from the site that is further behind: what one learner cohort still lacks.
    live = served[0];
    if (sitesDisagree) {
      try {
        const between = await github(`/compare/${served[0]}...${served[1]}?per_page=1`);
        if (between?.status === 'ahead') live = served[0];
        else if (between?.status === 'behind') live = served[1];
      } catch (error) { note('site comparison', error); }
    }
    if (served.length < SITE_KEYS.length) note('live commit', 'judged from one site only');
  } else if (release) {
    liveBasis = 'release branch';
    live = release;
    gaps.push('live commit: no learner site could be read; judged from the release branch');
  }

  let waiting = { status: 'unknown', changes: [], complete: false };
  if (live) {
    try {
      const diff = await compare(github, live, mainSha);
      if (diff.status === 'identical') waiting = { status: 'current', changes: [], complete: true };
      else if (diff.status === 'ahead') {
        const { chain, complete } = firstParentChain(diff.commits, mainSha, live);
        waiting = { status: 'waiting', changes: chain.map(waitingChange), complete };
        if (!complete) gaps.push(`waiting changes: listed ${chain.length} of ${diff.total} commits; the count is a minimum`);
      } else waiting = { status: 'diverged', changes: [], complete: true };
    } catch (error) { note('waiting changes', error); }
  }

  const status = {
    state: gaps.length ? 'partial' : 'complete',
    fetchedAt: new Date(nowMs).toISOString(),
    main: mainSha,
    release,
    live,
    liveBasis,
    sites,
    sitesDisagree,
    // Every learner site's published deploy was read. Without it, "up to date" is not claimed
    // and a waiting count is a minimum (an unread site may be further behind).
    liveComplete: served.length === SITE_KEYS.length,
    // release has moved but no site serves it yet: a publish is building, or its build failed.
    releaseUnserved: Boolean(release && served.length && !served.includes(release)),
    mainChecks,
    waiting,
    train: {
      workflowUrl: `https://github.com/${REPO}/actions/workflows/${TRAIN_WORKFLOW}`,
      nextSlot: new Date(nextTrainSlot(nowMs)).toISOString(),
      lastRun,
    },
    // Ledger mode (ADR-003): sign-offs never merge to main; ledger-publish rebuilds the sites
    // for them on its own, so a sign-off is not a "waiting change" here.
    ledgerMode,
    gaps,
  };
  return { ...status, headline: releaseHeadline(status) };
}

export function createHandler({
  fetchImpl = globalThis.fetch,
  getEnv = key => globalThis.Netlify?.env?.get(key) || '',
  now = Date.now,
} = {}) {
  return async function releaseStatus(request) {
    if (request?.method !== 'GET') return json(405, { state: 'unavailable' });
    const requestUrl = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== requestUrl.origin) return json(403, { state: 'unavailable' });
    const facultyKey = getEnv('FACULTY_ATTEST_PASSWORD');
    if (!facultyKey) return json(503, { state: 'unavailable' });
    if (!sameKey(request.headers.get('x-faculty-key'), facultyKey)) {
      return json(401, { state: 'unavailable' });
    }
    try {
      const ledgerMode = getEnv('ATTEST_LEDGER').trim().toLowerCase() === 'on';
      return json(200, await loadReleaseStatus(fetchImpl, getEnv('GITHUB_TOKEN'), { now, ledgerMode }));
    } catch {
      return json(503, {
        state: 'unavailable',
        message: 'Release status is unavailable: main could not be read.',
      });
    }
  };
}

export default createHandler();

export const config = { path: '/api/release-status' };
