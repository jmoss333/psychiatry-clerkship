#!/usr/bin/env node
// The daily release watch (.github/workflows/maintenance-release-watch.yml).
//
// WHY. The learner sites publish from `release`, which the release train moves three times
// a day, and a held or failed publish is silent unless someone goes looking: on 2026-09-27
// the 09:05 and 15:05 runs were both held and each was found only by digging. This runs the
// faculty console's own release-status reading (faculty-console/release-status.mjs) once a
// day after the morning publish and goes red when it needs the owner, so the failure lands
// in the rolling escalation issue (automation-failure-escalation.yml) like every other
// scheduled job.
//
// Exit codes (watchVerdict): 0 learners current, or merged work waiting on schedule;
// 1 attention -- a held or failed train run, sites serving different commits, `release`
// unserved, main's newest merge failing its checks, merged work waiting over 24 h, or a
// diverged release; 2 could not check -- any unread fact, or a served commit not read from
// both sites. Never 0 over a partial read.
//
// Usage: GITHUB_TOKEN=... node bin/release_watch.mjs [--out receipt.json]
import { appendFileSync, writeFileSync } from 'node:fs';

import { servedRevisionReader, loadReleaseStatus } from '../faculty-console/netlify/functions/release-status.mjs';
import { staleSignoffLine, trainWeekLine, watchVerdict } from '../faculty-console/release-status.mjs';

const REPO_URL = 'https://github.com/jmoss333/psychiatry-clerkship';

export function renderSummary(status, verdict) {
  const label = ['OK', 'ATTENTION', 'COULD NOT CHECK'][verdict];
  const lines = [`## Release watch — ${label}`, '', status.headline.text, ''];
  for (const key of ['ms3', 'res']) {
    const site = status.sites?.[key];
    lines.push(`- ${key}: ${site ? `serves \`${site.commitRef.slice(0, 12)}\`` : 'unread'}`);
  }
  lines.push(`- release branch: ${status.release ? `\`${status.release.slice(0, 12)}\`` : 'unread'}`);
  const changes = status.waiting?.changes || [];
  if (changes.length) {
    lines.push('', `### Merged, not live yet (${status.waiting.complete && status.liveComplete ? '' : 'at least '}${changes.length})`, '');
    for (const change of changes) {
      const ref = change.pr ? `[#${change.pr}](${REPO_URL}/pull/${change.pr})` : `\`${change.sha.slice(0, 7)}\``;
      lines.push(`- ${ref}${change.signoff ? ' **faculty sign-off**' : ''} ${change.title} (merged ${change.at || '?'})`);
    }
  }
  if (status.train?.lastRun) {
    const run = status.train.lastRun;
    lines.push('', `Last release-train run: ${run.at} · ${run.event} · ${run.conclusion || run.status}${run.url ? ` · [log](${run.url})` : ''}`);
  }
  lines.push(`Next scheduled publish: ${status.train.nextSlot} · publish now: ${status.train.workflowUrl}`);
  if (status.train.week) lines.push('', trainWeekLine(status.train.week));
  if (status.signoffs) lines.push('', staleSignoffLine(status.signoffs));
  if (status.gaps.length) lines.push('', '### Could not read', '', ...status.gaps.map(gap => `- ${gap}`));
  return `${lines.join('\n')}\n`;
}

export async function main({ argv = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const outAt = argv.indexOf('--out');
  const out = outAt >= 0 ? argv[outAt + 1] : null;
  let status;
  try {
    status = await loadReleaseStatus(fetchImpl, env.GITHUB_TOKEN || '', {
      now, readSite: servedRevisionReader(fetchImpl),
    });
  } catch (error) {
    // `::error::` is what the escalation issue quotes as the first error line.
    console.log(`::error title=Release watch::could not check: ${error instanceof Error ? error.message : error}`);
    if (out) writeFileSync(out, `${JSON.stringify({ verdict: 2, error: String(error?.message || error) }, null, 2)}\n`);
    return 2;
  }
  const verdict = watchVerdict(status);
  const summary = renderSummary(status, verdict);
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  if (out) writeFileSync(out, `${JSON.stringify({ verdict, ...status }, null, 2)}\n`);
  if (verdict === 1) console.log(`::error title=Release watch::${status.headline.text}`);
  if (verdict === 2) console.log(`::error title=Release watch::could not check: ${status.gaps.join('; ') || status.headline.text}`);
  return verdict;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
