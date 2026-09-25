// Scheduled every 10 minutes (faculty-console/netlify.toml). Rebuilds a learner site once the
// attestation ledger has been quiet for a publish window and the site is serving an older seq.
// A no-op until ATTEST_LEDGER=on and LEDGER_BUILD_HOOKS are set. Not reachable by URL — Netlify
// never exposes a scheduled function over HTTP; the console's "Publish now" calls the same
// module from the authenticated /api/attest handler instead. See ADR-003.

import { runScheduledPublish } from '../../ledger-publish.mjs';

export default async function ledgerPublish() {
  const report = await runScheduledPublish({ env: process.env, fetchImpl: globalThis.fetch, now: Date.now() });
  // One JSON line per tick in the function log: what the ledger head was, what each site
  // served, and whether a hook fired — enough to answer "why is my sign-off not live yet".
  console.log(JSON.stringify({ ledgerPublish: report }));
}
