# Build stage: Vite+ (vp) + Rolldown build via Bun
# NOTE: oven/bun images ship the bun binary only (no Node) — bun runs the
# tsc/vp bins directly, which is all this build needs.
FROM oven/bun:1.4-slim AS build-stage
LABEL authors="xcodeassociated"

WORKDIR /app

# Install dependencies from the lockfile first (better layer caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Generate typed GraphQL documents (src/graphql/generated is not committed)
RUN bun run generate:graphql

# tsc -b && vp build — Vite+ production build (Rolldown)
# Env: copy a .env.production into the build context (see CI workflow) or
# pass VITE_* variables at build time; they are inlined into the bundle.
RUN NODE_ENV=production bun run build

# Production stage: NGINX as static server
FROM nginx:1.30-alpine-slim AS production-stage
LABEL authors="xcodeassociated"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-stage /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
