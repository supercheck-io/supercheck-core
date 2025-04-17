# Stage 1: Build
FROM mcr.microsoft.com/playwright:v1.51.1-jammy AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Copy Playwright configuration
COPY playwright.config.mjs ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/public/tests && chown -R 1000:1000 /app/public

# Build the application
RUN npm run build

# Stage 2: Production
FROM mcr.microsoft.com/playwright:v1.51.1-jammy AS runner

WORKDIR /app

# Install dependencies with legacy peer deps
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy built assets from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Copy Playwright configuration and necessary files
COPY --from=builder /app/playwright.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src

# Ensure proper permissions for the tests directory
RUN mkdir -p /app/public/tests && chown -R 1000:1000 /app/public

# Set environment variables
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# AWS S3 / MinIO configuration
ARG AWS_REGION=us-east-1
ARG AWS_ACCESS_KEY_ID=minioadmin
ARG AWS_SECRET_ACCESS_KEY=minioadmin
ARG S3_ENDPOINT=http://localhost:9000
ARG S3_JOB_BUCKET_NAME=playwright-job-artifacts
ARG S3_FORCE_PATH_STYLE=true

ENV AWS_REGION=$AWS_REGION
ENV AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
ENV AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
ENV S3_ENDPOINT=$S3_ENDPOINT
ENV S3_JOB_BUCKET_NAME=$S3_JOB_BUCKET_NAME
ENV S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
