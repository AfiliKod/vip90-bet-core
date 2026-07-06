FROM node:22-slim AS build

WORKDIR /app

# Bağımlılıkları önce yükle (layer cache)
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Build stage'de Playwright browser'ı indirmeye gerek yok — bu stage'in
# cache'i final image'a kopyalanmıyor, gerçek kurulum aşağıda yapılıyor
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --prefix server
RUN npm install --prefix client

# Client build
COPY client/ ./client/
RUN npm run build --prefix client

# Server kaynak kodu
COPY server/src ./server/src

# ─── Production image ──────────────────────────────────────────────
# node:22-alpine (musl) DEĞİL — Playwright'ın Chromium build'leri glibc'e
# bağlı, Alpine'da çalışmaz. node:22-slim (Debian, apt mevcut) kullanılıyor.
FROM node:22-slim

WORKDIR /app

RUN groupadd --system appgroup && useradd --system --gid appgroup --no-create-home appuser

COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./

# Chromium + gerekli sistem kütüphaneleri sabit bir path'e kuruluyor
# (appuser'ın $HOME'una değil — hangi user çalıştırırsa çalıştırsın bulunsun diye)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN ./server/node_modules/.bin/playwright install --with-deps chromium

RUN mkdir -p ./server/logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server/src/server.js"]
