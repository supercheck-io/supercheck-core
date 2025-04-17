# Supertest.io

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Development Setup without Docker Compose

If you prefer to run the services individually without Docker Compose, follow these steps:

### 1. Start PostgreSQL

Install PostgreSQL locally or run it in a standalone Docker container:

```bash
# Run PostgreSQL with Docker
docker run -d --name postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgrespassword \
  -e POSTGRES_DB=supertest \
  -p 5432:5432 \
  postgres:16
```

### 2. Run Database Migrations

```bash
# Generate migrations
npx drizzle-kit generate --config=drizzle.config.ts

# Apply migrations
npx drizzle-kit migrate
```

### 3. Start MinIO

```bash
# Run MinIO with Docker
docker run -d --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  -p 9000:9000 -p 9001:9001 \
  minio/minio server /data --console-address ":9001"
```

### 4. Create MinIO Bucket

```bash
# Install MinIO Client if needed
brew install minio/stable/mc  # on macOS
# or
wget https://dl.min.io/client/mc/release/linux-amd64/mc  # on Linux
chmod +x mc
sudo mv mc /usr/local/bin/mc

# Configure and create bucket
mc config host add myminio http://localhost:9000 minioadmin minioadmin
mc mb myminio/playwright-job-artifacts
mc policy set public myminio/playwright-job-artifacts
```

### 5. Set Up Environment Variables

Create a `.env.local` file:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/supertest
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgrespassword
DB_NAME=supertest

# AWS S3 / MinIO Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_FORCE_PATH_STYLE=true
S3_OPERATION_TIMEOUT=10000
S3_MAX_RETRIES=3

# App Config
MAX_CONCURRENT_TESTS=2
TEST_EXECUTION_TIMEOUT_MS=900000
TRACE_RECOVERY_INTERVAL_MS=300000
```

### 6. Start the Application

```bash
npm run dev
```

## Docker Compose Setup

If you prefer to use Docker Compose, you can start all services with a single command:

```bash
docker-compose up
```

This will start:
- PostgreSQL (with automatic migrations)
- MinIO for S3-compatible storage
- The Next.js application

If you need to rebuild the containers:

```bash
docker-compose build
docker-compose up
```

## Playwright Test Integration

This project includes integration with Playwright for end-to-end testing. The Playground component allows you to write, execute, and manage Playwright tests directly in the browser.

### Storage Architecture

This application uses a hybrid storage approach:

- **Job Execution Results**: Stored in S3-compatible storage (MinIO, AWS S3, etc.)
- **Individual Test Results**: Stored locally in the filesystem under `public/test-results`

### S3 Configuration

Configure S3 storage by setting the following environment variables:

```bash
# AWS S3 / MinIO Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_FORCE_PATH_STYLE=true
```

### MinIO Setup

1. Start a MinIO server locally:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

2. Access the MinIO console at <http://localhost:9001>
3. Create bucket: `playwright-job-artifacts`

### Troubleshooting S3 Storage

If experiencing issues with storage:

1. Run the diagnostic script: `node scripts/test-s3-connection.js`
2. Check MinIO is running: `docker ps | grep minio`
3. Verify environment variables in your `.env.local` file
4. Test direct MinIO connection with: `mc ls myminio` (after setting up MinIO Client)

## Docker Usage

### Build the Docker Image

```bash
docker build -t supertest-io --build-arg DATABASE_URL="file:./supertest.db" .
```

### Run the Docker Container

```bash
docker run -p 3000:3000 \
  -v $(pwd)/supertest.db:/app/supertest.db \
  -v $(pwd)/public:/app/public \
  supertest-io
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Next.js GitHub repository](https://github.com/vercel/next.js)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
