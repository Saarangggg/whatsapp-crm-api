FROM node:18-bullseye-slim

# Prevent Puppeteer from downloading Chromium during npm install
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

# Force Git to use HTTPS instead of git:// or ssh:// protocols (bypasses GitHub blocks and SSH key checks)
RUN git config --global url."https://github.com/".insteadOf git://github.com/ && \
    git config --global url."https://github.com/".insteadOf git+ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf ssh://git@github.com/

# Create a non-root user with UID 1000 for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user
WORKDIR /app

# Copy package files
COPY --chown=user package*.json ./

# Remove package-lock.json to avoid platform lockfile conflicts, then install dependencies
RUN rm -f package-lock.json && npm install --production

# Copy application files and grant permissions to user 1000
COPY --chown=user . .

# Switch to the non-root user
USER user

EXPOSE 7860

ENV PORT=7860
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["node", "server.js"]
