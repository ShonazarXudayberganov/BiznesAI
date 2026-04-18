# BiznesAI Backend
FROM node:20-alpine

# wget — healthcheck uchun; dumb-init — signal handling (PID 1)
RUN apk add --no-cache wget dumb-init

WORKDIR /app

# Install deps (lockfile bo'lsa npm ci tezroq va deterministic)
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source
COPY . .

# Uploads papka
RUN mkdir -p /app/uploads

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
