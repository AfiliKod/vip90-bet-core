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

# Server kaynak kodu + kurulum sihirbazı (server/src/routes/install.js bağımlı)
COPY server/src ./server/src
COPY installer ./installer

# ─── Production image ──────────────────────────────────────────────
# node:22-alpine (musl) DEĞİL — Playwright'ın Chromium build'leri glibc'e
# bağlı, Alpine'da çalışmaz. node:22-slim (Debian, apt mevcut) kullanılıyor.
#
# AÇIKÇA `AS production` — bu stage'den SONRA `test` stage'i eklendiği için
# (bkz. aşağısı) Docker'ın "hedef belirtilmezse SON stage'i build et"
# varsayılanı artık `test`'e düşer. docker-compose.yml'deki app servisi
# `target: production` ile bunu açıkça sabitliyor; sabitlemezse `app`
# container'ı yanlışlıkla test image'ını çalıştırır — production sunucusu
# hiç ayağa kalkmaz, Caddy 502 döner (2026-09-16'da bağımsız kopya
# kurulumunda böyle yaşandı).
FROM node:22-slim AS production

WORKDIR /app

RUN groupadd --system appgroup && useradd --system --gid appgroup --no-create-home appuser

COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/package*.json ./server/
COPY --from=build /app/server/src ./server/src
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./
COPY --from=build /app/installer ./installer

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

# ─── Test image ──────────────────────────────────────────────────────
# Kurulum doğrulamasının bir parçası olarak testleri konteynerde çalıştırmak
# için (bkz. docker-compose.test.yml) — devDependencies dahil, prod image'a
# hiç karışmaz. `docker compose -f docker-compose.yml -f docker-compose.test.yml
# run --rm test` ile kullanılır.
FROM node:22-slim AS test
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install --prefix server
COPY server/ ./server/
COPY client/src ./client/src
COPY installer ./installer
ENV NODE_ENV=test
CMD ["sh", "-c", "set -e; echo '=== npm test --prefix server (run-all-tests.cjs) ==='; npm test --prefix server; echo; echo '=== node --test (server/test + client i18n) ==='; node --test server/test/*.test.js client/src/i18n/*.test.js"]
