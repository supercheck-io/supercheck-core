# Supertest.io

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app). It provides a web-based platform for writing, managing, and executing Playwright tests, featuring a robust job queue and result storage.

## Core Technologies

* **Frontend/Backend:** Next.js (App Router)
* **Database:** PostgreSQL
* **ORM:** Drizzle ORM
* **Job Queue:** pg-boss
* **E2E Testing:** Playwright
* **UI Components:** Shadcn/ui, Radix UI, Lucide Icons
* **Styling:** Tailwind CSS

## Getting Started

First, ensure you have Node.js, npm/yarn/pnpm, and Docker installed.

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Development Setup

You can set up the development environment using Docker Compose (recommended) or by running services manually.

### Docker Compose Setup (Recommended)

This is the easiest way to get all required services running.

1. **Environment:** Ensure you have a `.env.local` file based on the example below (or rely on defaults if suitable for local development).
2. **Start Services:**

    ```bash
    docker-compose up -d # Start in detached mode
    ```

    This command will:
    * Build the necessary Docker images.
    * Start containers for:
        * PostgreSQL database
        * MinIO (S3-compatible object storage)
        * The Next.js application
    * Automatically apply database migrations using Drizzle Kit upon container startup.

3. **Access:**
    * Application: `http://localhost:3000`
    * MinIO Console: `http://localhost:9001` (Credentials: `minioadmin`/`minioadmin`)

4. **Stopping:**

    ```bash
    docker-compose down
    ```

5. **Rebuilding:**

    ```bash
    docker-compose build
    docker-compose up -d
    ```

### Manual Setup without Docker Compose

Follow these steps if you prefer to run services individually.

#### 1. Start PostgreSQL

Install PostgreSQL locally or run it in a standalone Docker container:

```bash
# Run PostgreSQL with Docker (Example)
docker run -d --name postgres-supertest \\
  -e POSTGRES_USER=postgres \\
  -e POSTGRES_PASSWORD=postgrespassword \\
  -e POSTGRES_DB=supertest \\
  -p 5432:5432 \\
  postgres:16
```

*(Adjust user/password/db name as needed and update your `.env.local` accordingly)*

#### 2. Run Database Migrations

Ensure your `DATABASE_URL` is set correctly in `.env.local`.

```bash
# Generate migrations (if you make schema changes in src/db/schema.ts)
npx drizzle-kit generate --config=drizzle.config.ts

# Apply migrations
npx drizzle-kit migrate --config=drizzle.config.ts
```

#### 3. Start MinIO (Optional, for S3 features)

If you need S3 storage for job artifacts:

```bash
# Run MinIO with Docker (Example)
docker run -d --name minio-supertest \\
  -p 9000:9000 -p 9001:9001 \\
  -e "MINIO_ROOT_USER=minioadmin" \\
  -e "MINIO_ROOT_PASSWORD=minioadmin" \\
  minio/minio server /data --console-address ":9001"
```

#### 4. Create MinIO Bucket (if using MinIO)

You need to create the bucket specified in your environment variables (default: `playwright-job-artifacts`).

* Access the MinIO Console (`http://localhost:9001`).
* Log in (`minioadmin`/`minioadmin`).
* Create a new bucket with the name `playwright-job-artifacts`.
* Set the bucket's access policy to `public` if required by your setup (accessible via the UI: Bucket -> Manage -> Access Policy -> Add Access Rule -> ReadOnly for Prefix '/').

*Alternatively, use the MinIO Client (`mc`):*

```bash
# Install MinIO Client if needed (e.g., brew install minio/stable/mc)

# Configure client alias
mc config host add localminio http://localhost:9000 minioadmin minioadmin

# Create bucket
mc mb localminio/playwright-job-artifacts

# Set public read policy (optional)
mc policy set public localminio/playwright-job-artifacts
```

#### 5. Set Up Environment Variables

Create a `.env.local` file in the project root. This file overrides default settings and is not committed to Git. Add the following variables, adjusting values for your setup:

```dotenv
# Database Connection (Required)
# Example for local Docker container from step 1
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/supertest

# --- Optional: Only needed if NOT using Docker Compose AND need S3 ---
# AWS S3 / MinIO Configuration (For Job Artifact Storage)
# Ensure these match your MinIO setup or actual S3 credentials
AWS_REGION=us-east-1 # Required, even for MinIO
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000 # For MinIO, comment out for AWS S3
S3_JOB_BUCKET_NAME=playwright-job-artifacts
S3_FORCE_PATH_STYLE=true # Required for MinIO

# S3 Client Settings (Optional)
# S3_OPERATION_TIMEOUT=10000 # milliseconds
# S3_MAX_RETRIES=3

# --- Application Behavior ---
# Test Execution Concurrency (pg-boss workers)
MAX_CONCURRENT_TESTS=3 # Default if unset

# Test Execution Timeout (milliseconds) - Max duration for a single test run via UI
TEST_EXECUTION_TIMEOUT_MS=900000 # 15 minutes default

# Job Queue Recovery Interval (Optional)
# TRACE_RECOVERY_INTERVAL_MS=300000 # How often pg-boss checks for stalled jobs

# --- Playwright Configuration Overrides (Optional) ---
# These override playwright.config.mjs settings
# PLAYWRIGHT_TEST_DIR=./public/tests
# PLAYWRIGHT_REPORT_DIR=./public/test-results/tests/report
# PLAYWRIGHT_OUTPUT_DIR=./public/artifacts/${runId} # Note: ${runId} is dynamic
# PLAYWRIGHT_RETRIES=1
# PLAYWRIGHT_WORKERS=3
```

*Note: For a production deployment, manage secrets securely (e.g., using environment variables provided by your hosting platform or a secret manager) instead of committing them.*

#### 6. Start the Application

```bash
npm run dev
```

## Test Execution

This application supports multiple ways to execute Playwright tests:

1. **Playground UI:** Write and run single Playwright test snippets directly within the web interface. Results (HTML report, artifacts) are stored locally.
2. **Jobs UI:** Define jobs that run multiple test scripts (`*spec.js` files). Results can be stored locally and optionally uploaded to S3-compatible storage (MinIO/AWS S3) for persistence and sharing.
3. **Direct Playwright CLI:** Run tests directly using the standard Playwright command line. This bypasses the web UI, API, and the `pg-boss` queueing system.

### Running Tests via Playwright CLI

Ensure you have installed development dependencies (`npm install`).

```bash
# Run all tests found in the configured test directory (default: ./public/tests)
npx playwright test

# Run specific tests
npx playwright test my-test.spec.js another-test.spec.js

# Run tests in a specific browser (matching project names in playwright.config.mjs)
npx playwright test --project=chromium

# Override configuration options (see playwright.config.mjs)
# Example: Change test directory
npx playwright test --config=./playwright.config.mjs --test-dir=./path/to/other/tests

# View Playwright help
npx playwright test --help
```

Test artifacts (reports, screenshots, videos, traces) generated by the CLI are stored locally based on the paths configured in `playwright.config.mjs` (by default under `./public/test-results/tests/report` and `./public/artifacts/<runId>`).

### Test Execution Flow (UI)

Tests initiated via the Playground or Jobs UI utilize a `pg-boss` queue for reliable execution and management.

* **Queues:** Separate queues (`test-execution` for single tests, `job-execution` for multi-test jobs) manage test runs.
* **Concurrency:** Limited by the `MAX_CONCURRENT_TESTS` environment variable.
* **Workers:** Background workers process jobs from the queue.
* **Status Updates:** Real-time progress is reported to the UI via Server-Sent Events (SSE).
* **Consistent UI:** Both single tests and job runs use the same shared components for displaying test reports and artifacts, providing a unified experience and maximizing code reuse.

For a detailed diagram and explanation of the UI-driven execution flows, see [`test-exec-flow.md`](./test-exec-flow.md).

## Storage Architecture

* **Test Scripts:** Stored within the application's database (managed via the UI). Test files for direct CLI execution reside in the filesystem (e.g., `public/tests/`).
* **Test Results (UI Execution):**
  * **Single Tests (Playground):** Stored locally in the filesystem under paths defined in `playwright.config.mjs` (e.g., HTML report in `public/test-results/tests/report`, artifacts in `public/artifacts/<runId>`).
  * **Jobs (Multiple Tests):** Stored locally first (same paths as single tests). Additionally, the final combined HTML report can be uploaded to the configured S3 bucket (`S3_JOB_BUCKET_NAME`) for persistence.
* **Test Results (CLI Execution):** Stored locally as defined in `playwright.config.mjs`.

## Learn More (Next.js Boilerplate)

To learn more about Next.js, take a look at the following resources:

* [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
* [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
