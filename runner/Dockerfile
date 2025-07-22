# Use platform-agnostic base image for deps stage
FROM node:20-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production --legacy-peer-deps

# Build stage with dev dependencies
FROM deps AS builder
WORKDIR /app
COPY . .

# Install dev dependencies for build
RUN npm ci --legacy-peer-deps

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
RUN npx playwright install chromium --with-deps

# Copy Playwright browsers to a known location for the final stage
RUN mkdir -p /app/playwright-browsers && \
    cp -r /root/.cache/ms-playwright /app/playwright-browsers/ && \
    rm -rf /root/.cache/ms-playwright

# Build the NestJS application
RUN npm run build

# Production image, copy all the files and run next
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create app user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nodejs

# Copy only necessary files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/playwright.config.js ./

# Copy Playwright browsers from deps stage
COPY --from=builder --chown=nodejs:nodejs /app/playwright-browsers /app/playwright-browsers

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

# Clean up unnecessary files to reduce image size
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    npm cache clean --force && \
    rm -rf /root/.npm /root/.cache

USER nodejs

EXPOSE 3001

CMD ["node", "dist/src/main.js"]