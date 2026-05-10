# Repo-root Dockerfile for Render (and any platform that defaults to
# building from the repo root). Builds the agent-engine subproject.
# Local dev keeps using agent-engine/Dockerfile separately.

FROM node:22-alpine AS builder
WORKDIR /app
COPY agent-engine/package.json agent-engine/package-lock.json* ./
RUN npm ci
COPY agent-engine/tsconfig.json ./
COPY agent-engine/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY agent-engine/package.json agent-engine/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Non-root user
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
USER app

# Honor whatever PORT the platform injects (Render = 10000, local = 8080)
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["sh", "-c", "node -e \"fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]

CMD ["node", "dist/server.js"]
