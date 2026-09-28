// Scheduled every 15 minutes (faculty-console/netlify.toml). Makes sure signatures waiting on
// `attest/pending` have an open rolling pull request with auto-merge armed, so a sign-off
// reaches `main` -- and the next release train -- without anyone noticing it first.
// Logic and rationale: ../../rolling-pr-sweep.mjs. Not reachable by URL: Netlify never
// exposes a scheduled function over HTTP.

import { runRollingPrSweep } from '../../rolling-pr-sweep.mjs';

export default async function rollingPrSweep() {
  const report = await runRollingPrSweep({ env: process.env, fetchImpl: globalThis.fetch });
  // One content-free JSON line per tick: enough to answer "why is my sign-off not live yet".
  console.log(JSON.stringify({ rollingPrSweep: report }));
}
