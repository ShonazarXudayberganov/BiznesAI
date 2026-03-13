# BiznesAI Backend
FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source
COPY . .

# Uploads papka
RUN mkdir -p /app/uploads

EXPOSE 3001

CMD ["node", "src/index.js"]
