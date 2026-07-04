# Build + run the barcoding-mcp streamable-HTTP server.
# Build context = repo root:  docker build -f docker/Dockerfile -t barcoding-mcp .
# stdio transport is per-invocation and not containerised; this image serves --http.

# ---- build stage ----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
# Install with the workspace lockfile (deps hoist to the root node_modules).
COPY package.json package-lock.json ./
COPY packages/mcp/package.json ./packages/mcp/package.json
RUN npm ci
COPY packages/mcp ./packages/mcp
RUN npm run build -w @cordfuse/barcoding-mcp

# ---- runtime stage --------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/mcp/package.json ./packages/mcp/package.json
COPY --from=build /app/packages/mcp/dist ./packages/mcp/dist
EXPOSE 3900
CMD ["node", "packages/mcp/dist/index.js", "--http", "--port", "3900"]
