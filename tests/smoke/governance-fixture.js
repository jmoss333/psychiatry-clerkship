/**
 * A fixed faculty-governance state for screenshot baselines.
 *
 * CLAUDE.md: "A test may not depend on live governance state." The visual baselines broke that
 * rule without asserting anything about governance: every archetype renders review state, so a
 * faculty sign-off, or a page drifting from its attestation hash, changed the pixels ("Pending
 * review" badges vs "Reviewed by <name> · <date>" receipts). Found in the #833 baseline review
 * (2026-09-26), where today's sign-offs re-opened eight PNGs that no code change had touched.
 *
 * Review state reaches a Front Door page through exactly these channels, all pinned here:
 *   - governance.json (fetched)      the reader's notice: status, reviewer, reviewedAt, reason
 *   - FD_SITE_MANIFEST (inlined)     the {status,riskKind,riskLevel} triplet behind Library,
 *                                    Essentials, Today and search badges
 *   - FD_TOPIC_META (inlined) and
 *     topic_meta.json (fetched)      facultyReview, behind the "✓ faculty-attested" lines
 *   - search-index.json (fetched)    the same triplet on legacy search rows
 * tool-governance.json is not listed: no Front Door surface reads it (tools do, and no visual
 * baseline opens a tool). Anything else carrying review state would be a new channel; the
 * visual spec's own assertion that the pinned receipt renders is what would notice it first.
 *
 * Every item is pinned to REVIEWED by one fixture reviewer on one fixture date. Risk kind and
 * level are left as built: they are content metadata, and a reviewed notice never renders them.
 * Pending, pending-high and drift rendering stay covered where they belong, by the controlled
 * per-case fixtures in front-door.spec.js and governance-warnings.spec.js.
 */

export const VISUAL_REVIEWER = 'Faculty reviewer';
export const VISUAL_REVIEWED_AT = '2026-08-01';

function pinTriplet(triplet) {
  return triplet && typeof triplet === 'object' ? { ...triplet, status: 'reviewed' } : triplet;
}

export function pinGovernanceLedger(ledger) {
  const items = {};
  for (const [ref, entry] of Object.entries(ledger.items || {})) {
    const { reason, warning, ...rest } = entry;
    items[ref] = { ...rest, status: 'reviewed', reviewer: VISUAL_REVIEWER, reviewedAt: VISUAL_REVIEWED_AT };
  }
  return { ...ledger, items };
}

export function pinTopicMeta(topicMeta) {
  const out = {};
  for (const [ref, entry] of Object.entries(topicMeta || {})) {
    out[ref] = entry && typeof entry === 'object' && entry.facultyReview
      ? { ...entry, facultyReview: { ...entry.facultyReview, status: 'reviewed', reviewer: VISUAL_REVIEWER, lastReviewed: VISUAL_REVIEWED_AT } }
      : entry;
  }
  return out;
}

export function pinSearchIndex(index) {
  if (!Array.isArray(index.docs)) return index;
  return { ...index, docs: index.docs.map(doc => (doc.governance ? { ...doc, governance: pinTriplet(doc.governance) } : doc)) };
}

function pinManifest(manifest) {
  const out = { ...manifest };
  for (const key of ['md', 'tools']) {
    if (Array.isArray(out[key])) {
      out[key] = out[key].map(row => (Array.isArray(row) && row.length > 3
        ? [...row.slice(0, 3), pinTriplet(row[3]), ...row.slice(4)] : row));
    }
  }
  return out;
}

// The build inlines these registries as `var NAME=<json>;` inside the shell's script
// (frontdoor_catalog.inject_frontdoor_payload). They are rewritten in the served HTML.
const INLINED = { FD_SITE_MANIFEST: pinManifest, FD_TOPIC_META: pinTopicMeta };

// End of the JSON value starting at `start`: a string-aware bracket scan, because the inlined
// JSON is followed by more script and JSON.parse needs the exact slice.
function jsonValueEnd(text, start) {
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { if (--depth === 0) return i + 1; }
  }
  throw new Error('unterminated inlined JSON');
}

// Same escaping as frontdoor_catalog._inline_json, so the rewritten script stays inert HTML.
function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Rewrites the inlined registries in one served shell. Throws when a needle is missing or
 * duplicated -- a renamed registry must fail the visual suite, not silently un-pin it.
 */
export function pinShellHtml(html) {
  let text = html;
  for (const [name, pin] of Object.entries(INLINED)) {
    const marker = `var ${name}=`;
    const at = text.indexOf(marker);
    if (at < 0 || text.indexOf(marker, at + 1) >= 0) throw new Error(`governance fixture: ${marker} missing or duplicated`);
    const start = at + marker.length;
    const end = jsonValueEnd(text, start);
    text = text.slice(0, start) + inlineJson(pin(JSON.parse(text.slice(start, end)))) + text.slice(end);
  }
  return text;
}

const PIN_STATE = new WeakMap();

/** What the fixture rewrote on this page: shells and ledgers pinned, and the first error. */
export function governancePinState(page) {
  return PIN_STATE.get(page) || { shells: 0, ledgers: 0, error: null };
}

/**
 * Installs the fixture on a page before it navigates: every shell document and every fetched
 * governance registry is rewritten in flight. Call before page.goto. A shell the fixture cannot
 * pin is aborted and recorded, so the test fails instead of baselining live state.
 */
export async function pinVisualGovernance(page) {
  const state = { shells: 0, ledgers: 0, error: null };
  PIN_STATE.set(page, state);
  await page.route('**/*', async route => {
    const request = route.request();
    if (request.resourceType() !== 'document' || request.frame() !== page.mainFrame()) return route.fallback();
    const response = await route.fetch();
    const type = response.headers()['content-type'] || '';
    if (!response.ok() || !type.includes('text/html')) return route.fulfill({ response });
    try {
      const body = pinShellHtml(await response.text());
      state.shells++;
      return route.fulfill({ response, body });
    } catch (error) {
      state.error = state.error || String(error && error.message || error);
      return route.abort();
    }
  });
  const rewrite = (pattern, pin, counted) => page.route(pattern, async route => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    if (counted) state.ledgers++;
    return route.fulfill({ response, json: pin(await response.json()) });
  });
  await rewrite('**/governance.json', pinGovernanceLedger, true);
  await rewrite('**/topic_meta.json', pinTopicMeta, false);
  await rewrite('**/search-index.json', pinSearchIndex, false);
}
