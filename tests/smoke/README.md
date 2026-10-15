# Smoke tests

The browser gate exercises the final built MS3 and resident sites, the faculty attestation
workspace, the Interview Room served under the MS3 `/tools/` path, and offline behavior.

## Front Door contract

- The HTTP nav crawl remains the broad publication inventory: 98 MS3 routes and 106 resident
  routes must return real non-LFS content.
- The rendered Library is checked separately against the site-specific projection: exactly 81
  unique MS3 controls and 90 unique resident controls.
- The same Front Door journeys run for both learner audiences. They cover setup and browse mode,
  Today, Path week preview/adoption, Library, Reader navigation and completion compatibility,
  keyboard search and side sheets, Safety Kit fail-closed behavior, Progress/mastery, history,
  theme, reduced motion, mobile targets, fixed actions, focus restoration, and overflow.
- Governance, faculty exact-revision preview, capture/no-PHI, Interview Room, offline, and broader
  tool journeys remain independent contracts.

## Running functional projects locally

### Delayed-loading dialog focus

`dialog-loading-focus.spec.js` and the `delayed dialog focus:` cases in
`rotation-edition-v2.spec.js` run for both `nav-ms3` and `nav-res`. They hold a reading,
review-status ledger, or Care directory response until a dialog is open, then release it.
Assertions require the completion to appear in the DOM, preserve the exact focused control,
and exercise actual keyboard input without a locator refocusing the control.

The inventory covers Search; Settings; the Safety kit and all five protocol sheets; Capture;
its nested patient-details warning and email review; the retained item-preview renderer;
Care Quick Share; clear-packet confirmation; edition-switch confirmation; and the embedded
Communication Practice case browser. The `interview-room` project also checks spoken consent,
Chart, Step out, and both typed and spoken patient-information alerts inside each learner shell,
using its existing provider-free fixtures. Shell and Interview Room dialogs run at 320px and 1280px; the embedded case
browser is a phone-only control. A closed case browser is the positive control proving that a
normal high-risk warning still receives focus. Existing `front-door.spec.js` cases also pin
ordinary high-risk warning focus and route announcements.

Optional Care and edition dialogs use their existing explicit opt-in fixtures. Their production
flags do not change. The retained item-preview modifier has no current authored opener, so its
test adds that modifier to a real search result. The nested patient-details alert belongs to the
Capture modal rather than owning a separate focus trap. Browser-owned `confirm()` prompts suspend
page JavaScript and are outside this asynchronous DOM-dialog inventory; the existing
Communication Practice suite checks their accept/cancel behavior. Capture separately checks
persistence-failure handling with an accepted confirmation. This is automated Chromium coverage,
not physical iPhone keyboard or native VoiceOver evidence.

Run the complete timing inventory with `npx playwright test dialog-loading-focus.spec.js
rotation-edition-v2.spec.js --project=nav-ms3 --project=nav-res --grep 'delayed dialog focus:'
--retries=0`, followed by `npx playwright test interview-room.spec.js --project=interview-room
--grep 'delayed dialog focus:' --retries=0`. Set `MS3_BASE_URL` and `RES_BASE_URL` when using
nondefault ports or hosted previews. Service workers must remain blocked for controlled-response tests.

From the repository root:

```bash
npm --prefix tests/smoke ci
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash tests/smoke/start-local-servers.sh

cd tests/smoke
SP_INTERVIEW_BASE_URL=http://127.0.0.1:4200/tools/ \
  npx playwright test \
    --project=nav-ms3 \
    --project=nav-res \
    --project=faculty-console \
    --project=interview-room \
    --project=offline-ms3 \
    --project=offline-res
```

The launcher defaults to:

- MS3: `http://127.0.0.1:4200/`
- Resident: `http://127.0.0.1:4201/`
- Faculty console: `http://127.0.0.1:4202/`
- Interview Room: the configured MS3 base URL plus `/tools/`

If those ports are occupied, the learner and Interview Room projects can use remapped ports:

```bash
export SMOKE_MS3_PORT=4300
export SMOKE_RES_PORT=4301
export SMOKE_FACULTY_PORT=4302
bash tests/smoke/start-local-servers.sh

cd tests/smoke
MS3_BASE_URL=http://127.0.0.1:4300 \
RES_BASE_URL=http://127.0.0.1:4301 \
FACULTY_CONSOLE_BASE_URL=http://127.0.0.1:4302 \
SP_INTERVIEW_BASE_URL=http://127.0.0.1:4300/tools/ \
  npx playwright test \
    --project=nav-ms3 \
    --project=nav-res \
    --project=faculty-console \
    --project=interview-room \
    --project=offline-ms3 \
    --project=offline-res
```

The LFS browser project may skip locally when no deploy-preview URL is available. The sequential
build gate's 105-real-file check is the authoritative local media evidence.

## Verification after each production release

The release train dispatches `production-release-verification.yml` after publishing a
revision. Its focused `production-release.config.js` runs against the exact production
deploy permalinks for both learner sites, checked against the requested `RELEASE_SHA`.
It does not add another deployment or a scheduled browser crawl.

Each site must report all three named journeys: Path/Care navigation, desktop medication
search (1280 × 900), and phone medication search (320 × 844). The search journeys run
126 cases apiece: generic/brand names and treatments, punctuation-sensitive context,
safety-protocol priority, the capacity-tool exception, and literal/unknown filenames.
Every positive name-audit query requires its expected reading in the top three;
an unrelated nonempty result list fails.
They open the monitoring reading and the withdrawal protocol, then repeat a contextual
query and a safety query after reload. Across both sites this is 504 matrix checks plus
8 reload checks. Deliberate misspellings remain expected misses; fuzzy drug-name correction
is not claimed.

The consolidated JSON and Markdown receipt also include an advisory medication-search
ranking comparison. It matches queries by site, screen dimensions, phase, category, and
exact query text. The baseline is the nearest earlier release in first-parent Git history
with a retained receipt from a successful `main` verification run created in the last
90 days. Same-release reruns, unrelated branches, and newer releases are excluded;
rechecking an older release does not move it ahead of a nearer ancestor. Baseline release,
verifier, run, artifact, and history-window identifiers are retained in the JSON.

Missing or demoted safety protocols and protocols converted to ordinary reading actions
appear first. Removed safety queries are labeled **coverage gaps**, separately from
observed ranking regressions. Added/removed queries, changed expectations, and changed
screen dimensions make the comparison partial. The Markdown shows at most 60 changed
queries, with an explicit omitted count; the JSON retains every change and current snapshot.
Unmet new or changed safety expectations are labeled separately from an observed drop
in a safety result's position.

Unavailable, expired, malformed, or incomplete history is labeled **comparison unavailable**,
never “no changes.” Older receipts without medication observations cannot serve as a
baseline. Discovery reads at most 300 runs in the retention window and reports unavailable
if that bound prevents a complete scan. This report does not change the existing release
verdict or search logic; medication and safety assertions remain the release checks.

To run the same checks against already deployed revisions, supply both exact deploy
permalinks and their full commit SHA:

```bash
cd tests/smoke
MS3_BASE_URL="$MS3_DEPLOY_PERMALINK" \
RES_BASE_URL="$RES_DEPLOY_PERMALINK" \
RELEASE_SHA="$DEPLOYED_COMMIT_SHA" \
  npx playwright test --config=production-release.config.js
```

The release receipt requires every named journey on **each** site. Missing, skipped,
unknown, duplicated or substituted journeys cannot produce PASS; failures and flaky
results produce FAIL. The uploaded Playwright report includes named query steps and
`medication-search-results` JSON attachments with expected destinations and observed
result order. Failure screenshots and traces remain in the existing 90-day release
artifact. The consolidated Markdown receipt lists each journey and any missing one.
This is technical search evidence; faculty review status remains separate.

## Visual baselines

The visual project captures the resident Front Door plus **one page per structural
archetype**, at 1280×800 and 390×844. State and time are frozen, and snapshots use semantic
names:

| Snapshot (× `-desktop` / `-mobile`) | Route | Archetype it protects |
|---|---|---|
| `front-door-today` | `/` | Front Door, Today tab |
| `front-door-reader` | `?page=t_mood.md` | flat prose page **with a crisis block** — the `makeCollapsible()` bail-out path (23 pages) |
| `reader-sections` | `?page=osce.md` | `makeCollapsible()` sections, chevrons and the Expand/Collapse toolbar, plus tables (36 pages) |
| `reader-disclosure` | `?page=week5.md` | a build-injected `<details>` block with inline `<audio>`, captured **open** (6 pages) |

**Why archetypes and not one page.** Before 2026-09-04 the set was four images over two
routes, and `t_mood.md` stood in for all 86 built resident content pages. It has zero `<h2>`s,
no tables and no media, and its crisis block switches `makeCollapsible()` off — so the collapse
machinery that 36 pages render through had never been baselined at all. PR #506 changed six
week pages and the smoke job went green, which is how the gap surfaced.

**Adding a route costs two images.** Add one only for a structural archetype that no existing
row covers, and give its `settle()` an assertion that the machinery actually ran — otherwise a
regression is silently re-baselined as the new normal on the next refresh.

Baselines are Ubuntu/Chromium artifacts. Do not generate or commit replacements from macOS.
Refresh them only after publishing an authorized branch:

1. Open GitHub Actions → **Refresh visual baselines**.
2. Run the workflow for that branch.
3. Inspect the workflow's baseline commit. It may touch `tests/smoke/baseline/` and nothing
   else, and it carries no CI-skip token.
4. Wait for the PR's own **pull_request** CI run on that commit, and merge on its result.
   With the baseline GitHub App configured (the Setup note at the top of
   `.github/workflows/refresh-baselines.yml`) that run starts by itself. Without it, GitHub
   holds the run for a maintainer: PR → Checks → the CI run → **Approve and run**. A
   `workflow_dispatch` run of CI on the same commit does not count toward the PR's required
   checks, even when it is green (#839).

The visual project is expected to remain red while the new semantic baselines are absent. That
handoff is separate from the functional projects, which must be green first.
