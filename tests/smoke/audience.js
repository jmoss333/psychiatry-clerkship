// Which audience is this Playwright project pointed at?
//
// Specs used to answer that with `testInfo.project.name === 'nav-res'`. That was true while
// exactly two projects existed, and it silently broke the moment a third and fourth arrived:
// #473 added canary-ms3/canary-res for the production canary, and on their first live run
// (2026-09-03 09:20 UTC) `canary-res` failed to match 'nav-res', fell through to the MS3
// branch, and asserted the MS3 nav inventory against the resident site:
//
//     Expected: 83   Received: 92
//
// Two red tests that said nothing about production. The audience is a property of the project's
// TARGET, not of one hard-coded name, so derive it from the name's audience suffix and let any
// future `<purpose>-res` / `<purpose>-ms3` pair work without touching a spec.
//
// An unrecognised name THROWS rather than defaulting to 'ms3'. Defaulting is the precise shape
// of the bug above — a name nobody taught the helper about quietly becoming the MS3 answer — so
// a helper that defaults still carries the defect it was written to remove, just one project
// name further away. A name encoding no audience is a configuration mistake, and a loud one is
// cheap: every spec that imports this file runs only under the audience-bearing projects
// (nav-* and canary-*). The five audience-agnostic projects — lfs, visual, interview-room,
// faculty-console, offline — each run a single spec that does not import this module, and
// tests/canary-scope.test.mjs pins that invariant so the throw cannot start firing by accident.
//
// tests/canary-scope.test.mjs also fails if a canary spec reintroduces the exact-name comparison.

/** Audience suffixes, longest first so '-ms3' cannot shadow a future '-res-ms3'. */
const AUDIENCE_BY_SUFFIX = [
  ['-res', 'resident'],
  ['-ms3', 'ms3'],
];

/**
 * The audience token the learner shell and its storage keys use.
 * @param {string} projectName a Playwright project name, e.g. 'nav-res', 'canary-ms3'
 * @returns {'resident'|'ms3'}
 * @throws if the name encodes no audience
 */
export function audienceOf(projectName) {
  const name = String(projectName ?? '');
  for (const [suffix, audience] of AUDIENCE_BY_SUFFIX) {
    if (name.endsWith(suffix)) return audience;
  }
  throw new Error(
    `project name "${name}" encodes no audience; expected a name ending in `
      + AUDIENCE_BY_SUFFIX.map(([suffix]) => `"${suffix}"`).join(' or ')
      + '. If this is an audience-agnostic project (lfs, visual, interview-room, '
      + 'faculty-console, offline), its spec should not be importing audience.js.',
  );
}

/** True when `projectName` targets the resident site (mmc-psychiatry-residents-sanford). */
export function isResidentProject(projectName) {
  return audienceOf(projectName) === 'resident';
}
