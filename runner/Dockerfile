FROM node:20-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with legacy peer deps to resolve conflicts
RUN npm install --legacy-peer-deps --force

# Install system dependencies required for Playwright browsers
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxss1 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright and download browser binaries
RUN npm install -D @playwright/test@latest
RUN npx playwright install chromium

# Copy Playwright browsers to a known location for the final stage
RUN mkdir -p /app/playwright-browsers && \
    cp -r /root/.cache/ms-playwright /app/playwright-browsers/

# Build the NestJS application
FROM deps AS builder
COPY . .
RUN npm run build

# Production image, copy all the files and run next
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production


# Create app user without password prompt
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs -s /bin/bash nodejs

COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/playwright.config.js ./

# Copy Playwright browsers from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/playwright-browsers /app/playwright-browsers

# Install system dependencies required for Playwright browsers in the final stage
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libxss1 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Create directories for test execution
RUN mkdir -p playwright-reports && \
    chown -R nodejs:nodejs playwright-reports

# Set Playwright browser cache path
ENV PLAYWRIGHT_BROWSERS_PATH=/app/playwright-browsers/ms-playwright

USER nodejs

EXPOSE 3001

CMD ["node", "dist/src/main.js"]