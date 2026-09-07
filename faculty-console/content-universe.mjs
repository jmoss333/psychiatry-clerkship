/* The console's content universe — the exact set of learner-facing pages and tools
   that exist on a deployed site and are therefore reviewable here.

   WHY THIS MODULE EXISTS: until 2026-09 the console derived that set from
   site_manifest.json alone. In July 2026 the Case-of-the-Week pipeline made
   08_Cases_and_Simulation/case-of-the-week/cotw_registry.json a SECOND source of truth:
   build_deploy.py appends registry-derived MS3 pages to its `md` list and
   resident_section.py appends the resident twins, neither of which touches the manifest.
   The console kept reading only the manifest, so all 22 built Case-of-the-Week pages
   (11 weeks x ms3/res) were invisible to attestation — every one of them sat at status
   "pending" in reviewed.json with no way to reach it (#517).

   WHAT CHANGED WITH ADR-002: #517 taught this module to read the second source. That was
   still a vigilance control — the next producer added would reopen the same hole — and
   there turned out to be three more producers already, not one. The universe now comes
   from ONE derived, tracked file, 13_Faculty_Resources/_automation/site_build/
   shipped_pages.json, which site_build/shipped_pages.py regenerates from every producer
   and which build_and_check.sh verifies against the REAL build output on every build.
   A producer this module has never heard of can no longer go missing from the universe
   without the build going red.

   Pure and dependency-free (same posture as review-model.mjs / qbank-rules.mjs): it
   throws TypeError on malformed input and lets callers map that onto their own error
   surface — attest.mjs turns it into the repository_file_invalid 502 that requireManifest
   already uses for a corrupt manifest. */

// Slug shape produced by cotw_slug() in 13_Faculty_Resources/_automation/site_build/cotw_slug.py.
const COTW_SLUG_PATTERN = /^cotw_(\d{8})_([a-z0-9-]+)_(ms3|res)\.md$/;
const COTW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COTW_TOPIC_PATTERN = /^[a-z0-9-]+$/;
const SITES = new Set(['ms3', 'res']);
const KINDS = new Set(['page', 'tool']);

/* Pending items that are deliberately NOT reachable in the console, listed here so the
   exclusion is a visible decision rather than a silent gap. check_pending_visible.mjs
   both honours this list and asserts every entry on it is genuinely outside the
   universe, so an item that later starts shipping cannot be masked by a stale entry.

   EMPTY SINCE ADR-002, and that emptiness is a finding rather than a tidy-up. The list
   held 'rp-agitation.html' and 'rp-brief-psych.html' on the stated grounds that they
   "ship on no learner site". They do: resident_section.py copies all three rp-* prototype
   tools into _build/res/tools/ on every resident deploy, and `ls _build/res/tools/`
   shows them. Deriving the universe from shipped_pages.json — which is checked against
   the real build output — surfaced that at once, as the stale-exclusion failure this
   list's own assertion exists to raise. CLAUDE.md is explicit that the list "is only for
   items that are not deployed on any learner site", so the two entries came out rather
   than the invariant being bent around them. Both are pending in reviewed.json and are
   now reachable for faculty attestation like everything else that ships.

   The list and its machinery stay: a genuinely undeployed pending item may need it
   again, and every future entry needs its reason written into this comment. */
export const NOT_REVIEWABLE_IN_CONSOLE = Object.freeze([]);

const clean = value => (typeof value === 'string' ? value.trim() : '');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function invalid(message) {
  throw new TypeError(message);
}

/* Byte-identical to cotw_slug() in 13_Faculty_Resources/_automation/site_build/cotw_slug.py:

     return "cotw_%s_%s_%s.md" % (week["date"].replace("-", ""), week["topic"], level)

   Python's str.replace with no count replaces EVERY hyphen, hence the /g flag. A parity
   test (faculty-console/content-universe.test.mjs) extracts that Python expression from
   cotw_slug.py and runs it over the real registry, so the two cannot drift silently.
   The Python side is now a single shared module; this is the only remaining copy, and it
   exists only because JavaScript cannot import it. */
export function cotwSlug(week, level) {
  if (!SITES.has(level)) invalid(`Unknown Case-of-the-Week level: ${level}`);
  const date = clean(week?.date);
  const topic = clean(week?.topic);
  if (!COTW_DATE_PATTERN.test(date)) invalid(`Case-of-the-Week week has an invalid date: ${date || '(missing)'}`);
  if (!COTW_TOPIC_PATTERN.test(topic)) invalid(`Case-of-the-Week week has an invalid topic: ${topic || '(missing)'}`);
  return `cotw_${date.replace(/-/g, '')}_${topic}_${level}.md`;
}

/* Twin identity for the MS3/resident pair a single registry week produces. Returns the
   partner slug for a Case-of-the-Week page, or null for anything else. */
export function cotwTwinSlug(slug) {
  const match = COTW_SLUG_PATTERN.exec(clean(slug));
  if (!match) return null;
  const [, date, topic, level] = match;
  return `cotw_${date}_${topic}_${level === 'ms3' ? 'res' : 'ms3'}.md`;
}

export function isCotwSlug(slug) {
  return COTW_SLUG_PATTERN.test(clean(slug));
}

/* shipped_pages.json's contract, mirrored from what shipped_pages.py writes. A malformed
   file is repository corruption, not a list to shorten: a silently short universe is the
   exact failure this module exists to end, so every departure from the shape throws
   rather than skipping the row. */
function shippedPages(shipped) {
  if (!isRecord(shipped)) invalid('shipped_pages.json is not an object.');
  if (shipped.version !== 1) invalid('shipped_pages.json has an unsupported version.');
  const pages = shipped.pages;
  if (!Array.isArray(pages) || !pages.length) invalid('shipped_pages.json has no pages list.');
  return pages.map(page => {
    if (!isRecord(page)) invalid('A shipped_pages.json entry is not an object.');
    const slug = clean(page.slug);
    const title = clean(page.title);
    const kind = clean(page.kind);
    const sites = page.sites;
    if (!slug) invalid('A shipped_pages.json entry has an empty slug.');
    if (!title) invalid(`shipped_pages.json entry ${slug} has no title.`);
    if (!KINDS.has(kind)) invalid(`shipped_pages.json entry ${slug} has an invalid kind.`);
    if (!Array.isArray(sites) || !sites.length || sites.some(site => !SITES.has(site))) {
      invalid(`shipped_pages.json entry ${slug} has invalid sites.`);
    }
    return { slug, title, kind, sites: [...sites] };
  });
}

/* The ordered content universe, straight from the one derived listing of what ships.

   `site` is the ONE deployment the console previews an item against: 'res' for an item
   only the resident site publishes, 'ms3' otherwise — the MS3 site serves everything
   shared, and the resident build inherits it through resident_section.py's copytree.
   Items keep shipped_pages.json's order, which is by slug; ordering is presentational
   only, since normalizeReviewItems re-sorts by type and title. */
export function deriveContentUniverse({ shipped } = {}) {
  const items = shippedPages(shipped).map(({ slug, title, kind, sites }) => ({
    slug,
    title,
    kind,
    site: sites.length === 1 && sites[0] === 'res' ? 'res' : 'ms3',
  }));
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.slug)) invalid(`Duplicate content slug: ${item.slug}`);
    seen.add(item.slug);
  }
  return items;
}

export function contentUniverseSlugs(sources) {
  return new Set(deriveContentUniverse(sources).map(item => item.slug));
}
