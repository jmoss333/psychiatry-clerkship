# Developer environment onboarding

This is a local development environment, not a deployment or clinical approval.
Prerequisites on the host: Git, Git LFS, Python 3.9+, VS Code with Dev Containers,
and an approved, running Docker-compatible runtime. The container supplies the
project's Python 3.11, Node 22, Bash 5+, dependencies, and Chromium.

## Before Reopen in Container

Use a **full clone** whose Git metadata and LFS cache live inside the folder VS Code
mounts. A linked worktree can work perfectly on the host while its external Git
directory is inaccessible inside the container. Keep coding worktrees separate;
do not move or replace the primary checkout to solve this.

From the selected full clone, run:

```bash
python3 bin/devcontainer-preflight.py
python3 bin/devcontainer-preflight.py --json
```

The second command returns the same report as versioned JSON. Exit **0** means
checked (possibly with advisory warnings); **1** means a confirmed blocker;
**2** means a required check could not be completed. Neither a warning nor a pass
is a verification receipt. Unknown results must be resolved, not treated as green.

The preflight reads Git layout, the tracked LFS inventory, Docker daemon memory
on the host (Linux VM/cgroup memory in the container), and credential-forwarding
configuration. It does not install tools, fetch media, run credential helpers,
authenticate, start Docker, or change configuration. Raw helper and socket values
are never printed. Run it on the host before opening VS Code; it runs again
automatically inside the container before setup or verification installs anything.

### Reuse local media instead of downloading it again

For a separate container proof clone, this example copies cached objects locally.
Replace the source path first. The clone starts at the source checkout's commit,
**not necessarily current remote main**, and does not copy uncommitted edits.

```bash
source_repo="/absolute/path/to/existing/checkout"
clone_parent="$(mktemp -d "${TMPDIR:-/tmp}/clerkship-container.XXXXXX")"
GIT_LFS_SKIP_SMUDGE=1 git clone --no-hardlinks "$source_repo" "$clone_parent/repo"
# This setting belongs ONLY to the newly created full clone.
git -C "$clone_parent/repo" config --local lfs.storage lfs
# Initialize filters in this new clone, not the primary checkout or a linked worktree.
git -C "$clone_parent/repo" lfs install --local --skip-smudge
source_objects="$(git -C "$source_repo" lfs env | sed -n 's/^LocalMediaDir=//p')"
mkdir -p "$clone_parent/repo/.git/lfs/objects"
if [ -d "$source_objects" ]; then
  cp -R "$source_objects/." "$clone_parent/repo/.git/lfs/objects/"
fi
git -C "$clone_parent/repo" lfs checkout
git -C "$clone_parent/repo" log -1 --format='%h %s'
python3 "$clone_parent/repo/bin/devcontainer-preflight.py"
```

`git lfs checkout` uses cached objects; it does not download missing ones. The
clone-local initialization is needed even when the Git LFS executable is already
installed; `--skip-smudge` prevents automatic media downloads on later checkouts.
Run `git lfs checkout` again after changing revisions, then rerun preflight. The
preflight still blocks if any tracked media remains a pointer or is missing. If
the source cache is incomplete, obtain approval before `git lfs pull`: downloads
consume the GitHub account's metered LFS bandwidth. For a local-source clone,
first confirm the intended remote; `origin` initially names the source checkout.
Do not leave `lfs.storage` pointing at a host-only absolute path inside a container,
and do not prune another checkout's shared cache. Relative `lfs.storage` paths are
relative to the Git directory, so `lfs` means `.git/lfs`, not `.git/.git/lfs`.

The temporary clone is disposable but **not automatically deleted**. Choose a
durable destination instead if it will be your normal development checkout.

## Open and verify

1. Open that full clone in VS Code and select **Dev Containers: Reopen in Container**.
2. Setup runs the preflight, installs locked dependencies and the local status
   extension, then checks the runtime contract. It does **not** run the long gate.
3. Select **Tasks: Run Task → Verify Dev Container**, or run:

   ```bash
   bash bin/verify-devcontainer.sh --refresh-deps --receipt output/devcontainer/verification-receipt.json
   ```

The manual task runs preflight, dependency refresh, runtime checks, both builds
sequentially, and nonvisual browser tests. A failed/unknown preflight stops before
dependency refresh and records the failed `preflight` stage when a receipt can be
written. Low-memory and credential warnings do not prevent local verification.
After pulling an update to image-baked files (including the local status extension),
use **Dev Containers: Rebuild Container** so VS Code receives the new image/VSIX.

### Troubleshooting

- **OOM / exit 137:** the earlier native VS Code proof exhausted a 2 GiB Colima VM
  and passed after a 6 GiB allocation. Start with 6 GiB for this workload; this is
  a tested recommendation, not a measured universal minimum. Preflight warns
  below 5 GiB of visible capacity because the VM exposes less than its configured
  allocation. Close competing workloads or adjust the runtime allocation yourself;
  preflight never changes it. Memory capacity is not current free memory.
- **Cannot measure memory:** start/check the selected Docker daemon on the host.
  Inside the container, the probe uses `/proc` and cgroups, not the Docker socket.
  Unsupported/unreadable cgroup layouts are unknown, not an assumed pass.
- **Git or LFS path outside the mount:** use the full-clone procedure above.
- **Missing helper executable:** VS Code may forward a host helper whose path
  does not exist in Linux. Local verification does not require push credentials.
  Only recognizable absolute executable paths receive this specific diagnosis;
  named or arbitrary shell helpers receive an unverified forwarding warning.
  Review forwarding and repair the host configuration yourself before pushing;
  the preflight does not test authentication or run arbitrary helper commands.
- **New bootstrap stops early:** address the named blocker and rerun setup/rebuild.
  Do not bypass preflight or replace real media with pointer files.

## What the receipt proves

Green means a complete passed receipt matches this checkout's **clean tracked
commit**. Red means its latest attempt failed. Gray means there is no current
proof, including edits, a different commit, an interrupted run, or invalid data.
It does **not** check whether remote main has advanced. Fetch/compare branches
separately when needed; deliberately select the next revision and rerun verification.

The receipt is local and ignored by Git. Automatic setup does not write a receipt or revoke the last
manual proof: green is not continuous monitoring of environment health. Rerun the
manual task after rebuilding or repairing setup. Without deploy URLs, deploy-only LFS
browser tests skip. The local run does not prove production deployment, provider
behavior, microphone/headphone behavior, VoiceOver, faculty approval, clinical
correctness, or Ubuntu visual baselines. Never regenerate visual baselines here.
Repository-declared mounts contain no credentials or Docker socket; host-controlled
Git/SSH forwarding may still provide credentials. Preflight is not a security audit.
