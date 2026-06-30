FROM node:18-bullseye-slim

# Prevent Puppeteer from downloading Chromium during npm install (we use the system-installed Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install Git (required for npm github dependencies), Chromium, and DNS utilities
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

# Create a non-root user with UID 1000 for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user
WORKDIR /app

# Copy package files and install dependencies (with skip download flag active)
COPY --chown=user package*.json ./
RUN npm install --production

# Copy application files and grant permissions to user 1000
COPY --chown=user . .

# Switch to the non-root user
USER user

EXPOSE 7860

ENV PORT=7860
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["node", "server.js"]
