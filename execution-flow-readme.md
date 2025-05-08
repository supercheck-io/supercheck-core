# Test and Job Execution Flow

This document explains the end-to-end flow of test and job execution in the application, including how tests are queued, executed, reported, and monitored.

## System Architecture Components

- **Frontend (Next.js)**: Browser-based UI for creating, running, and monitoring tests/jobs
- **API Layer**: Next.js API routes that handle test/job execution requests
- **Queue System**: BullMQ + Redis for job queuing and real-time status updates
- **Worker Service**: NestJS service that processes queued tests
- **Storage**:
  - PostgreSQL database for metadata
  - Local filesystem for temporary test artifacts
  - S3/MinIO for persistent storage of test reports and artifacts
- **Test Runner**: Playwright for browser-based test execution

## Test Execution Flow

### 1. Single Test Execution (Playground)

1. **Frontend**:
   - User submits a test script via the playground interface
   - Frontend displays a persistent loading toast notification
   - Frontend sends a POST request to `/api/test` with the script content

2. **API Layer**:
   - Generates a unique test ID
   - Adds the test to the `test-execution` queue in Redis
   - Returns the test ID and status to the frontend
   - Frontend establishes an SSE connection to `/api/test-status/sse/[testId]`

3. **Worker Processing**:
   - The TestExecutionProcessor picks up the queued test
   - Publishes initial "running" status via Redis pub/sub with TTL
   - Creates a test run directory with a unique ID to prevent conflicts
   - Validates the test script content
   - Enhances the script with proper trace configuration
   - Writes the test script to a JavaScript file
   - Executes the test using Playwright's native runner
   - Collects test results and generates HTML report

4. **Results Handling**:
   - Searches for reports in expected output directories
   - Processes report files to fix trace URLs before uploading
   - Uploads test report and artifacts to S3/MinIO
   - Updates test status in the database
   - Publishes completion status via Redis with TTL
   - Frontend receives real-time updates via SSE
   - Frontend dismisses the loading toast and shows a success/error toast
   - Upon completion, frontend displays the test report

## Job Execution Flow (Multiple Tests)

1. **Frontend**:
   - User initiates a job run with multiple tests
   - Frontend displays a persistent loading toast notification
   - Frontend sends a POST request to `/api/jobs/run` with job and test details

2. **API Layer**:
   - Creates a new run record in the database with "pending" status, generating a runId
   - Fetches test scripts from the database if not provided
   - Adds the job to the `job-execution` queue in Redis, using the runId for tracking
   - Returns job ID, run ID and status
   - Frontend establishes an SSE connection to `/api/job-status/sse/[runId]`

3. **Worker Processing**:
   - The JobExecutionProcessor picks up the queued job
   - Publishes initial "running" status via Redis pub/sub with TTL
   - Creates a job run directory with a unique ID to prevent conflicts
   - For each test script in the job:
     - Ensures proper trace configuration to prevent path issues
     - Writes each test script to separate JavaScript files
   - Executes all tests using Playwright's native runner
   - Collects aggregated results and generates a combined HTML report

4. **Results Handling**:
   - Searches for reports in expected output directories
   - Processes report files to fix trace URLs before uploading
   - Uploads consolidated report and artifacts to S3/MinIO
   - Calculates and stores test duration in the database
   - Updates job status in the database, including duration information
   - Publishes completion status with results via Redis with TTL
   - Frontend receives real-time updates via SSE
   - Frontend dismisses loading toast and shows success/error toast with "View Run Report" link
   - Upon completion, frontend displays job results and report

## Real-time Status Updates

The application uses Server-Sent Events (SSE) for real-time status updates:

- **Test Status Endpoint**: `/api/test-status/sse/[testId]`
- **Job Status Endpoint**: `/api/job-status/sse/[runId]` (using runId, not jobId)

These endpoints:
1. Subscribe to Redis pub/sub channels with TTL for automatic cleanup
2. Stream status updates to the frontend in real-time
3. Include information like execution progress, status changes, and result URLs
4. Automatically close when execution completes or fails
5. Handle connection errors with proper client-side fallbacks

## Report Viewing

Test and job reports are stored in S3/MinIO and accessed via API proxy:

- **Report Endpoints**: `/api/test-results/tests/[testId]/report/` or `/api/test-results/jobs/[jobId]/report/`
- The API proxy:
  1. Authenticates the request
  2. Retrieves the report files from S3/MinIO
  3. Streams the content to the frontend
  4. Frontend displays the HTML report in an iframe

## Job Management

The application provides job management capabilities:

1. **Create**: Users can create jobs with multiple tests
2. **Run**: Jobs can be executed on-demand or scheduled with cron expressions
3. **Monitor**: Real-time status updates during execution
4. **View Results**: Comprehensive HTML reports with screenshots and traces
5. **Delete**: Jobs can be deleted safely with proper cascading deletion and error handling
   - All related test runs are deleted from the database
   - Job-test associations are removed
   - If the job is already deleted, a user-friendly warning is shown

## Key Benefits

1. **Scalability**: Multiple workers can process tests concurrently
2. **Reliability**: Failed jobs can be retried, with robust error handling
3. **Real-time Updates**: Users see test status in real-time via toast notifications
4. **Persistence**: Jobs survive application restarts
5. **Rich Reporting**: Comprehensive HTML reports with screenshots and traces
6. **Memory Management**: Redis TTL implementation prevents memory leaks
7. **Consistent UX**: Unified notification system for both test and job execution
8. **Trace Management**: Automatic processing of trace files for consistent report viewing
9. **Duration Tracking**: Test execution durations are tracked and displayed in reports 