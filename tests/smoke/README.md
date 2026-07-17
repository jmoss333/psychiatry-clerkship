# Smoke tests

Five automated browser checks run on every PR to `main` via the `smoke-tests` CI job.

## Checks

| # | Name | What it gates |
|---|------|---------------|
| 1 | Nav crawl | Every page in `nav.json` and the resident inline nav returns HTTP 200 and renders non-empty real content. Samples topic cards for two-tier practice panel. Covers both MS3 and resident sites. |
| 1a | Interview Room acceptance | The standardized-patient interview surface enforces its reviewed pack, managed endpoint, privacy, and interaction contracts. |
| 1b | Faculty qbank workbench | The shared-key login, filters, full two-tier editor, draft/reload workflow, session review, green batch, individual warning acknowledgement, red blocker, retired-item exclusion, and conflict recovery work against a synthetic in-memory repository. |
| 2 | LFS integrity | Audio files served by the Netlify deploy preview are real bytes, not ~133-byte Git-LFS pointer stubs. Runs against the deploy preview URL; skips gracefully if the preview isn't live yet. |
| 3 | Visual regression | Screenshots of the resident sidebar and a representative topic page (first viewport) at desktop (1280×800) and mobile (390×844) compared against committed baselines using pixelmatch. Threshold: 20% pixel diff. |

## Running locally

```bash
cd tests/smoke
npm ci

# Build sites first (from repo root)
bash ../../13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash ../../13_Faculty_Resources/_automation/site_build/build_and_check.sh res

# Serve
python3 -m http.server 4200 --directory ../../_build/ms3 &
python3 -m http.server 4201 --directory ../../_build/res &
python3 -m http.server 4202 --directory ../../faculty-console &

SP_INTERVIEW_BASE_URL=http://localhost:4200/tools/ npx playwright test # all checks
npx playwright test --project=nav-ms3                              # nav crawl — MS3 only
npx playwright test --project=nav-res                              # nav crawl — resident only
npx playwright test --project=faculty-console                      # faculty question-bank workbench
npx playwright test --project=lfs                                  # LFS check (needs MS3_DEPLOY_URL set)
npx playwright test --project=visual                               # visual regression
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
    python3 -m http.server 4200 --directory _build/ms3 &>/dev/null &
    python3 -m http.server 4201 --directory _build/res &>/dev/null &
    for port in 4200 4201; do
      for i in \$(seq 1 15); do
        curl -sf http://localhost:\$port/ >/dev/null 2>&1 && break; sleep 1
      done
    done
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
    python3 -m http.server 4200 --directory _build/ms3 &>/dev/null &
    python3 -m http.server 4201 --directory _build/res &>/dev/null &
    sleep 2
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
