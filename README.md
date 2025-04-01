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

This project includes integration with Playwright for end-to-end testing. The Playground component allows you to:

1. Write and execute Playwright tests directly in the browser
2. View test results in an HTML report
3. Save and manage test cases

### Using the Playground

1. Navigate to `/playground` in your browser
2. Write your Playwright test in the code editor
3. Click the "Run Test" button to execute the test
4. View the test results in the "Report" tab

### Example Test

```javascript
const { test, expect } = require("@playwright/test");

test("basic test", async ({ page }) => {
  // Navigate to a website
  await page.goto("https://example.com");

  // Expect the page title to contain a specific string
  await expect(page).toHaveTitle(/Example Domain/);
});
```

### Test Results

Test results are stored in the `public/test-results` directory and can be accessed through the browser at [/test-results/report/index.html](/test-results/report/index.html).

## Docker Usage

To build and run the application using Docker, follow these steps:

### Step 1: Build the Docker Image

```bash
docker build -t supertest-io --build-arg DATABASE_URL="file:./supertest.db" .
```

### Step 2: Run the Docker Container

```bash
docker run -p 3000:3000 \
  -v $(pwd)/supertest.db:/app/supertest.db \
  -v $(pwd)/public:/app/public \
  supertest-io
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Docker Image Details

The Docker image is built using the official Playwright image (v1.51.1) based on Ubuntu 22.04 LTS (Jammy Jellyfish). This ensures compatibility with the Playwright test framework and provides a stable environment for running the application.

### Volume Mounts

- `supertest.db`: SQLite database file for storing application data
- `public`: Directory for serving static files and test results

### Environment Variables

The following environment variables can be passed during build time:

- `DATABASE_URL`: URL for the SQLite database (default: file:./supertest.db)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
