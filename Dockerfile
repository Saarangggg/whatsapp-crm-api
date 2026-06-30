FROM node:18-bullseye-slim

# Prevent Puppeteer from downloading Chromium during npm install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install Git (required for dependency retrieval), Chromium, and DNS utilities
RUN apt-get update && apt-get install -y \
    git \
    chromium \
    chromium-sandbox \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    dnsmasq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 7860

ENV PORT=7860
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["node", "server.js"]
