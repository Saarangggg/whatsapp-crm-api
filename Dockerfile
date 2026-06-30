FROM node:20

# Prevent Puppeteer from downloading Chromium during npm install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install Git, CA-Certificates, Chromium, and DNS utilities
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    chromium \
    chromium-sandbox \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    dnsmasq \
    && rm -rf /var/lib/apt/lists/*

# Force Git to use HTTPS for the non-root 'user' (bypasses GitHub blocks and SSH key checks)
RUN git config --global url."https://github.com/".insteadOf git://github.com/ && \
    git config --global url."https://github.com/".insteadOf git+ssh://git@github.com/ && \
    git config --global url."https://github.com/".insteadOf ssh://git@github.com/

# Create a non-root user and pre-create the workspace folder with appropriate user permissions
RUN useradd -m -u 1000 user && mkdir /app && chown -R user:user /app
WORKDIR /app

# Switch to the non-root user early
USER user

# Copy package files (already owned by user)
COPY --chown=user package*.json ./

# Remove package-lock.json to avoid platform lockfile conflicts, then install dependencies
RUN rm -f package-lock.json && npm install --production

# Copy application files and grant permissions to user 1000
COPY --chown=user . .

EXPOSE 7860

ENV PORT=7860
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=512"

CMD ["node", "server.js"]
