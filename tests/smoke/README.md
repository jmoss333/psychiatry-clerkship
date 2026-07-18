# Smoke tests

Five automated browser checks run on every PR to `main` via the `smoke-tests` CI job.

## Checks

| # | Name | What it gates |
|---|------|---------------|
| 1 | Nav crawl | Every page in `nav.json` and the resident inline nav returns HTTP 200 and renders non-empty real content. Samples topic cards for two-tier practice panel. Covers both MS3 and resident sites. |
| 1a | Interview Room acceptance | The standardized-patient interview surface enforces its reviewed pack, managed endpoint, privacy, and interaction contracts. |
| 1b | Unified faculty attestation workspace | A mixed page/tool/question queue uses the real local learner build, exact-question routing, individual content and question attestations, honest preview failures and fallbacks, conflict recovery, privacy defenses, keyboard/accessibility behavior, and a no-overflow 390×844 layout against a synthetic in-memory repository. |
| 2 | LFS integrity | Audio files served by the Netlify deploy preview are real bytes, not ~133-byte Git-LFS pointer stubs. Runs against the deploy preview URL; skips gracefully if the preview isn't live yet. |
| 3 | Visual regression | Screenshots of the resident sidebar and a representative topic page (first viewport) at desktop (1280×800) and mobile (390×844) compared against committed baselines using pixelmatch. Threshold: 20% pixel diff. |

## Running locally

```bash
# From the repository root:
npm --prefix tests/smoke ci
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash tests/smoke/start-local-servers.sh

# Defaults printed by the launcher:
#   MS3             http://127.0.0.1:4200/
#   Resident        http://127.0.0.1:4201/
#   Faculty console http://127.0.0.1:4202/
# The launcher prints the exact `kill` command to stop all three servers.

cd tests/smoke
SP_INTERVIEW_BASE_URL=http://localhost:4200/tools/ npx playwright test
npx playwright test --project=nav-ms3
npx playwright test --project=nav-res
npx playwright test --project=faculty-console
npx playwright test --project=lfs
npx playwright test --project=visual
```

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
npx playwright test
```

## Visual baselines

Baselines live in `tests/smoke/baseline/`. They are the source of truth for Check 3.

### Why baselines must be generated in-container (not on a laptop)

Playwright's `toHaveScreenshot()` compares pixels byte-for-byte. Even though this SPA bundles its own web fonts (which eliminates most macOS/Linux font differences), other rendering subtleties — subpixel hints, compositing, Chromium build differences — can still diverge between platforms. The CI runner is **Ubuntu 22.04 (Jammy) / Chromium**, so baselines must be generated in an equivalent environment. Baselines committed from a macOS laptop may pass locally but fail in CI.

### Refreshing baselines — Option A: CI workflow_dispatch (recommended)

This is the lowest-friction option. It runs on the same Ubuntu runner as the CI smoke job.

1. Go to **GitHub → Actions → "Refresh visual baselines"**
2. Click **Run workflow** and select the branch you're working on
3. The job builds the sites, regenerates all four baseline PNGs, and commits them back to that branch with the message `chore(smoke): refresh visual baselines (Ubuntu/Chromium) [skip ci]`

### Refreshing baselines — Option B: local Docker (same container as CI)

If you need to iterate offline or validate before pushing:

```bash
# From the repo root:

# 1. Build the sites
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res

# 2. Run inside the same container image as CI (mcr.microsoft.com/playwright:v1.46.1-jammy)
#    A named volume keeps node_modules off your host filesystem.
docker run --rm \
  --ipc=host \
  -v "$(pwd)":/work \
  -v smoke_node_modules:/work/tests/smoke/node_modules \
  mcr.microsoft.com/playwright:v1.46.1-jammy \
  bash -c "
    set -e
    cd /work
    bash tests/smoke/start-local-servers.sh
    cd tests/smoke
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --quiet
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test --project=visual --update-snapshots
  "

# 3. Verify the check passes in-container before committing
docker run --rm \
  --ipc=host \
  -v "$(pwd)":/work \
  -v smoke_node_modules:/work/tests/smoke/node_modules \
  mcr.microsoft.com/playwright:v1.46.1-jammy \
  bash -c "
    cd /work
    bash tests/smoke/start-local-servers.sh
    cd tests/smoke
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --quiet
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright test --project=visual
  "

# 4. Stage and commit
git add tests/smoke/baseline/
git commit -m "chore(smoke): refresh visual baselines (Linux/Chromium)"
```

**Note (Colima users):** set `DOCKER_HOST=unix:///Users/$(whoami)/.colima/default/docker.sock` if the default socket isn't `/var/run/docker.sock`.

### When to refresh baselines

- After intentional changes to the sidebar layout, nav structure, or topic page styling
- After changing capture config in `visual-regression.spec.js` (viewport size, element selector, settle time)
- After a Playwright version bump (rendering may differ between versions)
- **Never** commit baselines generated on a laptop — always use the CI workflow or the Docker command above
