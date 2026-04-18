# Analix Bot Worker — Telegram bot + scheduler
FROM node:20-alpine

# dumb-init: signal handling. python3/make/g++: gramjs ning utf-8-validate native dep'i uchun.
RUN apk add --no-cache dumb-init python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi

COPY . .

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
