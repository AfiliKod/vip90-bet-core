FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Playwright kurulum sırasında browser indirmesin — image'da zaten mevcut
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

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

EXPOSE 3001
CMD ["node", "server/src/server.js"]
