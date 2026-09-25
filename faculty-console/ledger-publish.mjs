/**
 * Publishing the attestation ledger to the learner sites (ADR-003 §2).
 *
 * A sign-off is live the moment it is appended; learners see it after the next build of each
 * site. This module decides WHEN to ask for that build, statelessly, from two facts it can
 * always re-read: the ledger head (seq + time of the last event) and the `ledger-receipt.json`
 * each learner site serves (the seq its current deploy was built with).
 *
 * THE RULE. A site is rebuilt when it serves an older seq than the head AND the ledger has
 * been quiet for one of the publish windows: [10, 20) minutes, [60, 70) minutes or
 * [24 h, 24 h + 10 min) since the last sign-off. The scheduled function ticks every 10
 * minutes, so each window contains one tick. That gives one build per burst of sign-offs,
 * plus two bounded retries if a build failed, and never a loop: at most three builds per
 * site per burst however long the receipt stays behind. "Publish now" (force) skips the
 * windows. A site whose receipt cannot be read is NOT rebuilt by the timer, because a site
 * that serves no receipt is a site the ledger is not switched on for, and rebuilding it
 * would spend a production deploy (15 credits) on nothing. Force still reaches it.
 */

export const TICK_MS = 10 * 60_000;
export const QUIET_MS = 10 * 60_000;
export const PUBLISH_WINDOWS_MS = Object.freeze([QUIET_MS, 60 * 60_000, 24 * 60 * 60_000]);
export const RECEIPT_PATH = '/ledger-receipt.json';
export const SITES = Object.freeze(['ms3', 'res']);
const HOOK_PREFIX = 'https://api.netlify.com/build_hooks/';
const RECEIPT_TIMEOUT_MS = 8_000;
const HOOK_TIMEOUT_MS = 10_000;

/**
 * LEDGER_BUILD_HOOKS → { ms3?: url, res?: url }. Format: `ms3=<url>,res=<url>`. Only Netlify
 * build-hook URLs are accepted: this value is a secret that spends money when called, and a
 * typo that pointed it anywhere else must fail closed rather than POST somewhere surprising.
 */
export function parseHooks(value) {
  const hooks = {};
  for (const part of String(value || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const at = part.indexOf('=');
    const site = part.slice(0, at).trim();
    const url = part.slice(at + 1).trim();
    if (at < 1 || !SITES.includes(site) || !url.startsWith(HOOK_PREFIX) || /\s/.test(url)) {
      throw new Error('LEDGER_BUILD_HOOKS must look like ms3=https://api.netlify.com/build_hooks/…,res=…');
    }
    hooks[site] = url;
  }
  return hooks;
}

/** The head of a ledger from its text, WITHOUT verification — only to decide timing. */
export function lastEventOf(text) {
  const lines = String(text || '').split('\n').filter(Boolean);
  if (!lines.length) return null;
  try {
    const event = JSON.parse(lines.at(-1));
    if (!Number.isSafeInteger(event.seq) || typeof event.ts !== 'string') return null;
    return { seq: event.seq, ts: event.ts };
  } catch {
    return null;
  }
}

/** Pure: which sites to rebuild, and why, for one tick (or one forced publish). */
export function decidePublish({ head, served, now, force = false, sites = SITES }) {
  const decisions = {};
  for (const site of sites) {
    const seq = served?.[site];
    if (!head) {
      decisions[site] = { trigger: false, why: 'the ledger is empty' };
    } else if (Number.isSafeInteger(seq) && seq >= head.seq) {
      decisions[site] = { trigger: false, why: `up to date (serves seq ${seq})` };
    } else if (force) {
      decisions[site] = { trigger: true, why: 'publish requested' };
    } else if (!Number.isSafeInteger(seq)) {
      decisions[site] = { trigger: false, why: 'no readable ledger receipt — is CLERKSHIP_LEDGER=on for this site?' };
    } else {
      const age = now - Date.parse(head.ts);
      const window = PUBLISH_WINDOWS_MS.find(start => age >= start && age < start + TICK_MS);
      decisions[site] = window === undefined
        ? { trigger: false, why: `serves seq ${seq} of ${head.seq}; waiting for a publish window` }
        : { trigger: true, why: `serves seq ${seq} of ${head.seq}; quiet for ${Math.round(age / 60_000)} min` };
    }
  }
  return decisions;
}

async function withTimeout(fetchImpl, url, init, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The seq a learner site's current deploy was built with, or null when unreadable. */
export async function readReceipt(siteUrl, fetchImpl) {
  try {
    const response = await withTimeout(fetchImpl, `${String(siteUrl).replace(/\/+$/, '')}${RECEIPT_PATH}`,
      { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } }, RECEIPT_TIMEOUT_MS);
    if (!response?.ok) return null;
    const receipt = await response.json();
    if (receipt?.schemaVersion !== 1) return null;
    return {
      status: typeof receipt.status === 'string' ? receipt.status : 'unknown',
      seq: Number.isSafeInteger(receipt.seq) ? receipt.seq : null,
      builtAt: typeof receipt.builtAt === 'string' ? receipt.builtAt : null,
    };
  } catch {
    return null;
  }
}

async function triggerHook(url, fetchImpl, title) {
  try {
    const response = await withTimeout(fetchImpl,
      `${url}?trigger_title=${encodeURIComponent(title)}`, { method: 'POST' }, HOOK_TIMEOUT_MS);
    return { ok: Boolean(response?.ok), status: response?.status ?? null };
  } catch {
    return { ok: false, status: null };
  }
}

/**
 * Read both receipts, decide, and call the hooks that should fire.
 * `sites` maps site → { url, hook }. Returns a report; never throws.
 */
export async function publishLedger({ head, sites, fetchImpl, now = Date.now(), force = false }) {
  const names = SITES.filter(site => sites?.[site]?.url);
  const receipts = {};
  await Promise.all(names.map(async (site) => {
    receipts[site] = await readReceipt(sites[site].url, fetchImpl);
  }));
  const served = Object.fromEntries(names.map(site => [site, receipts[site]?.seq ?? null]));
  const decisions = decidePublish({ head, served, now, force, sites: names });
  const report = { head, sites: {} };
  for (const site of names) {
    const decision = decisions[site];
    const entry = { served: served[site], receipt: receipts[site]?.status ?? null, ...decision };
    if (decision.trigger) {
      if (!sites[site].hook) {
        entry.trigger = false;
        entry.why = 'no build hook configured for this site';
      } else {
        entry.hook = await triggerHook(sites[site].hook, fetchImpl, `attestation ledger seq ${head.seq}`);
      }
    }
    report.sites[site] = entry;
  }
  return report;
}

/**
 * The scheduled tick: read the ledger head from GitHub (unverified; the build verifies), then
 * publish. Everything it needs is the console's own environment.
 */
export async function runScheduledPublish({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (String(env.ATTEST_LEDGER || '').trim().toLowerCase() !== 'on') return { skipped: 'ledger mode is off' };
  let hooks;
  try {
    hooks = parseHooks(env.LEDGER_BUILD_HOOKS);
  } catch (error) {
    return { skipped: error.message };
  }
  if (!Object.keys(hooks).length) return { skipped: 'no build hooks configured' };
  const repo = String(env.GITHUB_REPO || 'jmoss333/psychiatry-clerkship').trim();
  const branch = String(env.LEDGER_BRANCH || 'attestations').trim();
  let text;
  try {
    const response = await withTimeout(fetchImpl,
      `https://api.github.com/repos/${repo}/contents/ledger/events.jsonl?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          Accept: 'application/vnd.github.raw+json',
          Authorization: `Bearer ${env.GITHUB_TOKEN || ''}`,
          'User-Agent': 'faculty-attest-ledger-publish',
          'X-GitHub-Api-Version': '2026-03-10',
        },
      }, RECEIPT_TIMEOUT_MS);
    if (response.status === 404) return { skipped: 'no ledger yet' };
    if (!response.ok) return { skipped: `ledger read failed (HTTP ${response.status})` };
    text = await response.text();
  } catch {
    return { skipped: 'ledger read failed' };
  }
  const head = lastEventOf(text);
  const sites = {
    ms3: { url: String(env.STUDENT_SITE_URL || 'https://une-ms3-psychiatry.netlify.app').trim(), hook: hooks.ms3 },
    res: { url: String(env.RESIDENT_SITE_URL || 'https://mmc-psychiatry-residents-sanford.netlify.app').trim(), hook: hooks.res },
  };
  return publishLedger({ head, sites, fetchImpl, now });
}
