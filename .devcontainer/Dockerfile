FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

ENV CLERKSHIP_DEVCONTAINER=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER root

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       git-lfs \
       lsof \
       python3 \
       python3-pip \
       python3-venv \
    && test "$(node -p 'process.versions.node.split(".")[0]')" = "22" \
    && test "$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')" = "3.11" \
    && test "$(bash -c 'printf %s "${BASH_VERSINFO[0]}"')" -ge 5

COPY tests/smoke/package.json tests/smoke/package-lock.json /tmp/smoke/
RUN cd /tmp/smoke \
    && npm ci \
    && npx playwright install chromium --with-deps \
    && rm -rf /tmp/smoke /var/lib/apt/lists/* \
    && chown -R node:node /ms-playwright

USER node
