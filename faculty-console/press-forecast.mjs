/* The line a reviewer reads before a many-page press: what the press leaves waiting, and
   whether the open review request will then pass its sign-off check.

   WHY (2026-09-30). The second half used to arrive after the fact, in CI: #895 was refused by
   `bin/check_attestation_hashes.py --strict` because two of its signatures were for text that
   had changed since, and the fix -- one more press -- was only knowable from a log. This says
   it before the click.

   WHERE THE FACTS COME FROM. The server runs that check's own rule (attest.mjs,
   computePressForecast) and sends, per page, whether it is signed in the request, whether its
   signature still binds the text the merge will have (`okNow`), and whether a signature made on
   this press would (`resignOk`) -- page names and yes/no/unknown only, never a hash. This file
   only combines those facts with the ticks and says them in plain words:
     * signed in the request, changed on the branch since   -> tick it to re-sign
     * signed in the request, and main has changed it since -> update the branch first (no press
                                                               here can fix it: a press signs
                                                               the branch's copy)
     * ticked, but main has a newer version                 -> untick it, or update first
     * signed before fingerprints existed and not re-signed -> the check refuses those anywhere
   HONESTY. An older server, a read that failed or ran out of time, or a page it could not
   fingerprint makes the line say it could not tell. It never reads as passing unless every page
   that matters was checked, and it forecasts only the sign-off check: the request's build and
   smoke tests still run, so it says "should pass", never "will land". Pure (no DOM, no network),
   so the phone console can share it. */

const MAX_NAMED = 3;

const list = value => (Array.isArray(value) ? value : []);
const text = value => (typeof value === 'string' ? value : '');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const cap = value => value.charAt(0).toUpperCase() + value.slice(1);

function joinNames(names) {
  const shown = names.slice(0, MAX_NAMED);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** "3 pages", "1 tool", "2 pages and 1 tool" -- by each item's own kind. */
function itemNoun(items) {
  const tools = items.filter(item => item.kind === 'tool').length;
  const pages = items.length - tools;
  return [pages ? plural(pages, 'page', 'pages') : null, tools ? plural(tools, 'tool', 'tools') : null]
    .filter(Boolean).join(' and ');
}

/** "review request #895" from the rolling PR's URL; "the review request" when there is none. */
export function reviewRequestName(url) {
  const match = /\/pull\/(\d+)(?:[/?#]|$)/.exec(text(url));
  return match ? `review request #${match[1]}` : 'the review request';
}

/**
 * The forecast for one press.
 *   sign / excluded  the preview's lists ({ slug, title, kind, was, reason })
 *   chosen           the slugs this press will sign (the ticked ones)
 *   questions        the preview's question lists, or null
 *   forecast         the preview's `forecast`, or undefined from an older server
 *   pullRequestUrl   the rolling review request, when one is open
 * Returns { request, text }, where `request` is 'pass' | 'refused' | 'unknown' | 'none' (no
 * review request in this mode), or null when nothing is ticked and nothing is wrong.
 */
export function pressForecast({ sign, excluded, chosen, questions = null, forecast, pullRequestUrl = null } = {}) {
  const picked = chosen instanceof Set ? chosen : new Set(list(chosen));
  const signList = list(sign).filter(item => item && text(item.slug));
  const leftList = list(excluded).filter(item => item && text(item.slug));
  const pickedItems = signList.filter(item => picked.has(item.slug));
  const questionCount = list(questions?.sign).length;
  const anything = pickedItems.length > 0 || questionCount > 0;

  // ── what the press leaves waiting ──
  let first = 'Nothing is ticked.';
  if (anything) {
    const what = [
      pickedItems.length ? `signing ${itemNoun(pickedItems)}` : null,
      questionCount ? `attesting ${plural(questionCount, 'question', 'questions')}` : null,
    ].filter(Boolean).join(' and ');
    const unticked = signList.filter(item => !picked.has(item.slug));
    const leftQuestions = list(questions?.excluded).length;
    const waiting = [itemNoun([...unticked, ...leftList]), leftQuestions ? plural(leftQuestions, 'question', 'questions') : '']
      .filter(Boolean).join(' and ');
    const why = [
      unticked.length ? `${unticked.length} unticked` : null,
      leftList.length + leftQuestions ? `${leftList.length + leftQuestions} left out; see Left out` : null,
    ].filter(Boolean).join(', ');
    first = waiting
      ? `${cap(what)} leaves ${waiting} still waiting for you (${why}).`
      : `${cap(what)} leaves nothing waiting for you.`;
  }

  // ── the review request ──
  if (forecast && forecast.reviewRequest === false) return anything ? { request: 'none', text: first } : null;
  const request = reviewRequestName(pullRequestUrl);
  const Request = cap(request);
  const base = text(forecast?.baseBranch) || 'main';
  const unknown = detail => ({ request: 'unknown', text: `${first} Whether ${request} will then pass its sign-off check could not be checked${detail}.` });
  if (!forecast || forecast.unknown === true || !isRecord(forecast.pages)) {
    return unknown(forecast?.timedOut ? ' in time' : '');
  }
  if (forecast.catchesUp === true) {
    return {
      request: 'unknown',
      text: `${first} The branch has no sign-offs of its own and is ${plural(Number(forecast.behindBy) || 0, 'change', 'changes')} `
        + `behind ${base}, so this press first brings it up to date and then signs everything that needs you there, `
        + 'which can include pages not listed here.',
    };
  }

  const facts = forecast.pages;
  const titles = new Map([...signList, ...leftList].map(item => [item.slug, text(item.title) || item.slug]));
  const titleOf = slug => text(facts[slug]?.title) || titles.get(slug) || slug;
  const inList = new Set(signList.map(item => item.slug));
  const relevant = [...new Set([
    ...Object.keys(facts).filter(slug => facts[slug]?.inRequest === true),
    ...picked,
  ])].sort();

  const brokenByMain = [];
  const tickToFix = [];
  const cannotSign = [];
  const untick = [];
  const unchecked = [];
  for (const slug of relevant) {
    const fact = facts[slug];
    if (!isRecord(fact)) { unchecked.push(slug); continue; }
    if (picked.has(slug)) {
      // Signed on this press: only whether a signature on the branch's copy binds main's text counts.
      if (fact.resignOk === null || fact.resignOk === undefined) unchecked.push(slug);
      else if (fact.resignOk === false) {
        if (fact.inRequest && fact.okNow === false) brokenByMain.push(slug);
        else untick.push(slug);
      }
      continue;
    }
    // Not signed now: its signature in the request stands or falls as it is.
    if (fact.okNow === null || fact.okNow === undefined) { unchecked.push(slug); continue; }
    if (fact.okNow === true) continue;
    if (fact.resignOk === false) brokenByMain.push(slug);
    else if (inList.has(slug) && fact.resignOk === true) tickToFix.push(slug);
    else if (!inList.has(slug) && fact.resignOk === true) cannotSign.push(slug);
    else unchecked.push(slug);
  }
  const needsUpdate = [...new Set([...brokenByMain, ...list(forecast.conflicts)])].sort();
  const unbound = [...signList, ...leftList].filter(item => item.was === 'unbound' && !picked.has(item.slug));

  const itThem = (names, one, many) => (names.length === 1 ? one : many);
  const reasons = [];
  if (needsUpdate.length) {
    reasons.push(`${base === 'main' ? 'Main' : cap(base)} has changed ${joinNames(needsUpdate.map(titleOf))} since the request was made: `
      + 'on the request\'s GitHub page press "Update branch", then press Check again here.');
  }
  if (tickToFix.length) {
    reasons.push(`${joinNames(tickToFix.map(titleOf))} ${itThem(tickToFix, 'was', 'were')} signed in the request and `
      + `${itThem(tickToFix, 'has', 'have')} changed since: tick ${itThem(tickToFix, 'it', 'them')} to re-sign.`);
  }
  if (cannotSign.length) {
    reasons.push(`${joinNames(cannotSign.map(titleOf))} ${itThem(cannotSign, 'was', 'were')} signed in the request and `
      + `${itThem(cannotSign, 'has', 'have')} changed since, but cannot be signed on this press; see Left out.`);
  }
  if (untick.length) {
    reasons.push(`${base === 'main' ? 'Main' : cap(base)} has a newer version of ${joinNames(untick.map(titleOf))}, so signing `
      + `${itThem(untick, 'it', 'them')} here would be refused: untick ${itThem(untick, 'it', 'them')}, or update the branch first.`);
  }
  if (unbound.length) {
    const inPress = unbound.filter(item => inList.has(item.slug));
    reasons.push(`${joinNames(unbound.map(item => titleOf(item.slug)))} ${itThem(unbound, 'was', 'were')} signed before `
      + `fingerprints existed, and the check refuses that anywhere until ${itThem(unbound, 'it is', 'they are')} re-signed`
      + (inPress.length === unbound.length ? `: tick ${itThem(unbound, 'it', 'them')}.` : '; see Left out.'));
  }

  if (!reasons.length) {
    if (unchecked.length) return unknown(` for ${joinNames(unchecked.map(titleOf))}`);
    if (forecast.partial === true) return unknown(' fully');
    if (!anything) return null;
    return { request: 'pass', text: `${first} ${Request} should then pass its sign-off check.` };
  }
  const tail = unchecked.length ? ` ${joinNames(unchecked.map(titleOf))} could not be checked.` : '';
  return { request: 'refused', text: `${first} ${Request} would still be refused. ${reasons.join(' ')}${tail}` };
}
