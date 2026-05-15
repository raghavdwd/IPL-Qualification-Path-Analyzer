# Dockerfile for deploying to Render as a web service.
#
# Uses oven/bun as the base image — much smaller than node + gives us
# Bun's native TypeScript execution, HTTP server, and .env loading.
#
# Multi-stage build:
#   1. Install stage — resolves dependencies and caches them
#   2. Run stage — copies only what's needed, keeps the image lean
#
# Render will:
#   - Set PORT env var (we read it in config.ts)
#   - Hit /health periodically to check the app is alive
#   - Restart the container if /health stops responding

# ---- Stage 1: Install dependencies ----
FROM oven/bun:1.3 AS install

WORKDIR /app

# Copy lockfile and package manifests first to maximise Docker layer caching.
# If package.json doesn't change, this layer is reused and install is near-instant.
COPY bun.lock package.json ./
RUN bun install --frozen-lockfile --production

# ---- Stage 2: Run ----
FROM oven/bun:1.3 AS run

WORKDIR /app

# Copy only the production dependencies — no devDependencies or cache.
COPY --from=install /app/node_modules ./node_modules

# Copy the source code. .dockerignore should exclude .env, data/, node_modules, etc.
COPY . .

# Render sets the PORT environment variable automatically.
# The bot reads this in config.ts via config.http.port.
EXPOSE ${PORT:-8080}

# Start the bot + health server. Bun runs index.ts directly (no tsc step needed).
CMD ["bun", "run", "index.ts"]
