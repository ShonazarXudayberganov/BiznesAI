# Analix Bot Worker — Telegram bot + scheduler
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
