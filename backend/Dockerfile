# Analix Backend
FROM node:20-alpine

# wget — healthcheck; dumb-init — signal handling; chromium + fontlar — Puppeteer PDF uchun
RUN apk add --no-cache \
    wget dumb-init \
    chromium \
    nss freetype harfbuzz ca-certificates ttf-freefont \
    font-noto font-noto-cjk

# Puppeteer bundled Chromium'ni yuklamasin — biz alpine'nikini ishlatamiz
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
