# Tools and the Front Door

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The learner shell both sites run (`fd_*.js`, The Essentials, the CSS class inventory), the feedback banner, single-file tool conventions, the `cw-frame` contract, storage namespaces and analytics counters.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### The Front Door and The Essentials — [gate: tests/fd-library.test.mjs; tests/fd-wire.test.mjs; tests/fd-action-contract.test.mjs; tests/smoke/front-door.spec.js]
- `site_build/frontdoor/` — **the Front Door: the learner shell both sites run.** Twenty `fd_*.js`
  modules plus `frontdoor.css`, assembled into `site_build/spa_index.html` at build time. The
  modules are the surfaces: `fd_today.js` (the Today landing page and its one primary action),
  `fd_library.js` (the Library and **The Essentials**), `fd_reader.js`, `fd_search.js`,
  `fd_path.js` + `fd_edition_*.js` (rotation weeks and curator editions), `fd_wire.js` (the
  controller that binds them), `fd_state.js` (`cw_*` / `rp_*` storage). Everything else is
  support. **The Essentials** (shipped 2026-09-19→21 across #706 #713 #716 #717 #719) is a
  readings-first view of the Library: a section index, a `This week · N` filter that follows the
  active Path including curator editions, and selectable tool preview cards sharing one
  description/action pane. Selection is **transient** — it is not persisted, not in the URL, and
  a new filter must not change that. Contracts: `tests/fd-library.test.mjs`,
  `fd-edition-project.test.mjs`, `fd-action-contract.test.mjs`, `fd-wire.test.mjs`, and the
  browser suite `tests/smoke/front-door.spec.js` with its `essentials-inventory.js` helper.
  **`docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` is the CSS contract** — 335
  `fd-*` selectors and 22 `is-*` state classes, with the load-bearing nesting and the traps called
  out per surface. It is a **human** contract, not a gate: nothing fails a build when markup
  misses a rule, the page just renders wrong while tests stay green. Read the surface's entry
  before writing its markup, and update the inventory in the same PR that changes the stylesheet —
  every recent Front Door PR does.

### The active-testing feedback channel is a pilot surface — [gate: tests/fd-today.test.mjs; tests/feedback-form.test.mjs]
- `13_Faculty_Resources/Feedback/feedback.html` + the Today banner in `fd_today.js` — the
  **active-testing feedback channel** (#726, 2026-09-21): an audience-neutral banner inviting
  trainee feedback during site testing, routed to the private form with page context prefilled.
  Contact is optional; the **no-PHI** rule and the "this is not the official rotation evaluation"
  boundary are load-bearing, not copy. It is a *pilot* surface: when testing ends, retiring the
  banner is a deliberate edit, not something that expires on its own. Pinned by
  `tests/fd-today.test.mjs` and `tests/feedback-form.test.mjs`.

### localStorage keys are namespaced `cw_*` or `rp_*` — [gate: 13_Faculty_Resources/_automation/site_build/check-static-site.mjs]
- **localStorage keys must be namespaced `cw_*` (shared hub) or `rp_*` (resident).** The QA gate
  hard-fails any other prefix. Item-id collisions silently corrupt attestation (`cw_qbank_attest_v1`) and SRS state.

### Usage analytics store integers, never events — [gate: 13_Faculty_Resources/_automation/site_build/check-static-site.mjs]
- **Usage analytics store integers, never events.** `metrics/` is a separate Netlify site whose
  one function accepts an allowlisted event key and increments a counter keyed by site + ISO week.
  It stores no IP, user agent, session id, or timestamp finer than the week, and it does not log
  requests. The allowlist is GENERATED from `shipped_pages.json` — regenerate with
  `analytics_events.py --write` after adding a page or a tool step, or the freshness gate fails.
  Cohorts here are 4-10 learners, so reported cells below n=5 are suppressed. Adding a metric is a
  registry edit, never a free-text string: `check-static-site.mjs` hard-fails a computed or
  unlisted `cwAnalytics.record()` argument.

### Clinical tools are single-file HTML; no dose literals — [gate: 13_Faculty_Resources/_automation/site_build/check-static-site.mjs]
- Clinical tools are **single-file HTML** (Clinical Warm palette — build-injected from
  `13_Faculty_Resources/_automation/site_build/clinical-warm.css`). Dose literals
  are banned in `rp-*` / `*-trainer` tools (QA gate).

### A tool frame is content-height by default (`cw-frame`) — [gate: tests/tool-frame.test.mjs]
- **A tool frame is content-height by default.** The shell sizes `<iframe class="toolframe">`
  to the tool document (`fdSizeToolFrame` in `spa_index.html`; `fdToolFrameMode` /
  `fdToolFrameHeight` in `fd_wire.js`) so the page is the only scroll surface. A tool that lays
  itself out against its own viewport — a fixed bottom bar, a sticky panel, a transcript with its
  own scroll — declares `<meta name="cw-frame" content="viewport">` in its `<head>` and keeps the
  viewport-height frame; `tests/tool-frame.test.mjs` pins the set of such tools and
  `tool-expand.spec.js` measures the live frame. Surveyed before the default flipped (2026-09-19):
  no shipped tool sets html/body height or overflow, so the html box is the content height.
