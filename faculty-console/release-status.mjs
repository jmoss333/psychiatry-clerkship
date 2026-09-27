/**
 * What learners see, and what they do not see yet — the model behind the console's
 * "What learners see" panel (GET /api/release-status). Pure: no network, no DOM, so the
 * function and the browser share one reading of the facts.
 *
 * WHY. Since 2026-09-25 the two learner sites publish from `release`, not `main`: a merge,
 * and a faculty sign-off that merges with it, reaches learners only when the release train
 * next fast-forwards `release` (production-release-train.yml, three slots a day) or someone
 * presses its publish-now button. On 2026-09-27 five merged PRs sat unpublished behind a
 * held 09:05 run and answering "is it live?" took a string of API calls. This module turns
 * those calls into one sentence and a list.
 *
 * THE FACTS AND WHERE THEY COME FROM (the function reads them; this module only judges):
 *   live      each learner site's latest PUBLISHED production deploy commit (Netlify) — the
 *             ground truth, not the `release` branch, which a failed build can outrun
 *   waiting   main's first-parent commits after the live commit (GitHub compare)
 *   checks    the release train's two required checks on main's head
 *   train     the newest run of the release-train workflow
 * A fact that could not be read is reported as a gap, never as "nothing": zero waiting
 * changes means up to date, so an unread comparison must never render as zero.
 */

/** The release train's cron, `5 9,15,21 * * *` — pinned to the workflow by a test. */
export const TRAIN_SLOTS_UTC = Object.freeze([[9, 5], [15, 5], [21, 5]]);
export const TRAIN_WORKFLOW = 'production-release-train.yml';
/** release_train.py REQUIRED_CHECKS, in order — pinned to it by a test. */
export const REQUIRED_CHECKS = Object.freeze([
  'build-test-validate',
  'Smoke tests (nav crawl · faculty console · LFS · visual)',
]);
/** The branch faculty sign-offs merge from in git mode (check_governance_separation ATTEST_BRANCH). */
export const ATTEST_BRANCH = 'attest/pending';
export const SITE_KEYS = Object.freeze(['ms3', 'res']);
/**
 * Merged work older than this is stuck, not scheduled: three train slots a day means a
 * healthy change reaches learners within eight hours, so a day of waiting is a hold that
 * repeated, a head that stayed red, or a train that stopped running.
 */
export const STALE_WAIT_HOURS = 24;

const SHA = /^[0-9a-f]{40}$/;

/** The next scheduled release-train slot strictly after `nowMs`, as epoch ms. */
export function nextTrainSlot(nowMs) {
  const now = new Date(nowMs);
  for (let day = 0; day < 2; day += 1) {
    for (const [hour, minute] of TRAIN_SLOTS_UTC) {
      const slot = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day, hour, minute);
      if (slot > nowMs) return slot;
    }
  }
  throw new Error('no release-train slot within two days');
}

/**
 * A main commit's subject → { pr, branch, title }. Squash merges end `(#NNN)`; merge
 * commits read `Merge pull request #NNN from owner/branch`. Anything else is a direct push.
 */
export function parseMergeSubject(message) {
  const subject = String(message || '').split('\n', 1)[0].trim();
  const merge = subject.match(/^Merge pull request #(\d+) from [^/\s]+\/(\S+)/);
  if (merge) {
    const body = String(message || '').split('\n').slice(1).map(line => line.trim()).find(Boolean);
    return { pr: Number(merge[1]), branch: merge[2], title: body || subject };
  }
  const squash = subject.match(/^(.*?)\s*\(#(\d+)\)$/);
  if (squash) return { pr: Number(squash[2]), branch: null, title: squash[1] || subject };
  return { pr: null, branch: null, title: subject };
}

/**
 * The first-parent chain from `headSha` back to (not including) `baseSha`, newest first,
 * using the `parents` of the compare API's commits. A compare lists every commit reachable
 * from head and not from base, merged-in branch commits included; the release train
 * promotes first-parent commits only, so that is the unit of "a change waiting".
 * Returns { chain, complete } — complete is false when the walk left the listed commits
 * before reaching base (a truncated compare), so the caller can say "at least".
 */
export function firstParentChain(commits, headSha, baseSha) {
  const bySha = new Map((Array.isArray(commits) ? commits : [])
    .filter(commit => commit && SHA.test(commit.sha || ''))
    .map(commit => [commit.sha, commit]));
  const chain = [];
  let sha = headSha;
  while (sha && sha !== baseSha) {
    const commit = bySha.get(sha);
    if (!commit) return { chain, complete: false };
    chain.push(commit);
    sha = commit.parents?.[0]?.sha || null;
  }
  return { chain, complete: sha === baseSha };
}

/** One waiting change for the panel, from a compare commit. */
export function waitingChange(commit) {
  const message = commit?.commit?.message || '';
  const { pr, branch, title } = parseMergeSubject(message);
  return {
    sha: commit.sha,
    pr,
    title,
    signoff: branch === ATTEST_BRANCH,
    at: commit?.commit?.committer?.date || commit?.commit?.author?.date || null,
  };
}

/**
 * The release train's verdict on one commit, from its check runs — the same rule as
 * release_train.check_conclusions/is_green: the newest run per required name wins, and a
 * missing check is never success.
 *   green    every required check concluded success — the next slot can publish it
 *   running  a required check is missing or has not concluded yet
 *   failing  a required check concluded anything but success — the train walks past it
 */
export function checksVerdict(checkRuns) {
  const newest = new Map();
  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    if (!REQUIRED_CHECKS.includes(run?.name)) continue;
    const started = run.started_at || '';
    if (!newest.has(run.name) || started > newest.get(run.name).started) {
      newest.set(run.name, { started, conclusion: run.conclusion || null });
    }
  }
  const conclusions = Object.fromEntries(REQUIRED_CHECKS.map(name => [name, newest.get(name)?.conclusion ?? null]));
  const values = Object.values(conclusions);
  const verdict = values.every(value => value === 'success') ? 'green'
    : values.some(value => value && value !== 'success') ? 'failing' : 'running';
  return { verdict, conclusions };
}

function hhmmUtc(ms) {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The panel's one-sentence answer, plus a tone: `current` (learners are up to date),
 * `waiting` (merged work is not live yet), `attention` (something the owner should act on:
 * the sites disagree, the last scheduled publish did not go out, main's newest merge failed
 * its checks, or the live commit is not on main at all) or `unknown` (a fact is missing, so
 * no claim is made either way).
 */
export function releaseHeadline(status) {
  const lines = [];
  let tone = 'current';
  const raise = next => {
    const rank = { current: 0, waiting: 1, unknown: 2, attention: 3 };
    if (rank[next] > rank[tone]) tone = next;
  };
  const waiting = status?.waiting;
  if (!waiting || waiting.status === 'unknown') {
    raise('unknown');
    lines.push('Could not tell which merged changes are live — see the gaps below.');
  } else if (waiting.status === 'diverged') {
    raise('attention');
    lines.push('The learner sites serve a commit that is not on main. The release branch needs repair before the train can publish.');
  } else if (!waiting.changes.length && status?.liveComplete === true) {
    lines.push('Learners see everything merged to main.');
  } else if (!waiting.changes.length) {
    // Judged from one site, or from the release branch: an unread site may still serve an
    // older commit after a failed build, so "up to date" is not something this can claim.
    raise('unknown');
    lines.push('Main matches what could be read, but not every learner site\u2019s published deploy could be read, so this does not show that all learners are up to date.');
  } else {
    raise('waiting');
    // An unread site may be further behind than the one compared, so a partial read is a minimum.
    const exact = waiting.complete && status?.liveComplete === true;
    const count = exact ? plural(waiting.changes.length, 'merged change')
      : `At least ${plural(waiting.changes.length, 'merged change')}`;
    const signoffs = waiting.changes.filter(change => change.signoff).length;
    lines.push(`${count}${signoffs ? ` (${plural(signoffs, 'faculty sign-off')})` : ''} ${waiting.changes.length === 1 ? 'is' : 'are'} not live for learners yet.`);
    const now = Date.parse(status?.fetchedAt);
    const oldest = Math.min(...waiting.changes.map(change => Date.parse(change?.at)).filter(Number.isFinite));
    const hours = (now - oldest) / 3_600_000;
    if (Number.isFinite(hours) && hours > STALE_WAIT_HOURS) {
      raise('attention');
      lines.push(`The oldest has waited ${Math.floor(hours)} h, longer than a day of publish slots.`);
    }
  }
  if (status?.sitesDisagree) {
    raise('attention');
    lines.push('The two learner sites serve different commits: one build may have failed.');
  }
  if (status?.releaseUnserved) {
    raise('attention');
    lines.push('The release branch has moved but no learner site serves it yet: a publish is building now, or its build failed.');
  }
  const train = status?.train;
  if (waiting?.changes?.length && train?.nextSlot) {
    const verdict = status?.mainChecks?.verdict;
    const when = `The next scheduled publish is ${hhmmUtc(Date.parse(train.nextSlot))}`;
    if (verdict === 'green') lines.push(`${when}; main's newest merge has passed its checks.`);
    else if (verdict === 'running') lines.push(`${when}; main's newest merge is still being tested, so that run publishes the newest merge that has passed.`);
    else if (verdict === 'failing') {
      raise('attention');
      lines.push(`${when}, but main's newest merge failed its checks — that run publishes only an older, fully green merge.`);
    } else lines.push(`${when}.`);
  }
  const last = train?.lastRun;
  if (last && last.conclusion && last.conclusion !== 'success' && last.status === 'completed') {
    raise('attention');
    // A red run is not proof that nothing was published: the workflow pushes `release` before
    // it requests the release receipt, and that later step can fail on its own. Whether a
    // publish happened is what the served commits above show; this line reports only the run.
    const kind = last.event === 'workflow_dispatch' ? 'publish-now run' : 'scheduled run';
    lines.push(`The last release-train ${kind} (${hhmmUtc(Date.parse(last.at))}) ended in ${last.conclusion} — held by the spend tripwire, refused, or a step after publishing failed; its run log says which.`);
  }
  return { tone, text: lines.join(' ') };
}

/**
 * The daily release watch's exit code (maintenance-release-watch.yml). A red run lands in
 * the rolling escalation issue, so the owner hears about a held or failed publish without
 * digging for it.
 *   1  attention: something the owner should act on (see releaseHeadline)
 *   2  could not check: an unread fact, or a served commit not read from every learner
 *      site. The watch exists to see a failed build, which one unread site can hide, so
 *      a partial read is never a pass.
 *   0  learners are current, or merged work is waiting on schedule
 */
export function watchVerdict(status) {
  const tone = status?.headline?.tone;
  if (tone === 'attention') return 1;
  if (tone !== 'current' && tone !== 'waiting') return 2;
  if (status?.liveComplete !== true || (Array.isArray(status?.gaps) && status.gaps.length)) return 2;
  return 0;
}
