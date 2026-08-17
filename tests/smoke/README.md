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
    --project=offline
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
    --project=offline
```

The LFS browser project may skip locally when no deploy-preview URL is available. The sequential
build gate's 105-real-file check is the authoritative local media evidence.

## Visual baselines

The visual project captures resident Front Door Today and Reader first viewports at 1280×800 and
390×844. State and time are frozen, and snapshots use semantic names:

- `front-door-today-desktop.png`
- `front-door-reader-desktop.png`
- `front-door-today-mobile.png`
- `front-door-reader-mobile.png`

Baselines are Ubuntu/Chromium artifacts. Do not generate or commit replacements from macOS.
Refresh them only after publishing an authorized branch:

1. Open GitHub Actions → **Refresh visual baselines**.
2. Run the workflow for that branch.
3. Inspect the workflow's `[skip ci]` baseline commit.
4. Explicitly rerun CI, because the bot commit may not trigger it automatically.

The visual project is expected to remain red while the new semantic baselines are absent. That
handoff is separate from the functional projects, which must be green first.
