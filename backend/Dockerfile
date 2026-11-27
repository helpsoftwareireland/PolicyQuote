# syntax=docker/dockerfile:1
# Multi-stage build for the PolicyQuote API as a Fargate-deployable service (BRD OP-03).
# Build context is the REPO ROOT so the Knowledge Base can be copied:
#   docker build -f backend/Dockerfile -t policyquote-api .
#   docker run -p 3000:3000 policyquote-api      → curl localhost:3000/health

# ---- build: compile TypeScript, then drop dev dependencies -------------------------------
FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: prod deps + compiled JS + KB only, non-root ---------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    KB_PATH=/app/kb/risk-kb.json
WORKDIR /app/backend
COPY --from=build --chown=node:node /app/backend/package.json ./
COPY --from=build --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
# The KB ships with the image as a default; in production mount or sync a versioned KB and point KB_PATH at it.
COPY --chown=node:node kb/risk-kb.json /app/kb/risk-kb.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
