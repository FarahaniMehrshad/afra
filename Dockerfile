# syntax=docker/dockerfile:1.7
# ---------- Stage 1: install & build ---------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install first — this layer is cached whenever package.json is unchanged.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the source and produce a production build in /app/dist.
COPY . .
RUN npm run build

# ---------- Stage 2: node server --------------------------------------------
# Not a plain static server: the same origin has to serve /api/llm so the
# OpenAI-compatible key stays out of the browser bundle.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O- http://localhost:8787/api/llm/health >/dev/null 2>&1 || exit 1
CMD ["node", "server/index.mjs"]
