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
// tests/canary-scope.test.mjs fails if a canary spec reintroduces the exact-name comparison.

const RESIDENT_SUFFIX = '-res';

/** True when `projectName` targets the resident site (mmc-psychiatry-residents-sanford). */
export function isResidentProject(projectName) {
  return typeof projectName === 'string' && projectName.endsWith(RESIDENT_SUFFIX);
}

/** The audience token the learner shell and its storage keys use. */
export function audienceOf(projectName) {
  return isResidentProject(projectName) ? 'resident' : 'ms3';
}
