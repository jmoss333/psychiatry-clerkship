/* The console's content universe — the exact set of learner-facing pages and tools
   that exist on a deployed site and are therefore reviewable here.

   WHY THIS MODULE EXISTS: until 2026-09 the console derived that set from
   site_manifest.json alone. In July 2026 the Case-of-the-Week pipeline made
   08_Cases_and_Simulation/case-of-the-week/cotw_registry.json a SECOND source of truth:
   build_deploy.py appends registry-derived MS3 pages to its `md` list and
   resident_section.py appends the resident twins, neither of which touches the manifest.
   The console kept reading only the manifest, so all 22 built Case-of-the-Week pages
   (11 weeks x ms3/res) were invisible to attestation — every one of them sat at
   status "pending" in reviewed.json with no way to reach it. This module makes the two
   builds and the console derive the same universe from the same two files, and
   check_pending_visible.mjs turns "every pending item is reachable" into a CI invariant.

   Pure and dependency-free (same posture as review-model.mjs / qbank-rules.mjs): it
   throws TypeError on malformed input and lets callers map that onto their own error
   surface — attest.mjs turns it into the repository_file_invalid 502 that requireManifest
   already uses for a corrupt manifest. */

// Slug shape produced by _cotw_slug() in build_deploy.py and resident_section.py.
const COTW_SLUG_PATTERN = /^cotw_(\d{8})_([a-z0-9-]+)_(ms3|res)\.md$/;
const COTW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COTW_TOPIC_PATTERN = /^[a-z0-9-]+$/;
const SITES = new Set(['ms3', 'res']);
const LEVEL_TITLES = Object.freeze({ ms3: 'MS3', res: 'Resident' });

/* Pending items that are deliberately NOT reachable in the console, listed here so the
   exclusion is a visible decision rather than a silent gap. Both are `_prototypes/`
   role-play tools: they ship on no learner site, and their reviewed.json reason says
   they await COMPLETION, not review. check_pending_visible.mjs both honours this list
   and asserts every entry on it is genuinely outside the universe, so an item that
   later starts shipping cannot be masked by a stale allowlist entry. */
export const NOT_REVIEWABLE_IN_CONSOLE = Object.freeze([
  'rp-agitation.html',
  'rp-brief-psych.html',
]);

const clean = value => (typeof value === 'string' ? value.trim() : '');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function invalid(message) {
  throw new TypeError(message);
}

/* Byte-identical to _cotw_slug() in 13_Faculty_Resources/_automation/site_build/build_deploy.py
   and resident_section.py:

     def _cotw_slug(w,level): return "cotw_%s_%s_%s.md"%(w["date"].replace("-",""),w["topic"],level)

   Python's str.replace with no count replaces EVERY hyphen, hence the /g flag. A parity
   test (faculty-console/content-universe.test.mjs) extracts that Python expression from
   build_deploy.py and runs it over the real registry, so the two cannot drift silently. */
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

function manifestEntries(manifest) {
  if (!isRecord(manifest)) invalid('The site manifest is not an object.');
  const markdown = manifest.md ?? [];
  const tools = manifest.tools ?? [];
  if (!Array.isArray(markdown) || !Array.isArray(tools)) invalid('The site manifest md/tools lists are malformed.');
  for (const entry of [...markdown, ...tools]) {
    if (!Array.isArray(entry) || entry.length < 3
        || entry.slice(0, 3).some(value => typeof value !== 'string')) {
      invalid('A site manifest entry is malformed.');
    }
  }
  return { markdown, tools };
}

/* The registry's own contract, mirrored from what the two build scripts require of it:
   a `weeks` list (absent means no weekly cases, exactly as json.load(...).get("weeks",[])
   behaves) whose every entry carries the date, topic and label the slug and title are
   built from. Anything else is repository corruption, not a page to skip: skipping is
   what made this bug invisible for two months. */
function registryWeeks(registry) {
  if (registry === undefined || registry === null) return [];
  if (!isRecord(registry)) invalid('The Case-of-the-Week registry is not an object.');
  if (!Object.hasOwn(registry, 'weeks')) return [];
  const weeks = registry.weeks;
  if (!Array.isArray(weeks)) invalid('The Case-of-the-Week registry weeks list is malformed.');
  for (const week of weeks) {
    if (!isRecord(week)) invalid('A Case-of-the-Week registry week is not an object.');
    if (!clean(week.label)) invalid('A Case-of-the-Week registry week is missing its label.');
    cotwSlug(week, 'ms3');
  }
  return weeks;
}

/* The ordered content universe: manifest pages, manifest tools, then the
   registry-derived Case-of-the-Week twins — the same order the builds assemble them in
   (the registry pages are appended to `md` after the manifest's own entries).
   Ordering is presentational only; normalizeReviewItems re-sorts by type and title. */
export function deriveContentUniverse({ manifest, registry } = {}) {
  const { markdown, tools } = manifestEntries(manifest);
  const items = [];
  for (const [, slug, title] of markdown) {
    items.push({ slug, title, kind: 'page', site: 'ms3' });
  }
  for (const [, slug, title] of tools) {
    items.push({ slug, title, kind: 'tool', site: 'ms3' });
  }
  for (const week of registryWeeks(registry)) {
    const label = clean(week.label);
    for (const level of ['ms3', 'res']) {
      items.push({
        slug: cotwSlug(week, level),
        title: `${label} — ${LEVEL_TITLES[level]}`,
        kind: 'page',
        site: level,
      });
    }
  }
  const seen = new Set();
  for (const item of items) {
    if (!item.slug) invalid('A content item has an empty slug.');
    if (seen.has(item.slug)) invalid(`Duplicate content slug: ${item.slug}`);
    seen.add(item.slug);
  }
  return items;
}

export function contentUniverseSlugs(sources) {
  return new Set(deriveContentUniverse(sources).map(item => item.slug));
}
