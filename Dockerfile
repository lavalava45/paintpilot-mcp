# MCP catalog inspection only. Photoshop execution still requires Windows and
# the local Photoshop UXP companion; this image does not provide Photoshop.
FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# prepare builds from source, so install dependencies before copying the source.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY src ./src
COPY scripts/build-server.ts ./scripts/build-server.ts
COPY tsconfig.json ./
COPY uxp-plugin ./uxp-plugin
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md third-party-components.json ./
COPY licenses ./licenses
RUN pnpm run build:server

# Runtime fingerprinting includes sources, UXP files and the generated build manifest.
# Keep these at their build paths; copying dist alone invalidates deployment checks.
RUN mkdir -p .photoshop-runtime && chown -R node:node /app
USER node
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
