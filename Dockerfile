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

# ---------- Stage 2: static server ------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
