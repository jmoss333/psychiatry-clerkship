/**
 * Which audience a Playwright project is pointed at.
 *
 * The suite has always keyed audience off the project name, and until 2026-09-03
 * it did so by comparing against the literal 'nav-res'. #473 then added a second
 * pair of projects — canary-ms3 / canary-res — that run a subset of these same
 * specs against production. Under `canary-res` the literal comparison is false,
 * so every one of those branches silently took the MS3 path while crawling the
 * RESIDENT site. The canary's first run after that merge failed with
 *
 *     Expected: 83   Received: 92
 *
 * on nav-crawl.spec.js:159 — an inventory count for the wrong audience, not a
 * production fault. It read as the library being wrong when the library was fine.
 *
 * Deriving the audience from the name's SUFFIX rather than the whole string
 * makes a third project pair (a staging crawl, a per-PR preview crawl) inherit
 * the correct audience instead of defaulting to MS3, which is the failure mode
 * worth designing out: the wrong answer here is silent and plausible.
 */

/** Audience suffixes, longest first so 'ms3' cannot shadow a future 'res-ms3'. */
const AUDIENCE_BY_SUFFIX = [
  ['-res', 'resident'],
  ['-ms3', 'ms3'],
];

/**
 * @param {string} projectName a Playwright project name, e.g. 'nav-res', 'canary-ms3'
 * @returns {'resident'|'ms3'}
 */
export function projectAudience(projectName) {
  const name = String(projectName ?? '');
  for (const [suffix, audience] of AUDIENCE_BY_SUFFIX) {
    if (name.endsWith(suffix)) return audience;
  }
  // Deliberately explicit rather than defaulting to 'ms3'. A project name that
  // encodes no audience is a configuration mistake, and silently guessing is
  // exactly how the 2026-09-03 canary failure stayed invisible for a merge cycle.
  throw new Error(
    `project name "${name}" encodes no audience; expected a name ending in `
    + AUDIENCE_BY_SUFFIX.map(([suffix]) => `"${suffix}"`).join(' or '),
  );
}

/** @param {string} projectName @returns {boolean} */
export function isResidentProject(projectName) {
  return projectAudience(projectName) === 'resident';
}
