# The Codex connector: scripts/codex-shim.ts plus the Codex CLI it runs. Build context is the repository root.
# The CLI version is pinned to the one the connector was tested with locally (codex-cli 0.159.0).
FROM node:24-trixie-slim
ARG CODEX_VERSION=0.159.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g --no-audit --no-fund @openai/codex@${CODEX_VERSION}
WORKDIR /app
COPY scripts/codex-shim.ts ./codex-shim.ts
ENV CODEX_HOME=/home/node/.codex
USER node
EXPOSE 4340
CMD ["node", "codex-shim.ts"]
