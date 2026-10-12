# Native Care directory search

Josh approved implementation and normal merge of a native Care search including
aftercare and Resource Finder's seven community categories. This is a public
directory, not a recommendation engine or availability check.

## Boundaries

- `fd_care_search.js` owns the model, rendering and controller. Query, category,
  region and page live only in its closure; leaving Care clears the visit.
- `fd_care.js` adds the panel before the existing navigator. `spa_index.html`
  mounts it after base render, with a persistent polite live region. Typing only
  patches results and never calls `fdWire.apply`, history or storage.
- One fixed `/care-directory.v1.json` Netlify proxy reads the versioned public
  ReConnect projection. No search parameters, cookies or referrer are sent by
  the client. Existing CSP and governed Safety sources are unchanged.
- Five results per page, labelled native selects, visible keyboard focus,
  small-screen reflow, recorded verification dates and safe Call/Text/Website
  links. Existing canonical Finder, handout and QR links stay unchanged.
- Loading, partial coverage, empty results, stale snapshot and failed load are
  explicit. Retrying and opening the full Finder remain available.

## Execution ledger

- [x] Initial model/security regressions written and seen failing.
- [x] Pure model, rendering and visit controller implemented.
- [ ] Both-site integration, source tests and private builds.
- [ ] Desktop/320px/390px browser regression and independent safety/a11y review.
- [ ] Final-head gates, scoped PR, normal merge and release/preview evidence.

ReConnect owns the feed and generates it before each release. No canonical data,
clinical review receipt, curriculum attestation or saved learner progress changes.
Do not import the unmerged Library reconciliation branch; its shared-file changes
remain independently owned.
