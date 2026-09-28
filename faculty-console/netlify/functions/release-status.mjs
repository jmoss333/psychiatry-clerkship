// Read-only: what the learner sites serve, what is merged to main but not live yet, and when
// the release train next publishes. Judgement lives in ../../release-status.mjs; this file
// only reads. Every read that fails becomes a named gap in the payload, never a zero.
import {
  checksVerdict,
  failedStage,
  pushedDuring,
  failedTrainRuns,
  TRAIN_WEEK_DAYS,
  trainWeek,
  firstParentChain,
  nextTrainSlot,
  releaseHeadline,
  SITE_KEYS,
  staleSignoffs,
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
// Three scheduled slots a day plus any publish-now presses: 50 covers the 7-day week.
const TRAIN_RUNS_PAGE = 50;
// Failed runs whose failing step is read for the weekly line (one request each).
const STAGE_LOOKUPS = 10;
// Pushes to `release` read per call: a week of slots and presses is well under this.
const PUSH_PAGE = 100;
const RELEASE_BRANCH = 'release';
const SERVED_REVISION_PATH = '/tool-governance.json';
const SERVED_MAX_BYTES = 4 * 1024 * 1024;
const SERVED_GOVERNANCE_PATH = '/governance.json';
// The `site` each learner build writes into its /governance.json (build_deploy.py and
// build_resident.py call surface_governance.build_site_document with these).
export const GOVERNANCE_SITE = Object.freeze({ ms3: 'ms3', res: 'resident' });

async function servedJson(fetchImpl, site, path, what) {
  const response = await fetchImpl(`${String(site.baseUrl).replace(/\/+$/, '')}${path}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${what} answered ${response.status}`);
  const type = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/json') throw new Error(`${what} is not JSON`);
  const text = await response.text();
  if (text.length > SERVED_MAX_BYTES) throw new Error(`${what} too large`);
  return JSON.parse(text);
}

/**
 * What a learner site serves as its governance: the /governance.json every build emits
 * (surface_governance.write_site_document), whose pending items carry the reason a learner
 * sees. Read with no credential by both the console and the watch. A document for another
 * site, or one with no items, is unread rather than clean.
 */
export async function readServedGovernance(fetchImpl, site, key) {
  const data = await servedJson(fetchImpl, site, SERVED_GOVERNANCE_PATH, 'served governance');
  const items = data?.items;
  if (data?.site !== GOVERNANCE_SITE[key] || !items || typeof items !== 'object' || Array.isArray(items)
    || !Object.keys(items).length) {
    throw new Error('served governance is not this site\'s document');
  }
  return data;
}

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
    const data = await servedJson(fetchImpl, site, SERVED_REVISION_PATH, 'served manifest');
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
      // Read beside the revision, never as a gap: the sign-off line is information, and an
      // unread site is named in it rather than counted as clean.
      const governance = readServedGovernance(fetchImpl, sites[key], key).catch(() => null);
      try {
        return [key, await readSite(sites[key]), await governance];
      } catch (error) {
        note(`${key} ${readSite.basis === 'served revisions' ? 'served revision' : 'published deploy'}`, error);
        return [key, null, await governance];
      }
    }))),
    github('/git/ref/heads/release'),
    github(`/commits/${mainSha}/check-runs?per_page=100`),
    github(`/actions/workflows/${TRAIN_WORKFLOW}/runs?per_page=${TRAIN_RUNS_PAGE}`),
  ]);

  const sites = Object.fromEntries(SITE_KEYS.map(key => [key, null]));
  const governance = Object.fromEntries(SITE_KEYS.map(key => [key, null]));
  if (sitesResult.status === 'fulfilled') {
    for (const [key, site, served] of sitesResult.value) {
      sites[key] = site;
      governance[key] = served;
    }
  } else note('learner site configuration', sitesResult.reason);

  const release = releaseResult.status === 'fulfilled' && SHA.test(releaseResult.value?.object?.sha || '')
    ? releaseResult.value.object.sha : null;
  if (!release) note('release branch', releaseResult.reason || 'unreadable');

  let mainChecks = null;
  if (checksResult.status === 'fulfilled' && Array.isArray(checksResult.value?.check_runs)) {
    mainChecks = checksVerdict(checksResult.value.check_runs);
  } else note("main's required checks", checksResult.reason || 'unreadable');

  let lastRun = null;
  let failedRuns = null;
  let week = null;
  if (runsResult.status === 'fulfilled' && Array.isArray(runsResult.value?.workflow_runs)) {
    const runs = runsResult.value.workflow_runs.map(run => ({
      id: run.id,
      at: run.run_started_at || run.created_at,
      endedAt: run.status === 'completed' ? run.updated_at : null,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      url: /^https:\/\/github\.com\//.test(run.html_url || '') ? run.html_url : null,
    }));
    lastRun = runs[0] || null;
    // Every run in the lookback, not only the newest: a held 15:05 run that a green 21:05
    // run follows would otherwise be overwritten before the daily watch ever saw it.
    const window = failedTrainRuns(runs, nowMs);
    failedRuns = window.failed;
    if (runs.length >= TRAIN_RUNS_PAGE && !window.coveredWindow) {
      note('release-train runs', `more than ${TRAIN_RUNS_PAGE} in the lookback; older runs unread`);
    }
    // The weekly line: which step each failed run of the week stopped at. Best effort -- an
    // unread step counts as unclassified in the line and is never a gap, because the line is
    // information, not a verdict.
    const weekSince = nowMs - TRAIN_WEEK_DAYS * 86_400_000;
    const failedThisWeek = runs.filter(run => Date.parse(run.at) >= weekSince && run.status === 'completed'
      && run.conclusion && !['success', 'skipped', 'neutral'].includes(run.conclusion) && Number.isSafeInteger(run.id))
      .slice(0, STAGE_LOOKUPS);
    // Pushes to `release` this week, to tell a promote-step failure that published from one
    // that did not. Unreadable → null, and such runs stay unclassified.
    let pushes = null;
    if (failedThisWeek.length) {
      try {
        const activity = await github(`/activity?ref=refs%2Fheads%2F${RELEASE_BRANCH}&activity_type=push&per_page=${PUSH_PAGE}`);
        if (Array.isArray(activity)) {
          pushes = {
            times: activity.map(item => Date.parse(item?.timestamp)).filter(Number.isFinite),
            complete: activity.length < PUSH_PAGE,
          };
        }
      } catch { /* pushes stays null */ }
    }
    const stages = Object.fromEntries(await Promise.all(failedThisWeek.map(async run => {
      try {
        const body = await github(`/actions/runs/${run.id}/jobs`);
        return [run.id, failedStage(body?.jobs, pushedDuring(pushes, run))];
      } catch {
        return [run.id, 'unknown'];
      }
    })));
    week = trainWeek(runs, nowMs, stages);
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
    signoffs: staleSignoffs(governance),
    train: {
      workflowUrl: `https://github.com/${REPO}/actions/workflows/${TRAIN_WORKFLOW}`,
      nextSlot: new Date(nextTrainSlot(nowMs)).toISOString(),
      lastRun,
      failedRuns,
      week,
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
