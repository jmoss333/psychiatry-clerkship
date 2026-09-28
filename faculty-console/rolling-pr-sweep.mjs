// The rolling attestation PR, kept open by a schedule rather than by luck.
//
// Every sign-off in the console commits to `attest/pending`, and that branch reaches `main`
// (and so the learner sites) only through ONE open pull request. The console opens that PR
// itself after each write, but deliberately best-effort: an attestation that committed must
// never be reported as failed because a PR call hiccuped (attest.mjs, ensureRollingPullRequest).
// On 2026-09-28 that silence cost a morning: the owner's 08:06 ET re-attestation of the
// Interview Room sat on the branch with no PR, and both learner sites went on showing the
// room as "pending faculty review" on the first day of a rotation until someone noticed.
//
// This module is the backstop. Scheduled every 15 minutes (faculty-console/netlify.toml),
// it asks one question -- does `attest/pending` carry signatures `main` does not? -- and if
// so makes sure the rolling PR exists, reopening it under the console's own title if it was
// closed, and arms GitHub's auto-merge (merge commit, never squash: L4 reads the console's
// author/committer identity off each attestation commit, and a squash would rewrite it).
// A PR whose checks have already passed cannot take auto-merge, so it is merged directly --
// the same outcome auto-merge would have reached. A PR whose checks FAIL is left alone:
// that is a real defect for a person, and the daily delivery check names it.
//
// It never writes a file, never touches `reviewed.json`, and never creates a signature; it
// only moves signatures the owner already made toward the learners. No-op in ledger mode
// (ATTEST_LEDGER=on), where there is no rolling PR. ATTEST_ROLLING_PR_AUTOMERGE=off keeps the
// PR open for a person to merge. Tests: tests/rolling-pr-sweep.test.mjs.

export const GITHUB_API = 'https://api.github.com';
export const DEFAULT_REPO = 'jmoss333/psychiatry-clerkship';
export const DEFAULT_BRANCH = 'attest/pending';
export const DEFAULT_BASE_BRANCH = 'main';
// Identical to the title attest.mjs gives the PR, so a person searching for "the rolling PR"
// finds one thing whichever path opened it (pinned by the test file).
export const ROLLING_PR_TITLE = 'attest: faculty review from the attestation console';
export const ROLLING_PR_BODY = 'Rolling pull request for faculty attestations.\n\n'
  + 'Each sign-off in the console appends a commit here. Opened by the scheduled rolling-PR '
  + 'sweep (faculty-console/rolling-pr-sweep.mjs), which also arms auto-merge with a merge '
  + 'commit: every commit here is authored and committed by the console identity, and a '
  + 'squash would erase that. The console fast-forwards this branch from `main` once it has '
  + 'been merged.';

const TIMEOUT_MS = 12_000;

function readEnv(env, name) {
  const value = env?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

class SweepError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function client({ token, fetchImpl }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'faculty-attest-rolling-pr-sweep',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  return async function call(method, path, body) {
    const url = path.startsWith('https://') ? path : `${GITHUB_API}${path}`;
    const response = await fetchImpl(url, {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error = new SweepError(`github_${response.status}`, response.status);
      error.payload = payload;
      throw error;
    }
    return payload;
  };
}

/** The sweep settings, or a reason it must not run. Never throws. */
export function sweepSettings(env) {
  if (readEnv(env, 'ATTEST_LEDGER').toLowerCase() === 'on') return { skip: 'ledger-mode' };
  const token = readEnv(env, 'GITHUB_TOKEN');
  const repo = readEnv(env, 'GITHUB_REPO') || DEFAULT_REPO;
  const branch = readEnv(env, 'GIT_BRANCH') || DEFAULT_BRANCH;
  const baseBranch = readEnv(env, 'GIT_BASE_BRANCH') || DEFAULT_BASE_BRANCH;
  if (!token) return { skip: 'not-configured' };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return { skip: 'not-configured' };
  if (branch === baseBranch) return { skip: 'not-isolated' };
  const autoMerge = readEnv(env, 'ATTEST_ROLLING_PR_AUTOMERGE').toLowerCase() !== 'off';
  return { token, repo, branch, baseBranch, autoMerge };
}

async function openRollingPullRequests(call, settings) {
  const owner = settings.repo.split('/')[0];
  const query = `head=${encodeURIComponent(`${owner}:${settings.branch}`)}`
    + `&base=${encodeURIComponent(settings.baseBranch)}&state=open`;
  const open = await call('GET', `/repos/${settings.repo}/pulls?${query}`);
  if (!Array.isArray(open)) throw new SweepError('github_response_invalid', 502);
  return open;
}

async function armAutoMerge(call, settings, pr) {
  if (!settings.autoMerge) return 'off';
  if (pr.auto_merge) return 'already-armed';
  if (!pr.node_id) return 'failed:no-node-id';
  const mutation = 'mutation($id: ID!) { enablePullRequestAutoMerge(input: '
    + '{pullRequestId: $id, mergeMethod: MERGE}) { pullRequest { number } } }';
  const result = await call('POST', `${GITHUB_API}/graphql`, { query: mutation, variables: { id: pr.node_id } });
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  if (!errors.length) return 'armed';
  const message = errors.map(e => String(e?.message || '')).join(' ');
  if (!/clean status/i.test(message)) return `failed:${message.slice(0, 120)}`;
  // "Pull request is in clean status": every required check already passed, so auto-merge
  // has nothing to wait for and GitHub refuses it. Merging now is the outcome it would reach.
  const fresh = await call('GET', `/repos/${settings.repo}/pulls/${pr.number}`);
  if (fresh?.mergeable_state !== 'clean') return `waiting:${fresh?.mergeable_state || 'unknown'}`;
  await call('PUT', `/repos/${settings.repo}/pulls/${pr.number}/merge`, {
    merge_method: 'merge',
    sha: fresh.head?.sha,
  });
  return 'merged';
}

/**
 * One tick. Returns a content-free report; never throws (the scheduled function logs it).
 * `action` is one of: skipped | nothing-waiting | pr-open | pr-opened | error.
 */
export async function runRollingPrSweep({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const settings = sweepSettings(env);
  if (settings.skip) return { action: 'skipped', reason: settings.skip };
  if (typeof fetchImpl !== 'function') return { action: 'skipped', reason: 'not-configured' };
  const call = client({ token: settings.token, fetchImpl });
  try {
    let comparison;
    try {
      comparison = await call('GET', `/repos/${settings.repo}/compare/`
        + `${encodeURIComponent(settings.baseBranch)}...${encodeURIComponent(settings.branch)}`);
    } catch (error) {
      // No attestation branch yet: the console creates it on the next sign-off.
      if (error instanceof SweepError && error.status === 404) return { action: 'nothing-waiting', aheadBy: 0 };
      throw error;
    }
    const aheadBy = comparison?.ahead_by;
    if (typeof aheadBy !== 'number') throw new SweepError('github_response_invalid', 502);
    if (aheadBy === 0) return { action: 'nothing-waiting', aheadBy: 0 };

    const open = await openRollingPullRequests(call, settings);
    let pr = open[0];
    let action = 'pr-open';
    if (!pr) {
      try {
        pr = await call('POST', `/repos/${settings.repo}/pulls`, {
          title: ROLLING_PR_TITLE,
          head: settings.branch,
          base: settings.baseBranch,
          body: ROLLING_PR_BODY,
          maintainer_can_modify: true,
        });
        action = 'pr-opened';
      } catch (error) {
        // 422: the console (or a second tick) opened it between the list and the create.
        if (!(error instanceof SweepError && error.status === 422)) throw error;
        pr = (await openRollingPullRequests(call, settings))[0];
        if (!pr) throw error;
      }
    }
    let autoMerge;
    try {
      autoMerge = await armAutoMerge(call, settings, pr);
    } catch (error) {
      autoMerge = `failed:${error?.code || 'error'}`;
    }
    return {
      action,
      aheadBy,
      pullRequest: typeof pr?.html_url === 'string' ? pr.html_url : null,
      autoMerge,
    };
  } catch (error) {
    return { action: 'error', error: error?.code || 'error' };
  }
}
