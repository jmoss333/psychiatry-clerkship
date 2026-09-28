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
 *   signoffs  the pages each site serves as awaiting re-signature (its /governance.json)
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
/**
 * How far back the release-train runs are read. The watch runs once a day; 26 h covers the
 * day's three slots plus the watch's own start-time jitter, so a run is seen at least once
 * (twice at worst, which is the right way round).
 */
export const TRAIN_LOOKBACK_HOURS = 26;
const RUN_OK = new Set(['success', 'skipped', 'neutral']);
/** The trailing window the weekly train line counts over. */
export const TRAIN_WEEK_DAYS = 7;
/** The two steps of production-release-train.yml a failure can sit in -- pinned to it by a test. */
export const TRAIN_PROMOTE_STEP = 'Promote the newest green main commit to release';
export const TRAIN_RECEIPT_STEP = 'Request the production release receipt';

/**
 * Whether `release` was pushed while a run was running, from the repository's push activity
 * on the branch: true, false, or null when that cannot be told (no activity listing, a run
 * with no end time, or a run older than the oldest push a full listing reached).
 */
export function pushedDuring(pushes, run) {
  if (!pushes || !Array.isArray(pushes.times)) return null;
  const start = Date.parse(run?.at);
  const end = Date.parse(run?.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (!pushes.complete && pushes.times.length && start < Math.min(...pushes.times)) return null;
  return pushes.times.some(t => t >= start && t <= end + 60_000);
}

/**
 * Where a failed train run stopped. The receipt step runs only after `release` was pushed,
 * so a failure there is `after` publishing. The promote step pushes `release` and then writes
 * its summary and outputs, so its failure alone does not prove nothing was published (Codex
 * P2 on #867): it is `before` only when no push to `release` happened during the run, `after`
 * when one did, and `unknown` when the push record could not be read.
 */
export function failedStage(jobs, pushed = null) {
  const failed = (Array.isArray(jobs) ? jobs : [])
    .flatMap(job => (Array.isArray(job?.steps) ? job.steps : []))
    .filter(step => step?.conclusion === 'failure')
    .map(step => String(step.name || ''));
  if (failed.includes(TRAIN_RECEIPT_STEP)) return 'after';
  if (failed.includes(TRAIN_PROMOTE_STEP)) return pushed === true ? 'after' : pushed === false ? 'before' : 'unknown';
  return 'unknown';
}

/**
 * The release train's last TRAIN_WEEK_DAYS, counted: how often it ran, published (or had
 * nothing new), stopped before publishing, or failed after. `stages` maps a failed run's id
 * to failedStage(); a run with no entry counts as unclassified. `complete` is false when the
 * listing stopped inside the window, so the counts are minimums.
 */
export function trainWeek(runs, nowMs, stages = {}) {
  const since = nowMs - TRAIN_WEEK_DAYS * 86_400_000;
  const list = Array.isArray(runs) ? runs : [];
  const inWindow = list.filter(run => Date.parse(run?.at) >= since);
  const week = {
    days: TRAIN_WEEK_DAYS, complete: inWindow.length < list.length,
    scheduled: 0, publishNow: 0, ok: 0, before: 0, after: 0, unknown: 0, running: 0,
    // Scheduled runs only: publish-now is never held by cost, so it is no evidence about the budget.
    beforeScheduled: 0,
  };
  for (const run of inWindow) {
    if (run.event === 'workflow_dispatch') week.publishNow += 1;
    else week.scheduled += 1;
    if (run.status !== 'completed' || !run.conclusion) week.running += 1;
    else if (RUN_OK.has(run.conclusion)) week.ok += 1;
    else {
      const stage = ['before', 'after'].includes(stages[run.id]) ? stages[run.id] : 'unknown';
      week[stage] += 1;
      if (stage === 'before' && run.event !== 'workflow_dispatch') week.beforeScheduled += 1;
    }
  }
  return week;
}

/**
 * One line for the week. Informational: it never raises the tone. It names the spend
 * tripwire only when runs stopping before publishing are a pattern (three or more, and at
 * least a third of the scheduled runs), which is the question the owner has to answer.
 */
export function trainWeekLine(week) {
  if (!week) return '';
  const total = week.scheduled + week.publishNow;
  const lead = `${week.complete ? '' : 'At least '}${plural(week.scheduled, 'scheduled run')}${week.publishNow ? ` and ${week.publishNow} publish-now` : ''}`;
  const parts = [
    week.ok && `${week.ok} published or had nothing new`,
    week.before && `${week.before} stopped before publishing (held by the spend tripwire, refused, or could not check)`,
    week.after && `${week.after} failed after publishing`,
    week.unknown && `${week.unknown} failed at an unread step`,
    week.running && `${week.running} still running`,
  ].filter(Boolean);
  let line = `Release train, last ${week.days} days: ${lead}${total ? ` — ${parts.join(', ')}` : ''}.`;
  // Scheduled runs over scheduled runs (Codex P2 on #867): a failed publish-now press is not
  // a hold, since the spend tripwire never holds publish-now.
  if (week.beforeScheduled >= 3 && week.beforeScheduled * 3 >= week.scheduled) {
    line += ' Scheduled runs stopping before publishing are a pattern this week; if the run logs say "HELD by the spend tripwire", the budget in release_train.py may need retuning.';
  }
  return line;
}

/**
 * The completed release-train runs in the lookback that did not succeed, newest first, and
 * whether the listing reached back past the window (runs are newest first, so an entry
 * older than the window proves nothing inside it was cut off).
 */
export function failedTrainRuns(runs, nowMs, hours = TRAIN_LOOKBACK_HOURS) {
  const since = nowMs - hours * 3_600_000;
  const list = Array.isArray(runs) ? runs : [];
  const inWindow = list.filter(run => Date.parse(run?.at) >= since);
  return {
    failed: inWindow.filter(run => run.status === 'completed' && run.conclusion && !RUN_OK.has(run.conclusion)),
    coveredWindow: inWindow.length < list.length,
  };
}

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
 * The reason a learner build gives a drifted attestation: attestation_hash.STALE_REASON,
 * which surface_governance copies into each site's served /governance.json. A test builds
 * that document with the Python modules themselves and reads it back through this pattern,
 * so a reworded reason or a reshaped document breaks the test, not the line.
 */
export const STALE_SIGNOFF_REASON = /^Content changed since faculty review on (\d{4}-\d{2}-\d{2}); awaiting re-attestation\.$/;
/** Pages named in the line before the rest are counted as "+N more". */
export const STALE_SIGNOFF_NAMES = 5;

/**
 * The pages learners are SERVED as awaiting the faculty's re-signature: an item of a site's
 * /governance.json that is pending with the drift reason. A page never signed (pending for
 * any other reason) is not counted -- it is ordinary first review, not a signature the
 * content outgrew. `docs` maps each site key to its served document, or null when it could
 * not be read; an unread site is named, never counted as clean.
 *
 * Why served state and not the ledger: #865 rewrote sp-interview.html under a 2026-09-26
 * signature and the release train published it at 09:05 on 2026-09-28; the drift was in
 * `bin/check_attestation_hashes.py` all along, but nothing said "learners are seeing this
 * as pending now". Information, never a verdict: a drifted page warns, it never unplaces.
 */
export function staleSignoffs(docs) {
  const unread = SITE_KEYS.filter(key => !docs?.[key]);
  const bySlug = new Map();
  for (const key of SITE_KEYS) {
    const items = docs?.[key]?.items;
    if (!items) continue;
    for (const [slug, item] of Object.entries(items)) {
      const match = item?.status === 'pending' && typeof item.reason === 'string'
        ? item.reason.match(STALE_SIGNOFF_REASON) : null;
      if (!match) continue;
      const entry = bySlug.get(slug) || { slug, kind: item.kind === 'tool' ? 'tool' : 'page', signedAt: match[1], sites: [] };
      entry.sites.push(key);
      bySlug.set(slug, entry);
    }
  }
  const items = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return { items, unread, complete: unread.length === 0 };
}

/** One sentence for the panel and the daily watch summary. */
export function staleSignoffLine(signoffs) {
  if (!signoffs) return '';
  const read = SITE_KEYS.filter(key => !signoffs.unread.includes(key));
  if (!read.length) return 'Signatures learners see: neither site\'s governance.json could be read.';
  const unreadNote = signoffs.unread.length
    ? ` ${signoffs.unread.join(', ')} could not be read${signoffs.items.length ? ', so this is a minimum' : ''}.` : '';
  if (!signoffs.items.length) {
    return `No page learners see is awaiting your re-signature${signoffs.unread.length ? ` on ${read.join(', ')}` : ''}.${unreadNote}`;
  }
  const named = signoffs.items.slice(0, STALE_SIGNOFF_NAMES).map(item => {
    const where = item.sites.length < read.length ? ` · ${item.sites.join(', ')} only` : '';
    return `${item.slug} (signed ${item.signedAt}${where})`;
  });
  const more = signoffs.items.length - named.length;
  return `Learners see ${plural(signoffs.items.length, 'page')} as awaiting your re-signature — the content changed after it was signed: `
    + `${named.join(', ')}${more ? `, +${more} more` : ''}. Re-attest under Needs review.${unreadNote}`;
}

/** How long until `slotMs`, for a person: "in 1 h 12 min", "in 45 min", "now". */
export function untilLabel(slotMs, nowMs) {
  const minutes = Math.max(0, Math.round((slotMs - nowMs) / 60_000));
  if (minutes < 1) return 'now';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `in ${hours ? `${hours} h${rest ? ' ' : ''}` : ''}${rest ? `${rest} min` : ''}`;
}

/**
 * The re-signing list: every drifted signature, ordered by when learners are affected.
 *
 *   now      learners are served the page as awaiting re-signature today, and it still needs
 *            yours (drifted in the console's own queue, or a page the console does not list)
 *   next     it needs your re-signature and is not yet live as pending: the change that
 *            drifted it is merged or on its way, so the next publish takes it out unless the
 *            re-signature reaches main first
 *   signed   learners still see it pending, but the console's queue shows it signed: it clears
 *            once that sign-off reaches main and the next publish runs (ledger mode: the
 *            ledger-publish rebuild about 10 minutes after sign-offs go quiet)
 *
 * `drifted` and `known` are the console's content slugs (drifted ones, and all of them);
 * `signoffs` is staleSignoffs() of what each site serves. When a site could not be read,
 * `next` may hold pages that are in fact already live as pending, so the result says it is
 * partial rather than letting `next` read as "not live yet". Information, never a verdict.
 */
export function resignSchedule({ drifted = [], known = [], signoffs = null, nextSlot, nowMs, ledgerMode = false }) {
  const driftedSet = new Set(drifted);
  const knownSet = new Set(known);
  const served = new Map((signoffs?.items || []).map(item => [item.slug, item]));
  const now = [];
  const signed = [];
  for (const [slug, item] of served) {
    if (driftedSet.has(slug) || !knownSet.has(slug)) now.push({ slug, signedAt: item.signedAt });
    else signed.push({ slug, signedAt: item.signedAt });
  }
  const next = [...driftedSet].filter(slug => !served.has(slug)).sort().map(slug => ({ slug }));
  return {
    now, next, signed,
    nextSlot, until: untilLabel(nextSlot, nowMs), ledgerMode: Boolean(ledgerMode),
    complete: Boolean(signoffs && signoffs.complete),
    total: now.length + next.length + signed.length,
  };
}

/** The list's heading: what to do and the deadline the next publish sets. */
export function resignHeading(schedule) {
  const toSign = schedule.now.length + schedule.next.length;
  const at = `${new Date(schedule.nextSlot).toISOString().slice(11, 16)} UTC`;
  if (!schedule.total) return '';
  if (!toSign) {
    return schedule.ledgerMode
      ? 'Every drifted page is signed; learners see them cleared once the ledger publish rebuilds the sites.'
      : `Every drifted page is signed; learners see them cleared after the sign-offs merge and the ${at} publish (${schedule.until}).`;
  }
  return `Re-sign ${plural(toSign, 'page')} before the next publish — ${at}, ${schedule.until}`
    + `${schedule.complete ? '' : ' (a learner site could not be read, so some pages marked "not live yet" may already be)'}.`;
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
  // A red run is not proof that nothing was published: the workflow pushes `release` before
  // it requests the release receipt, and that later step can fail on its own. Whether a
  // publish happened is what the served commits above show; these lines report only runs.
  const kindOf = run => (run.event === 'workflow_dispatch' ? 'publish-now run' : 'scheduled run');
  const last = train?.lastRun;
  const lastFailed = Boolean(last && last.conclusion && !RUN_OK.has(last.conclusion) && last.status === 'completed');
  if (lastFailed) {
    raise('attention');
    lines.push(`The last release-train ${kindOf(last)} (${hhmmUtc(Date.parse(last.at))}) ended in ${last.conclusion} — held by the spend tripwire, refused, or a step after publishing failed; its run log says which.`);
  }
  const earlier = (Array.isArray(train?.failedRuns) ? train.failedRuns : [])
    .filter(run => !(lastFailed && run.at === last.at && run.url === last.url));
  if (earlier.length) {
    raise('attention');
    const list = earlier.map(run => `${hhmmUtc(Date.parse(run.at))} ${kindOf(run)}, ${run.conclusion}`).join('; ');
    lines.push(`${earlier.length === 1 ? 'An earlier release-train run' : `${earlier.length} earlier release-train runs`} in the last ${TRAIN_LOOKBACK_HOURS} h did not succeed (${list}), even if a later run published; the run logs say whether each was held, refused, or failed after publishing.`);
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
