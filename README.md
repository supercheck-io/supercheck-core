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
