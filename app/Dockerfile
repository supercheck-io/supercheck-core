# Use platform-agnostic base image
FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install dev dependencies for build
RUN npm ci --legacy-peer-deps

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build with standalone output
RUN npm run build

# Production image, copy all the files and run next
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install PostgreSQL client tools and bash for database migrations
RUN apt-get update && apt-get install -y \
    postgresql-client \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Create necessary directories with proper permissions
RUN mkdir -p /home/nextjs/.npm && \
    chown -R nextjs:nodejs /home/nextjs && \
    chown -R nextjs:nodejs /app

# Copy only necessary files for execution
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration files and scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/db ./src/db
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
RUN chmod +x ./scripts/migrate.sh

# Set npm to not use cache and set proper environment
RUN mkdir -p /tmp/.npm && \
    chown -R nextjs:nodejs /tmp/.npm

# Clean up unnecessary files to reduce image size
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    npm cache clean --force && \
    rm -rf /root/.npm /root/.cache

USER nextjs

# Set npm to not use cache and use tmp directory
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV NPM_CONFIG_NO_CACHE=true

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy startup script
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

# Use startup script that handles migrations
CMD ["./start.sh"]
 