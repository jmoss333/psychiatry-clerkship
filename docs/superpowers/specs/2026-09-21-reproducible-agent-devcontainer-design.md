# Reproducible Agent Dev Container Design

**Date:** 2026-09-21
**Status:** approved in conversation; implementation not started

## Decision

Add one local VS Code Dev Container for repository and agent work, but first move every active
Node runtime declaration from Node 20 to Node 22. The container will then expose one supported
toolchain: Node 22, Python 3.11, Bash 5 or later, Git LFS, and the Playwright version already
locked by `tests/smoke/package-lock.json`.

The container is a development and verification environment. It does not deploy, merge, publish,
attest clinical content, hold production credentials, or replace the existing GitHub Actions and
Netlify gates.

## Why this is the smallest coherent change

The current repository is reproducible in CI but not on the primary Mac:

- GitHub Actions uses Python 3.11 and mostly Node 20.
- `sp-preview` and its Netlify site require Node 22.
- the primary Mac supplies Bash 3.2, while CI supplies a newer Bash; this has already produced
  local-only gate failures;
- Playwright needs browser and operating-system packages beyond `npm ci`;
- Git LFS availability changes whether media appear as false modifications.

Preserving both Node 20 and Node 22 in the container would reproduce the mismatch rather than fix
it. Node 20 reached end of life on 2026-03-24 and receives no security fixes. Node 22 is already
used by the hosted Interview Room preview and remains supported through April 2027. Therefore the
runtime reconciliation is a prerequisite, not an optional cleanup.

## Goals

1. A fresh local clone can be opened in VS Code and rebuilt in the container without manually
   repairing Python, Node, Bash, Git LFS, or Playwright.
2. A coding agent inside the container sees the same supported Node and Python major versions as
   CI and Netlify.
3. One tracked contract detects drift among GitHub Actions, Netlify configuration, package engine
   declarations, the Dev Container, and Playwright.
4. One explicit command runs the repository's full local gate and nonvisual browser smoke suite
   inside the container.
5. Container setup performs no deployment, login, provider call, paid model call, or clinical
   content mutation.

## Non-goals

- GitHub Codespaces or any cloud-hosted development environment.
- Automatic PR creation, pushing, merging, or deployment.
- Installing Copilot, Claude, Codex, or third-party agent plugins inside the image.
- Mounting the Docker socket, SSH keys, API keys, Netlify credentials, or other host secrets.
- Replacing Netlify deploy previews, production canaries, protected Interview Room checks, or
  real-provider auditions.
- Generating or updating Ubuntu visual baselines locally.
- Proving physical microphone, headphone, VoiceOver, faculty-review, or clinical correctness.

## Runtime contract

Create a small tracked `runtime_versions.json` with exactly these decisions:

```json
{
  "schemaVersion": 1,
  "nodeMajor": 22,
  "pythonMajorMinor": "3.11",
  "bashMinimumMajor": 5,
  "playwrightVersion": "1.63.0",
  "nodeReviewBy": "2027-02-01"
}
```

`bin/check-runtime-contract.mjs` will compare that contract with:

- every `node-version:` declaration under `.github/workflows/`;
- `NODE_VERSION` in `sp-proxy/netlify.toml`, `metrics/netlify.toml`, and
  `sp-preview/netlify.toml`;
- `engines.node` in `sp-proxy`, `metrics`, `sp-preview`, and `tests/smoke`;
- the Playwright dependency in `tests/smoke/package.json`;
- the Dev Container base image and setup command;
- the live Node, Python, Bash, Git LFS, and Playwright tools when invoked with `--current`.

The Node major is fixed while patch releases remain movable within Node 22 so routine security
updates do not require a repository edit. NPM dependencies and Playwright remain byte-locked by
their existing lockfiles.

## Container architecture

The container uses Microsoft's first-party Debian Bookworm Node 22 Dev Container image. A small
Dockerfile adds Debian's Python 3.11 packages and Git LFS, verifies the major-version contract at
image-build time, and returns to the unprivileged `node` user.

`devcontainer.json`:

- builds that Dockerfile locally;
- runs as `node`, never root;
- adds no declared mounts, forwarded credentials, capabilities, or Docker socket;
- points VS Code's Python interpreter and terminal path at a repository-local `.venv`;
- runs `.devcontainer/post-create.sh` after creation.

The post-create script:

1. creates `.venv`;
2. installs `requirements.txt`, `requirements-dev.txt`, and the CI PyYAML pin;
3. runs `npm ci` in `metrics`, `sp-proxy`, `sp-preview`, and `tests/smoke`;
4. installs the locked Chromium build and its Linux dependencies;
5. configures Git LFS locally with smudging disabled, so opening the container does not download
   large media automatically;
6. runs the live runtime-contract check.

It does not run the full gate automatically. Container creation should finish promptly and should
not make a developer wait through two site builds merely to open the project.

## Verification flow

`bash bin/verify-devcontainer.sh` is the deliberate, one-command proof. It fails unless run inside
a container, verifies current tool versions, runs `bash bin/verify.sh`, then runs
`bash bin/verify-smoke.sh`.

The full site builds continue sequentially because they share output locations. The smoke helper
runs nonvisual browser journeys. Visual-baseline mutation remains forbidden locally and stays in
the existing Ubuntu workflow.

## CI and deployment migration

Every active GitHub Actions `setup-node` declaration and every Netlify `NODE_VERSION` declaration
moves to Node 22 in the same runtime-migration commit. Package engine declarations become
`>=22 <23`, and their lockfile root metadata is regenerated mechanically.

The scheduled-workflow validator's canonical digests are recomputed only for workflows whose
parsed semantics changed. Step names, permissions, cadence, commands, and action SHA pins remain
unchanged.

Before any production merge, all current unit tests, both static site builds, both Netlify
function suites, and the nonvisual Playwright suite must pass under Node 22. A preview becoming
`ready` remains insufficient evidence for the Interview Room because preview LFS checks are soft
and live provider/device behavior is outside this change.

## Security and privacy boundaries

- No secret is written into the image, Dockerfile, container configuration, setup script, or
  runtime contract.
- No Docker socket is mounted.
- No agent plugin is installed or auto-updated by repository configuration.
- No PHI, learner dialogue, provider prompt, or feedback text is collected.
- Dependency installation uses the repository's existing lockfiles.
- The container may use network access only for ordinary dependency and browser installation;
  application tests remain subject to their existing offline/opt-in boundaries.

## Cost

The design uses local Docker and the repository's existing public GitHub Actions configuration.
It introduces no paid service, hosted container, Codespace, Sentry account, Mastra account, or
additional model call. Its costs are local disk, CPU time, network bandwidth during initial image
and dependency installation, and maintenance time.

## Acceptance criteria

- A clean container build reports Node 22, Python 3.11, Bash 5+, Git LFS, and Playwright 1.63.0.
- `node --test tests/runtime-contract.test.mjs` passes and fails on a fixture containing Node 20.
- No active workflow, Netlify configuration, or package engine declaration retains Node 20.
- `bash bin/verify.sh` passes inside the container.
- `bash bin/verify-smoke.sh` passes inside the container without updating visual baselines.
- `CLAUDE.md` and `AGENTS.md` remain byte-identical.
- No production deployment, provider call, PR, push, merge, or faculty-attestation change occurs
  as part of implementation verification.

