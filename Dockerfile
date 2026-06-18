# Playwright resmi imajı — Chromium + tüm sistem bağımlılıkları dahil
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

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

# Server
COPY server/ ./server/

# Playwright'ın chromium executable path'ini ayarla
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 3001
CMD ["node", "server/src/server.js"]
