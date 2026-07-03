FROM node:22-slim AS build

WORKDIR /app

# Bağımlılıkları önce yükle (layer cache)
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm install --omit=dev --prefix server
RUN npm install --prefix client

# Client build
COPY client/ ./client/
RUN npm run build --prefix client

# Server kaynak kodu
COPY server/src ./server/src

# ─── Production image ──────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./

RUN mkdir -p ./server/logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server/src/server.js"]
