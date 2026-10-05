// The Library's rendered inventory, both views (one-thread redesign, Phase 2, 2026-10-04).
//
// Essentials rows are `.fd-kit__reading[data-fd-open]` -- readings AND tools, since the tool
// tablist was retired and tools became rows in a "Tools" group. The desktop preview pane's own
// "Open reading" / "Open tool" button also carries data-fd-open and is deliberately excluded (it
// is not a row). Everything rows are `.fd-collink[data-fd-open]`; the Everything root is the bare
// `.fd-library` (no `.fd-kit`).
const ESSENTIALS_RESOURCE_SELECTOR = '.fd-library.fd-kit .fd-kit__reading[data-fd-open]';
const EVERYTHING_RESOURCE_SELECTOR = '.fd-library:not(.fd-kit) .fd-collink[data-fd-open]';

export function essentialsResources(page) {
  return page.locator(ESSENTIALS_RESOURCE_SELECTOR);
}

export function essentialsResourceRefs(page) {
  return essentialsResources(page).evaluateAll(nodes => nodes.map(node => node.dataset.fdOpen));
}

export function everythingResources(page) {
  return page.locator(EVERYTHING_RESOURCE_SELECTOR);
}

export function everythingResourceRefs(page) {
  return everythingResources(page).evaluateAll(nodes => nodes.map(node => node.dataset.fdOpen));
}

/* The inventory criterion (spec section 2, Phase 2 acceptance): every page shipped_pages.json
   lists for a site is in Everything exactly once, or is deliberately excluded by
   curriculum.libraryExclude, or is search-only (a case-of-the-week page that has no column).
   `shipped` is the site's slug list, `excluded` curriculum.libraryExclude refs, `searchOnly`
   the search-only slugs (the served FD_CURRICULUM.searchResources minus the column placements). */
export function auditEverything(refs, { shipped, excluded, searchOnly }) {
  const seen = new Set();
  const duplicates = refs.filter(ref => { if (seen.has(ref)) return true; seen.add(ref); return false; });
  const notShipped = refs.filter(ref => !shipped.includes(ref));
  const unreachable = shipped.filter(slug => !seen.has(slug) && !excluded.has(slug) && !searchOnly.has(slug));
  return { duplicates, notShipped, unreachable };
}
