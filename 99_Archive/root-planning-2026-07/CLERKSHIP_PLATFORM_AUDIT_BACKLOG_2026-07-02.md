# Psychiatry Clerkship Library / MMC Sanford Psychiatry Platform Audit

Joshua Moss, MD | Psychiatrist
Audit date: 2026-07-02

Scope reviewed:
- `/Users/jm/Psychiatry-Clerkship-Library` - canonical source library/content catalog
- `/Users/jm/clerkship-hub-deploy` - current static deployed teaching site
- `/Users/jm/clerkshipos` - platformization scaffold and buildable monorepo

Constraint honored: this audit does not rewrite clinical content. Clinical, formulary,
legal, and local-policy claims are flagged for verification rather than changed.

## Plain-English Understanding

The current site is useful because students can open one static page, search quickly, and
reach bedside tools without logging in. The main engineering issue is that the working site
is still a hand-assembled static app: one large HTML file, several manually maintained JSON
files, and many standalone HTML tools. That works for one rotation, but it will get fragile
as faculty, residents, tracks, local policy, and multiple hospitals are added.

The safest path is not to rewrite the clinical teaching. It is to add a publishing and
validation layer around it: every page/tool should have structured metadata, attestation
status, audience/track tags, local-policy flags, and automated checks for missing files,
broken links, accessibility basics, and build/test status.

## Executive Summary

### What Is Working Well

- The deployed static site loads successfully under a local HTTP server.
- Search worked in browser testing: searching `catatonia` opened `?page=catatonia.md`.
- Static integrity is strong for the current deploy: 72 nav items, 56 markdown pages, 16
  nav tools, 17 actual tool files, no missing nav targets, no broken local markdown/CTA
  links, and no missing search-index targets.
- The core learner experience is clinically well-shaped for MS3 bedside use: high-yield
  topic cards, "can't miss" sections, quick rule-out prompts, and related tool launchers.
- The tool surface is broad and relevant: MSE, C-SSRS, CIWA/COWS, BFCRS, capacity,
  violence risk, review, shelf simulation, feedback, and learning path.
- The `clerkshipos` monorepo has a real resolver architecture with passing tests after
  dependencies are repaired: `pnpm build`, `pnpm test`, and `pnpm validate` all passed.
- The overlay-resolution engine is the strongest platform asset. It already supports
  inherit, override, extend, append, prepend, hide, pin, and local overlays with provenance.

### What Is Fragile

- The current deploy is a monolithic `index.html` with inline CSS/JS, direct `innerHTML`,
  manual fetches, manually maintained JSON, and iframe-hosted tools.
- The static deployed site has no declared build, lint, or test command.
- `topic_meta.json` covers only 17 of 56 markdown files. That leaves most pages without
  structured reading time, high-yield status, "can't miss" summary, rule-out metadata, quiz,
  CTA, or page-level teaching template.
- `reviewed.json` marks 22 of 72 nav items reviewed. Fifty nav items currently appear
  unreviewed, including several high-risk clinical/legal/protocol pages.
- Tools are standalone single-file React UMD islands. This is pragmatic, but it duplicates
  styling, theme logic, storage patterns, disclaimers, and accessibility risks.
- Mobile layout is readable, but many controls are below the recommended 44 px touch target.
  The floating tools button can overlap lower content on mobile.
- Search input lacks an explicit label. It has a placeholder but no `label`,
  `aria-label`, or `aria-labelledby`.
- Open-state mobile drawer focus is not moved into the drawer or trapped. Closed state does
  correctly set `inert` and `aria-hidden`.
- `marked.parse()` renders markdown into `innerHTML`. With trusted local content this is
  acceptable for a private prototype, but it is not safe once non-technical faculty/admins
  can add content unless sanitization and author controls are added.
- Netlify config uses an absolute local publish path, which is not portable.
- `clerkshipos/apps/web/src/content.ts` is a generated 196 KB bundle containing generated
  nodes and local absolute source references. That blocks clean redistribution.

### What Blocks Scalability

- There are three live layers with overlapping responsibility: source library, deployed
  static site, and `clerkshipos`. The source-of-truth boundary is not enforceable yet.
- There is no automated publisher that takes source content, validates metadata, builds nav,
  builds search, checks local links, checks review status, and deploys.
- Universal teaching and local policy are still mixed in some deployed content/tools.
- Faculty attestation is data but not yet a publish gate.
- Current search is useful but not role-aware. It cannot reliably answer "I am PGY-1 on
  cross-cover, what do I need now?" versus "I am an MS3 preparing for shelf" versus "I am
  faculty running teaching."
- Media accessibility is not yet first-class: the audio/video library lacks a clear
  transcript/caption metadata gate.
- The React platform scaffold is promising, but it is not yet the current production site.

### What Should Be Fixed First

1. Add automated static QA for the deployed site: JSON schema, nav target existence, broken
   local links, search-index target existence, metadata coverage, and review coverage.
2. Create a faculty verification queue and visible publish state for high-risk clinical,
   legal, formulary, protocol, and local-policy claims.
3. Fix immediate mobile/accessibility issues: label search, normalize target sizes, add
   bottom padding for floating tool dock, and improve mobile drawer open-state focus.
4. Define the source-of-truth publishing pipeline from source library to deploy artifacts.
5. Start moving current deploy behavior into `clerkshipos` only after the static QA and
   metadata gates are in place.

## File-Level Audit

Risk levels: Low, Medium, High, Critical.
Effort: S (<1 day), M (1-3 days), L (1-2 weeks), XL (multi-week).

| Path | Purpose | Problems Found | Recommended Changes | Risk | Effort |
|---|---|---|---|---|---|
| `/Users/jm/Psychiatry-Clerkship-Library/` | Canonical source library and content catalog. | Not a git repo. Contains 957 MB of mixed source, deploy specs, raw imports, archives, PDFs, DOCX, HTML tools, audio, and generated audit artifacts. Source-of-truth boundaries are unclear. | Treat as content source, not deploy root. Add publish manifest. Move raw imports and archives behind explicit staging/archive status. Keep PHI guard active. | High | M |
| Numbered source folders `00_START_HERE` through `14_Tracks` | Human-organized curriculum source taxonomy. | Useful taxonomy, but deploy consumes a flattened hand-built subset. Some folders hold `_source`, raw evidence, duplicate generated files, and track overlays together. | Preserve taxonomy but add metadata sidecars or frontmatter for plane, audience, attestation, local-policy flag, license, source, and publish status. | High | L |
| `OPENEVIDENCE RAW FILES TO REVIEW/` | Staging folder for evidence reviews and media. | Raw DOCX/MP4 imports are not clearly separated from publishable, faculty-attested content. | Keep as staging only. Add an incorporation checklist: source, citation, claim extraction, faculty review, no-PHI confirmation, publish target. | High | M |
| `topic_meta.json` in source and deploy | Structured topic teaching metadata. | Only 17 topic entries for 56 deployed markdown files. Uses legacy keys (`read`, `hy`, `cant`) while `clerkshipos` schema uses normalized keys. | Normalize to a single schema; add coverage requirement and metadata validation. | High | M |
| `reviewed.json` in deploy | Faculty attestation map. | 22 reviewed, 50 unreviewed nav items. Faculty tool itself is unreviewed. No schema requiring reviewer/date/status. | Add schema and CI gate. Add clinical-risk category so high-risk unreviewed items are visibly blocked or watermarked. | Critical | M |
| `/Users/jm/clerkship-hub-deploy/index.html` | Current static SPA shell, routing, search, rendering, tool iframe host, progress state. | 66 KB monolith. Inline CSS/JS. Direct `innerHTML`. Manual event handlers. Search input lacks label. Mobile tool dock overlaps content. Open drawer lacks focus management. | Short term: targeted accessibility/mobile fixes. Medium term: split into modules or migrate behavior into `clerkshipos` app. Add sanitizer before broad authoring. | High | M-L |
| `index.html:247-264` | App shell, skip link, drawer, banner, content container. | Good skip link and loading role. Search label absent in sidebar markup. Banner close target is small. | Add visible/visually-hidden label for search; target min-height; ensure content focus after route changes. | Medium | S |
| `index.html:320-327` | Mobile drawer state. | Closed drawer correctly sets `inert`/`aria-hidden`. Open drawer does not move focus into drawer or restore focus on close. | Add focus transfer to search/nav on open, focus trap while open, restore focus to menu button on close. | Medium | S |
| `index.html:350-357` | Markdown and tool rendering. | Tool iframe is straightforward and titled. Markdown uses `marked.parse()` into `innerHTML`; safe only under trusted authoring. | Add DOMPurify or move to typed MDX pipeline before enabling broad editing. | High | M |
| `index.html:400-463` | Search index loading and search behavior. | Search works and no missing index targets were found. Search is not role/audience/facet aware. No tests. | Add static search tests; add section/audience facets; preserve Enter-to-first-result. | Medium | M |
| `index.html:495-510` | Per-page floating related-tool dock. | Useful bedside affordance. On mobile, it can cover lower chips/actions. Role menu semantics are incomplete for disclosure behavior. | Add bottom padding to content when dock mounted; use disclosure button/list semantics or implement full menu keyboard behavior. | Medium | S |
| `nav.json` | Deployed navigation manifest. | All targets exist. One-line JSON is hard to review. Manual maintenance can drift. | Generate from content manifest; validate schema; format with stable ordering. | Medium | S-M |
| `search-index.json` | Deployed search index. | All 72 docs match nav targets. Generation command is not part of deploy repo. No facets. | Generate in CI; include content hash/version; add role/track fields. | Medium | M |
| `content/*.md` | Deployed markdown pages. | All 56 are linked by nav. Many lack structured metadata and reviewed state. Some include legal, protocol, dose, or local-policy claims needing verification. | Add frontmatter or sidecar metadata. Require review state for clinical-risk categories. | High | L |
| `tools/*.html` | Single-file bedside tools. | All have viewport and title. Direct smoke test found no console errors for withdrawal. Tools duplicate theme/storage/disclaimer code. Several targets under 44 px. Some tools include local-policy claims. | Add tool registry metadata; shared tool shell; automated direct tool smoke/a11y checks; local-policy flag. | High | M-L |
| `tools/learning-path.html` | Iframe-only guided path. | Exists but is not nav-listed; likely intentional. Disclaimer heuristic did not detect one. | Add explicit footer/disclaimer and registry entry marking it as iframe-only path surface. | Low | S |
| `audio/`, `audio_oe/` | Audio teaching library. | Large and useful. No transcript/caption/metadata gate identified. Cache headers are reasonable. | Add media manifest with title, topic tags, duration, transcript path, faculty review, license/source. | Medium | M |
| `marked.min.js` | Local markdown parser bundle. | Vendored dependency version/integrity not documented. | Track version/source in a manifest or use package-managed dependency in build pipeline. | Medium | S |
| `_headers` | Netlify static headers. | Good security headers, but CSP requires `unsafe-inline` because app is inline. Cache policy present. | Keep short-term. Long-term externalize scripts/styles and remove `unsafe-inline`. | Medium | M |
| `.netlify/netlify.toml` | Local Netlify config. | Absolute publish path `/Users/jm/clerkship-hub-deploy` is not portable. Security headers are in `_headers`, not mirrored here. | Use repo-relative deploy config or move to source repo; keep headers in one place. | Medium | S |
| `404.html` | Static not-found page. | Minimal and functional. Query-param routing avoids SPA fallback needs. | Optional: add link back to current start page and match house tokens. | Low | S |
| `/Users/jm/clerkshipos/package.json` | Monorepo scripts. | Build/test/validate exist. No lint script. Initial validation failed before schema build. | Add `prevalidate` or make validate depend on schema build. Add lint/typecheck script. | Medium | S |
| `/Users/jm/clerkshipos/.github/workflows/ci.yml` | CI for platform scaffold. | Good: frozen install, schema build, engine test, content validation. Does not build web app. | Add `pnpm build` or `pnpm --filter @clerkshipos/web build` to CI. | Medium | S |
| `packages/core-engine/src/resolve.ts` | Overlay resolution engine. | Strong core. Tests pass. Types allow broad `string` status/type. Local overlay uses placeholder semantics. | Tighten public types against schema enums; add tests for invalid overlay routing and provenance edge cases. | Low-Medium | M |
| `packages/schema/src/index.ts` | Zod schemas for config/content/overlays. | Good foundation. Does not yet encode clinical-risk category, local-policy flag, required review details by risk, media transcripts, or license details enough for publish gates. | Extend schema for `risk`, `verification`, `localPolicy`, `license`, `mediaAccessibility`, `lastReviewed`. | High | M |
| `content-tooling/build-content.mjs` | Generates demo and app content bundles. | Parses a narrow JSON-in-frontmatter subset. Emits giant in-bundle generated `content.ts` with local absolute source references. | Emit JSON artifact and import/load it; scrub or relativize source refs; use robust frontmatter parser. | High | M |
| `content-tooling/validate-content.mjs` | Pack schema validation. | Validates shape but not link targets, absolute local paths, local-policy separation, clinical-risk review gates, or media transcripts. | Expand validation beyond schema shape. | High | M |
| `content-tooling/classify.mjs` | Migration classification. | Useful PHI/local/license heuristics. Hardcoded paths and regex-based classification need review. | Keep as first pass, but require human-reviewed CSV before publishing. | Medium | M |
| `apps/web/src/App.tsx` | React scaffold router and shell. | Minimal hash router. Hardcoded topic route pattern. No error boundary. Tenant is static module. | Add route manifest, error boundary, track selection, and tenant config loader. | Medium | M |
| `apps/web/src/components/Home.tsx` | Mobile-first learner home/search. | Good concept for bedside use. Cards are hardcoded and not driven by nav/roles. | Generate cards from content metadata and track/role priorities. | Medium | M |
| `apps/web/src/components/NodeView.tsx` | Content node renderer. | Good provenance labels and PHI guard. Has hardcoded "Added by MGH"; CTA href currently points `#/` rather than target. Uses `any` for meta. | Make institution label configurable; render real CTA; type meta; add attestation and local-policy badges. | Medium | S-M |
| `apps/web/src/lib/markdown.tsx` | Minimal markdown renderer. | Handles paragraphs and bold only. Not enough for current markdown body, tables, links, lists, callouts, or embedded tools. | Use MDX/remark pipeline or a constrained renderer with sanitization. | Medium | M |
| `apps/web/src/lib/search.ts` | In-bundle search. | Lightweight and offline. No synonyms/facets/ranking tests. | Add tests; include tags/audience/locality/review fields; consider Pagefind for static deploy. | Medium | M |
| `apps/web/src/content.ts` | Generated content bundle. | 196 KB generated source with absolute local paths and link-only references. | Do not commit large generated TS as source long-term; use generated JSON and path scrubber. | High | M |
| `tenants/*` | Tenant-local overlays and local content. | Correct architectural direction. Contains many local/facility materials that need no-PHI, policy, and publication review. | Add tenant-local publish gates and separate internal-only from learner-facing. | High | L |
| `packs/psychiatry-core/` | Future universal psychiatry pack. | Validates 236 nodes. Many are link-only or migrated stubs. | Continue, but do not expose stubs as learner-ready pages until attested and content-complete. | High | L |
| `docs/`, `demo/` in `clerkshipos` | Architecture and proofs of concept. | Useful but can diverge from production. | Keep as reference; promote only one production path. | Low | S |

## Prioritized GitHub-Style Backlog

### Issue 1 - Add static deploy integrity checks

- Priority: P0
- Effort: S-M
- Description: Add a script that validates `nav.json`, `content/`, `tools/`,
  `topic_meta.json`, `reviewed.json`, `search-index.json`, and local links.
- Acceptance criteria:
  - Fails if nav references missing content/tool files.
  - Fails if search-index references missing files.
  - Reports orphan tools/content.
  - Reports metadata and review coverage.
  - Runs in CI or a documented local validation command.
- Files likely involved:
  - `/Users/jm/clerkship-hub-deploy/nav.json`
  - `/Users/jm/clerkship-hub-deploy/search-index.json`
  - `/Users/jm/clerkship-hub-deploy/topic_meta.json`
  - `/Users/jm/clerkship-hub-deploy/reviewed.json`
  - new `scripts/check-static-site.mjs` or equivalent
- Dependencies: none.

### Issue 2 - Make faculty attestation a publish gate for high-risk content

- Priority: P0
- Effort: M
- Description: Convert review status from passive display to a release gate for
  high-risk clinical/legal/formulary/local-policy pages and tools.
- Acceptance criteria:
  - Metadata supports `risk: clinical|legal|formulary|local-policy|general`.
  - High-risk unreviewed pages show a clear "pending faculty verification" state.
  - CI reports high-risk unreviewed files and can fail in production mode.
  - Reviewer, date, and scope are schema-validated.
- Files likely involved:
  - `reviewed.json`
  - `topic_meta.json`
  - `content/*.md`
  - `tools/*.html`
  - `packages/schema/src/index.ts`
  - `content-tooling/validate-content.mjs`
- Dependencies: Issue 1.

### Issue 3 - Fix mobile bedside accessibility quick wins

- Priority: P0
- Effort: S
- Description: Address immediate accessibility and bedside usability issues in the static
  shell without changing clinical content.
- Acceptance criteria:
  - Search has a real label or `aria-label`.
  - Sidebar/nav/banner/tool buttons meet 44 px target height where practical.
  - Floating tool dock does not cover content/actions on mobile.
  - Mobile drawer moves focus into the drawer on open and restores focus on close.
  - Browser smoke test passes on 390 x 844 and 1280 x 720 with no console errors.
- Files likely involved:
  - `index.html`
  - `tools/*.html` selectively for target size patterns
- Dependencies: none.

### Issue 4 - Separate local policy from universal teaching

- Priority: P0
- Effort: M
- Description: Tag and route local MMC/MaineHealth/Sanford policy, protocol, order-set,
  legal workflow, and EHR claims as tenant-local content instead of universal curriculum.
- Acceptance criteria:
  - Local-policy pages/tools have `localPolicy: true` or equivalent.
  - Universal pages do not include local workflow assertions without a local-policy badge.
  - Local claims list owner/reviewer and review date.
  - Student-facing pages point to live EHR/local policy for exact orders/doses.
- Files likely involved:
  - `content/protocol_library.md`
  - `tools/violence.html`
  - `content/ethics_legal.md`
  - `content/pg_suicide.md`
  - `content/evidence_inpatient.md`
  - `tenants/*`
- Dependencies: Issue 2.

### Issue 5 - Complete structured metadata coverage

- Priority: P0
- Effort: M-L
- Description: Expand `topic_meta`/frontmatter coverage from 17/56 markdown pages to all
  learner-facing pages.
- Acceptance criteria:
  - Every nav markdown file has title, audience, section, estimated read time, review risk,
    attestation state, tags, and optional high-yield summary.
  - Search and home views use metadata rather than hardcoded lists.
  - CI reports missing metadata.
- Files likely involved:
  - `topic_meta.json`
  - `content/*.md`
  - `nav.json`
  - `content-tooling/*`
- Dependencies: Issue 1.

### Issue 6 - Add markdown sanitization or controlled MDX rendering

- Priority: P1
- Effort: M
- Description: Prevent unsafe HTML/script injection as soon as content editing expands
  beyond trusted maintainers.
- Acceptance criteria:
  - Markdown output is sanitized before insertion or rendered through a constrained MDX
    pipeline.
  - Tests include malicious markdown fixtures.
  - CSP plan no longer depends on trusting content authors.
- Files likely involved:
  - `index.html`
  - `marked.min.js`
  - `apps/web/src/lib/markdown.tsx`
  - `content-tooling/*`
- Dependencies: Issue 1.

### Issue 7 - Establish one production path: static shell hardening or ClerkshipOS migration

- Priority: P1
- Effort: L
- Description: Decide whether the static deploy remains production for the next phase or
  whether `clerkshipos/apps/web` becomes production. Avoid maintaining both indefinitely.
- Acceptance criteria:
  - Documented source-of-truth decision.
  - Build command produces deploy folder from source.
  - No manual edits required in generated deploy artifacts.
  - Current core user flows are preserved: start, search, topic, tool, review, feedback.
- Files likely involved:
  - `index.html`
  - `clerkshipos/apps/web/*`
  - `content-tooling/*`
  - deployment config
- Dependencies: Issues 1-5.

### Issue 8 - Add direct browser smoke tests for key bedside tools

- Priority: P1
- Effort: M
- Description: Add automated smoke tests for high-risk tools under direct and iframe
  routes.
- Acceptance criteria:
  - Tests open MSE, C-SSRS, withdrawal, BFCRS, capacity, violence, and decision aids.
  - Checks: page loads, no console errors, no horizontal overflow at 390 px, essential
    controls have accessible names, reset/calculation interactions update state.
  - Results run locally and in CI if feasible.
- Files likely involved:
  - `tools/*.html`
  - new Playwright or browser-smoke script
- Dependencies: Issue 3.

### Issue 9 - Normalize tool registry and shared shell

- Priority: P1
- Effort: M-L
- Description: Convert single-file tools into registry-backed tool nodes with shared
  metadata, disclaimer, theme bridge, storage policy, review state, and launch behavior.
- Acceptance criteria:
  - Each tool has title, clinical-risk category, storage behavior, review status, source,
    and direct URL.
  - Parent shell and direct tool pages show consistent disclaimers and review state.
  - Theme and storage code is shared or generated.
- Files likely involved:
  - `tools/*.html`
  - `nav.json`
  - `reviewed.json`
  - `packages/schema/src/index.ts`
- Dependencies: Issues 2 and 8.

### Issue 10 - Improve role-based navigation and search

- Priority: P1
- Effort: M
- Description: Add role/track-aware entry points for MS3, PGY-1 cross-cover, and faculty.
- Acceptance criteria:
  - Search/filter can prioritize "bedside now", "shelf", "cross-cover", and "faculty
    teaching".
  - Home screen has explicit role mode without duplicating content.
  - Faculty teaching workflow surfaces cases, rounds questions, attest/review queue, and
    teaching scripts.
- Files likely involved:
  - `nav.json`
  - `search-index.json`
  - `topic_meta.json`
  - `index.html`
  - `apps/web/src/components/Home.tsx`
- Dependencies: Issue 5.

### Issue 11 - Add media accessibility manifest

- Priority: P1
- Effort: M
- Description: Make audio/video content searchable and accessible.
- Acceptance criteria:
  - Each audio/video item has title, source, duration, topic tags, audience, review status,
    transcript/caption status, and license.
  - Learner pages expose transcripts when available.
  - CI reports missing transcripts/captions for published media.
- Files likely involved:
  - `audio/`
  - `audio_oe/`
  - `12_Media/`
  - `content/podcast_library.md`
  - new media manifest
- Dependencies: Issue 5.

### Issue 12 - Make deployment config portable and stricter

- Priority: P1
- Effort: S-M
- Description: Remove absolute deploy paths and reduce inline-script security debt.
- Acceptance criteria:
  - Netlify publish path is repo-relative.
  - Security headers live in one source of truth.
  - CSP roadmap removes `unsafe-inline` once JS/CSS are externalized.
  - Static deploy can be reproduced from checkout.
- Files likely involved:
  - `.netlify/netlify.toml`
  - `_headers`
  - `index.html`
- Dependencies: Issue 7.

### Issue 13 - Expand CI for `clerkshipos` web build and content gates

- Priority: P1
- Effort: S
- Description: CI currently validates schema/engine/content but not the web app build.
- Acceptance criteria:
  - CI runs full `pnpm build` or at least `pnpm --filter @clerkshipos/web build`.
  - CI runs expanded content validation after metadata gates exist.
  - CI fails on absolute local source paths in publishable bundles.
- Files likely involved:
  - `.github/workflows/ci.yml`
  - `content-tooling/validate-content.mjs`
- Dependencies: Issues 5 and 12.

### Issue 14 - Replace generated TS content bundle with scrubbed JSON artifacts

- Priority: P1
- Effort: M
- Description: `apps/web/src/content.ts` is a generated 196 KB source file with local
  absolute paths. Move generated content out of source TS and scrub source refs.
- Acceptance criteria:
  - Build emits content JSON artifact.
  - App imports/loads content through a typed loader.
  - Absolute local paths are removed or converted to safe relative/source IDs.
  - Content bundle size and provenance are reported.
- Files likely involved:
  - `content-tooling/build-content.mjs`
  - `apps/web/src/content.ts`
  - `apps/web/src/content-loader.ts`
- Dependencies: Issue 13.

### Issue 15 - Build faculty teaching workflow

- Priority: P2
- Effort: L
- Description: Faculty need a fast way to run teaching, review content, and see what is
  pending verification.
- Acceptance criteria:
  - Faculty dashboard shows today's teaching options, cases, questions, student track,
    review queue, and recently changed high-risk pages.
  - Attestation actions are auditable.
  - No clinical content changes are published without verification workflow.
- Files likely involved:
  - `13_Faculty_Resources/`
  - `tools/review-attest.html`
  - `clerkshipos/demo/admin/`
  - `apps/web/*`
- Dependencies: Issues 2, 5, 7.

### Issue 16 - Add privacy-safe analytics and progress export

- Priority: P2
- Effort: M-L
- Description: Progress currently lives in browser `localStorage`. That is good for privacy,
  but there is no backup/export and no faculty insight.
- Acceptance criteria:
  - Student progress remains PHI-free and preferably local by default.
  - Optional export/import exists.
  - Any analytics are aggregate, opt-in, and do not store patient details.
  - FERPA/education-record implications are documented before accounts are added.
- Files likely involved:
  - `index.html`
  - `tools/review.html`
  - `tools/learning-path.html`
  - future backend/control plane
- Dependencies: Issue 7.

## Immediate PR Plan

### PR 1 - Static QA Harness

- Add a no-dependency Node script that checks JSON validity, nav targets, search-index
  targets, local links, orphan content/tools, metadata coverage, and review coverage.
- Add a README command and optionally a simple CI job if this folder becomes a repo.
- No clinical content changes.

### PR 2 - Mobile/A11y Quick Wins

- Add a proper label for search.
- Raise small nav/banner/dock targets toward 44 px.
- Add bottom spacing when the floating tools dock is present.
- Improve mobile drawer focus on open/close.
- Verify desktop and 390 px mobile with browser smoke checks.

### PR 3 - Review/Metadata Gate Phase 1

- Add schema for `reviewed.json` and `topic_meta.json`.
- Add `risk` and `localPolicy` fields.
- Report high-risk unreviewed items without blocking publication yet.
- Mark existing local-policy/protocol pages for faculty verification without rewriting them.

## Safety Constraints Requiring Faculty / Local Verification

These areas should not be treated as publish-ready clinical, legal, formulary, or local
policy guidance without faculty/local policy verification:

- `content/protocol_library.md` - explicitly references institutional protocols, order
  sets, BHU2 benzodiazepine taper, clozapine workflow, restraint/physical-holding
  checklist, and EHR fields.
- `tools/violence.html` - names MaineHealth/MMC FRST workflow and cites local validation.
  Needs confirmation against current local screening workflow and legal/policy language.
- `content/ethics_legal.md`, `content/pg_suicide.md`, `tools/cssrs.html`,
  `tools/capacity.html` - legal, duty-to-protect, capacity/competency, suicide-screening,
  and escalation claims vary by jurisdiction/institution.
- `content/evidence_inpatient.md` and `content/rounds_questions.md` - contain many
  medication, effect-size, guideline, legal, suicide-risk, involuntary treatment, and
  protocol claims. These need citation and date review before broad publication.
- `tools/withdrawal.html`, `content/t_sud.md`, `content/exp_consult.md`,
  `content/ddx.md` - CIWA/COWS, benzodiazepines, thiamine, buprenorphine induction, and
  escalation content should point to live institutional protocols for exact orders/doses.
- `content/psychopharm_primer.md`, `content/exp_tx.md`, `content/t_mood.md`,
  `content/t_anxiety.md`, `content/t_geri.md`, `content/t_perinatal.md`,
  `content/t_eating.md`, `content/rounds_questions.md` - formulary, medication selection,
  dosing, monitoring, pregnancy, geriatric, and REMS statements require date-stamped review.
- `content/ect_neuromodulation.md` - ECT/neuromodulation indications, consent, local
  availability, and operational workflow need local verification.
- Patient/family education and aftercare/local resource materials in `tenants/*` and
  source folders need no-PHI, local accuracy, and publication-scope review.
- Any AI tutor/action should remain curriculum-only until a PHI firewall and attestation
  workflow exist.

## Validation Performed

### Existing Commands

Ran in `/Users/jm/clerkshipos`.

Initial `pnpm validate` before schema build failed exactly:

```text
> clerkshipos@0.0.1 validate /Users/jm/clerkshipos
> node content-tooling/validate-content.mjs

node:internal/modules/esm/resolve:271
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/jm/clerkshipos/packages/schema/dist/index.js' imported from /Users/jm/clerkshipos/content-tooling/validate-content.mjs
...
Node.js v25.9.0
 ELIFECYCLE  Command failed with exit code 1.
```

Initial `pnpm build` failed until `node_modules` was repaired. Exact key output:

```text
> clerkshipos@0.0.1 build /Users/jm/clerkshipos
> turbo run build

...
@clerkshipos/web:build: Error: Cannot find module @rollup/rollup-darwin-arm64. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.
...
Node.js v25.9.0
 ELIFECYCLE  Command failed with exit code 1.
```

Repair command:

```text
$ CI=true NODE_ENV=development pnpm install --frozen-lockfile --force
 WARN  using --force I sure hope you know what you are doing
Scope: all 5 workspace projects
Recreating /Users/jm/clerkshipos/node_modules
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +412
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
...
devDependencies:
+ turbo 2.10.2
+ typescript 5.9.3

Done in 15s
```

Final `pnpm build` passed exactly:

```text
> clerkshipos@0.0.1 build /Users/jm/clerkshipos
> turbo run build

• turbo 2.10.2

   • Packages in scope: @clerkshipos/core-engine, @clerkshipos/schema, @clerkshipos/ui, @clerkshipos/web
   • Running build in 4 packages
   • Remote caching disabled

@clerkshipos/core-engine:build: cache hit, replaying logs 3edbaf1512ca7199
@clerkshipos/core-engine:build:
@clerkshipos/core-engine:build: > @clerkshipos/core-engine@0.0.1 build /Users/jm/clerkshipos/packages/core-engine
@clerkshipos/core-engine:build: > tsc -p tsconfig.json
@clerkshipos/core-engine:build:
@clerkshipos/schema:build: cache hit, replaying logs 1aea3f28890fda61
@clerkshipos/schema:build:
@clerkshipos/schema:build: > @clerkshipos/schema@0.0.1 build /Users/jm/clerkshipos/packages/schema
@clerkshipos/schema:build: > tsc -p tsconfig.json
@clerkshipos/schema:build:
@clerkshipos/web:build: cache miss, executing 980e3b1259caf57b
@clerkshipos/web:build:
@clerkshipos/web:build: > @clerkshipos/web@0.0.1 build /Users/jm/clerkshipos/apps/web
@clerkshipos/web:build: > tsc && vite build
@clerkshipos/web:build:
@clerkshipos/web:build: vite v5.4.21 building for production...
@clerkshipos/web:build: transforming...
@clerkshipos/web:build: ✓ 41 modules transformed.
@clerkshipos/web:build: rendering chunks...
@clerkshipos/web:build: computing gzip size...
@clerkshipos/web:build: dist/registerSW.js                0.14 kB
@clerkshipos/web:build: dist/manifest.webmanifest         0.17 kB
@clerkshipos/web:build: dist/index.html                   0.49 kB │ gzip:  0.32 kB
@clerkshipos/web:build: dist/assets/index-DsHFP3l0.css    6.07 kB │ gzip:  2.01 kB
@clerkshipos/web:build: dist/assets/index-Bg_MTyXL.js   339.41 kB │ gzip: 71.30 kB
@clerkshipos/web:build: ✓ built in 291ms
@clerkshipos/web:build:
@clerkshipos/web:build: PWA v0.20.5
@clerkshipos/web:build: mode      generateSW
@clerkshipos/web:build: precache  5 entries (338.55 KiB)
@clerkshipos/web:build: files generated
@clerkshipos/web:build:   dist/sw.js
@clerkshipos/web:build:   dist/workbox-9c191d2f.js

 Tasks:    3 successful, 3 total
Cached:    2 cached, 3 total
  Time:    2.253s
```

Final `pnpm test` passed exactly:

```text
> clerkshipos@0.0.1 test /Users/jm/clerkshipos
> turbo run test

• turbo 2.10.2

   • Packages in scope: @clerkshipos/core-engine, @clerkshipos/schema, @clerkshipos/ui, @clerkshipos/web
   • Running test in 4 packages
   • Remote caching disabled

@clerkshipos/core-engine:test:
@clerkshipos/core-engine:test: > @clerkshipos/core-engine@0.0.1 test /Users/jm/clerkshipos/packages/core-engine
@clerkshipos/core-engine:test: > node --test 'dist/**/*.test.js'
@clerkshipos/core-engine:test:
@clerkshipos/core-engine:test: ✔ inherit returns base unchanged (0.7175ms)
@clerkshipos/core-engine:test: ✔ override is FIELD-LEVEL: changes cta.href, keeps label + tldr + prose (0.105916ms)
@clerkshipos/core-engine:test: ✔ REGRESSION: a core prose upgrade flows through a field-level override (0.052625ms)
@clerkshipos/core-engine:test: ✔ extend appends a local block and merges meta (0.069667ms)
@clerkshipos/core-engine:test: ✔ prepend puts a local block before core body (0.05ms)
@clerkshipos/core-engine:test: ✔ hide suppresses the node (resolveNode null; resolveList filters) (0.118916ms)
@clerkshipos/core-engine:test: ✔ local returns an institution-only node (0.080625ms)
@clerkshipos/core-engine:test: ✔ pin marks the node pinned to a release (0.060083ms)
@clerkshipos/core-engine:test: ✔ multi-layer fold: core -> institution(extend) -> track(hide) = null (0.06125ms)
@clerkshipos/core-engine:test: ✔ multi-layer fold: core -> institution(override) -> track(append) composes + traces (0.910416ms)
@clerkshipos/core-engine:test: ✔ deepMerge replaces arrays wholesale but merges nested objects (0.105625ms)
@clerkshipos/core-engine:test: ✔ override CANNOT change identity (id/type/plane frozen to core), but can change other fields (0.053292ms)
@clerkshipos/core-engine:test: ✔ pin resolves against an older release when a releaseStore is provided (0.053417ms)
@clerkshipos/core-engine:test: ✔ resolveList surfaces institution-only local nodes without a placeholder core (0.064ms)
@clerkshipos/core-engine:test: ✔ provenance: override records the changed leaf path; untouched fields read as core (0.0355ms)
@clerkshipos/core-engine:test: ✔ provenance: extend marks the added block + merged meta; multi-layer keeps both sources (0.047583ms)
@clerkshipos/core-engine:test: ℹ tests 16
@clerkshipos/core-engine:test: ℹ suites 0
@clerkshipos/core-engine:test: ℹ pass 16
@clerkshipos/core-engine:test: ℹ fail 0
@clerkshipos/core-engine:test: ℹ cancelled 0
@clerkshipos/core-engine:test: ℹ skipped 0
@clerkshipos/core-engine:test: ℹ todo 0
@clerkshipos/core-engine:test: ℹ duration_ms 93.07375
...
 Tasks:    4 successful, 4 total
Cached:    3 cached, 4 total
  Time:    2.259s
```

Final `pnpm validate` passed exactly:

```text
> clerkshipos@0.0.1 validate /Users/jm/clerkshipos
> node content-tooling/validate-content.mjs

validate-content: OK — 236 nodes + pack.json valid.
```

No lint command was available in `/Users/jm/clerkshipos/package.json`.

### Static Deploy Integrity Check

Ran in `/Users/jm/clerkship-hub-deploy` with a custom no-write Node check.

```json
{
  "counts": {
    "navItems": 72,
    "navMd": 56,
    "navTools": 16,
    "contentFiles": 56,
    "toolFiles": 17,
    "topicMeta": 17,
    "reviewed": 22,
    "searchDocs": 72
  },
  "missingNav": [],
  "orphanContent": [],
  "orphanTools": [
    "learning-path.html"
  ],
  "metaMissingContent": [],
  "navMissingMeta": [
    "welcome.md",
    "core_readings.md",
    "orientation.md",
    "ddx.md",
    "t_geri.md",
    "t_perinatal.md",
    "nutrition_metabolic.md",
    "omm_resources.md",
    "week1.md",
    "week2.md",
    "week3.md",
    "week4.md",
    "week5.md",
    "week6.md",
    "psychopharm_primer.md",
    "protocol_library.md",
    "ect_neuromodulation.md",
    "ethics_legal.md",
    "cultural_psychiatry.md",
    "pg_interview.md",
    "pg_formulation.md",
    "pg_suicide.md",
    "doc_oral.md",
    "exp_consult.md",
    "exp_tx.md",
    "exp_family.md",
    "family_modalities.md",
    "family_playbook.md",
    "motivational_interviewing.md",
    "brief_psychotherapy.md",
    "osce.md",
    "cases.md",
    "shelf.md",
    "rounds_questions.md",
    "reading_map.md",
    "landmark_trials.md",
    "evidence_inpatient.md",
    "book_library.md",
    "podcast_library.md"
  ],
  "reviewedMissing": [],
  "brokenLocalLinks": [],
  "brokenLocalLinksCount": 0,
  "siMissing": [],
  "siNotInNav": [],
  "siNotInNavCount": 0
}
```

Interpretation: no broken deploy references were found. The biggest static-data gap is
metadata and attestation coverage, not broken routing.

### Browser Validation

Static server:

```text
Serving HTTP on 127.0.0.1 port 8765 (http://127.0.0.1:8765/) ...
```

Desktop static shell:

```json
{
  "title": "Start here — MS3 Psychiatry Clerkship",
  "url": "http://127.0.0.1:8765/?page=__start__",
  "counts": {
    "links": 11,
    "buttons": 97,
    "inputs": 2,
    "articles": 0,
    "headings": 4,
    "imagesMissingAlt": 0
  },
  "logs": []
}
```

Accessibility heuristic on desktop:

```json
{
  "duplicateIds": [],
  "unlabeledInputs": [
    {
      "id": "search",
      "placeholder": "Search the hub…",
      "tag": "INPUT",
      "type": "search"
    }
  ],
  "badButtonsCount": 0,
  "landmarks": {
    "aside": 1,
    "footer": 0,
    "header": 0,
    "main": 1,
    "nav": 1
  },
  "scroll": {
    "bodyScrollWidth": 1265,
    "horizontalOverflow": false,
    "innerWidth": 1280
  }
}
```

Mobile closed drawer state:

```json
{
  "ariaHidden": "true",
  "inertAttr": true,
  "menuExpanded": "false",
  "sideClass": "",
  "x": -300
}
```

Search interaction:

```json
{
  "searchAudit": {
    "title": "Catatonia — MS3 Psychiatry Clerkship",
    "url": "http://127.0.0.1:8765/?page=catatonia.md",
    "h1": [
      "Inpatient Psychiatry",
      "Catatonia on the Inpatient Unit"
    ],
    "searchValue": ""
  },
  "logsSearch": []
}
```

Embedded withdrawal tool route:

```json
{
  "toolAudit": {
    "title": "Withdrawal: CIWA-Ar/COWS — MS3 Psychiatry Clerkship",
    "url": "http://127.0.0.1:8765/?tool=withdrawal.html",
    "iframe": {
      "h": 768,
      "src": "tools/withdrawal.html",
      "title": "Withdrawal: CIWA-Ar/COWS",
      "w": 375
    },
    "horizontalOverflow": false,
    "viewport": {
      "h": 844,
      "w": 390
    }
  },
  "toolLogs": []
}
```

Direct withdrawal tool smoke test:

```json
{
  "directToolAudit": {
    "title": "Withdrawal Scales — CIWA-Ar & COWS",
    "horizontalOverflow": false,
    "inputs": [
      { "aria": "Nausea / vomiting", "label": false },
      { "aria": "Tremor", "label": false },
      { "aria": "Paroxysmal sweats", "label": false },
      { "aria": "Anxiety", "label": false },
      { "aria": "Agitation", "label": false },
      { "aria": "Tactile disturbances", "label": false },
      { "aria": "Auditory disturbances", "label": false },
      { "aria": "Visual disturbances", "label": false },
      { "aria": "Headache / fullness in head", "label": false },
      { "aria": "Orientation / sensorium", "label": false }
    ],
    "buttons": [
      { "text": "CIWA-Ar (alcohol)", "h": 41, "w": 163 },
      { "text": "COWS (opioid)", "h": 41, "w": 139 },
      { "text": "Reset", "h": 34, "w": 67 }
    ]
  },
  "directToolLogs": []
}
```

These browser checks are smoke tests and heuristics, not a formal WCAG audit.

