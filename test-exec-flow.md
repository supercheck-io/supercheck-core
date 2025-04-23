# Test Execution Flow

**Note:** This document describes the test execution flows initiated via the web user interface (Playground and Jobs), which involve API calls, job queuing (pg-boss), and potentially S3 storage. For running tests directly without the UI or queue, refer to the [Direct Playwright CLI section in the README](../README.md#running-tests-via-playwright-cli).

## Flow Diagram

```mermaid
flowchart TB
    subgraph "Single Test Execution (Playground)"
        A1[User clicks 'Run Test' in Playground] --> B1[Frontend validates inputs]
        B1 --> C1[Send POST to /api/test]
        C1 --> D1[API Handler (executeTest logic)]
        D1 --> E1[Generate test ID & unique run directories]
        E1 --> F1[Write test code to temp file]
        F1 --> G1[Create initial loading report (local)]
        G1 --> H1[Queue test task via pgboss (`test-execution` queue)]
        H1 --> I1[Worker picks up task]
        I1 --> J1[Execute Playwright test in child process]
        J1 --> K1[Playwright writes report & artifacts locally]
        K1 --> L1[Worker updates DB status]
        
        M1[Frontend polls/SSE for status] --> N1[Receives updates]
        N1 --> O1[Displays report using shared UI component]
    end
    
    subgraph "Multiple Test Execution (Jobs)"
        A2[User runs job via UI] --> B2[Frontend sends POST to /api/jobs/run]
        B2 --> C2[API Handler (executeMultipleTests logic)]
        C2 --> D2[Create test run record in DB (status: pending)]
        D2 --> E2[Fetch test scripts associated with job]
        E2 --> F2[Queue job task via pgboss (`job-execution` queue)]
        F2 --> G2[Worker picks up task]
        G2 --> H2[Create unique run directories]
        H2 --> I2[Write individual test files locally]
        I2 --> J2[Execute Playwright tests via config]
        J2 --> K2[Playwright writes reports & artifacts locally]
        K2 --> L2[Worker processes results, combines reports]
        L2 --> M2[Optionally Upload combined report to S3]
        M2 --> N2[Worker updates DB status (complete/failed)]
        
        O2[Frontend polls/SSE for status] --> P2[Receives updates]
        P2 --> Q2[Displays report using shared UI component]
    end
    
    R[Shared ReportViewer Component] <--> O1
    R <--> Q2
    
    C1 -.-> |API Response (Test ID)| M1
    C2 -.-> |API Response (Run ID)| O2
```

## Single Test Execution (Playground)

1. **Initiation**: User clicks "Run Test" in the Playground UI.
2. **API Call**: Frontend sends the test code and configuration to the `/api/test` endpoint.
3. **Backend Processing**:
    * Generates a unique Test ID and Run ID.
    * Creates necessary local directories for this specific run based on `playwright.config.mjs` (e.g., within `public/artifacts/<runId>/`).
    * Writes the test code to a temporary file within the run directory.
    * Validates the test code.
    * Generates an initial loading HTML page.
    * Adds a task to the `test-execution` pg-boss queue, including the Test ID and path to the temporary script.
4. **Worker Execution**:
    * A pg-boss worker picks up the task (respecting `MAX_CONCURRENT_TESTS`).
    * Executes the Playwright test using the temporary script in a child process.
    * Playwright generates the HTML report and any artifacts (screenshots, videos, traces) locally according to paths in `playwright.config.mjs` (e.g., report in `public/test-results/tests/report`, artifacts in `public/artifacts/<runId>`).
    * The worker updates the test status in the database upon completion or failure.
5. **Frontend Display**:
    * The UI receives real-time status updates via Server-Sent Events (SSE).
    * Upon completion, the UI uses the same shared ReportViewer component as the job execution flow.
    * The component first attempts to load the report locally, with optional fallback to S3 if configured.
    * Access to screenshots, videos, and other artifacts is provided through the same UI patterns as job execution.

## Multiple Test Execution (Jobs)

1. **Job Submission**: User initiates a job run via the UI, sending a POST request to `/api/jobs/run` with the Job ID.
2. **Backend Processing**:
    * Creates a Test Run record in the database with `pending` status.
    * Fetches the test scripts associated with the Job ID from the database.
    * Adds a task to the `job-execution` pg-boss queue with the Test Run ID.
3. **Worker Execution**:
    * A pg-boss worker picks up the job task.
    * Creates unique local directories for this specific run (similar to single tests).
    * Writes each test script associated with the job to individual files within the run directory.
    * Validates each test script.
    * Executes all the Playwright tests using the generated files and the global `playwright.config.mjs`.
    * Playwright generates individual reports and artifacts locally (same paths as single tests).
    * The worker processes the results, potentially combining reports.
    * **Optional S3 Upload:** If S3 is configured, the worker uploads the combined report/artifacts to the specified bucket (`S3_JOB_BUCKET_NAME`).
    * The worker updates the Test Run status in the database (`completed` or `failed`).
4. **Frontend Display**:
    * The UI receives real-time status updates via Server-Sent Events (SSE).
    * Upon completion, the UI uses the shared ReportViewer component to display the final report.
    * The component first attempts to load the report locally, with fallback to S3 if available.

## UI Consistency and Code Reuse

To ensure consistent user experience and maximize code reuse between Playground and Jobs:

* **Shared Report Component**: Both single test and job execution flows use the same ReportViewer component.
* **Common Status Updates**: Both flows rely on the same SSE implementation for real-time status updates.
* **Unified Report Retrieval Logic**: The same logic is used to attempt local file access first before falling back to S3 (when applicable).
* **Consistent Artifacts Access**: Screenshots, videos, and traces are accessed through the same UI patterns in both flows.
* **Normalized Data Structure**: Test results are normalized to a common format regardless of coming from a single test or a job run.

## Test Artifact Storage

Test results and artifacts are stored based on the execution method and configuration:

* **Local Filesystem:** All tests executed via the UI (Playground or Jobs) initially store their results locally. The paths are determined by `playwright.config.mjs`:
  * **HTML Reports:** Typically stored under `public/test-results/tests/report/` (or `PLAYWRIGHT_REPORT_DIR`). Playwright usually creates one combined report here.
  * **Other Artifacts (Screenshots, Videos, Traces):** Typically stored in a run-specific directory under `public/artifacts/<runId>/` (or `PLAYWRIGHT_OUTPUT_DIR`). The `runId` is generated for each execution.
  * *Note:* Traces might be configured to be embedded directly within the HTML report.
* **S3 Storage (Optional):** For tests run as part of a **Job**, the final combined report and artifacts *can* be uploaded to an S3-compatible bucket if configured via environment variables (`AWS_*`, `S3_*`). This provides persistent storage independent of the local filesystem.
* **Database:** Metadata about tests, jobs, and test runs (status, IDs, timestamps, associated scripts, S3 report URL if applicable) is stored in the PostgreSQL database.

## Playwright Configuration (`playwright.config.mjs`)

Key settings influencing execution include:

* `testDir`: Directory where Playwright looks for test files (`*.spec.js`) by default (`./public/tests`).
* `reporter`: Configures the HTML report output directory (`./public/test-results/tests/report`).
* `outputDir`: Directory for storing artifacts like screenshots, videos, traces (`./public/artifacts/${runId}`).
* `use`: Default options like `headless`, `trace`, `video`, `screenshot` modes.
* `projects`: Defines browsers to run against (e.g., `chromium`).
* `workers`: Default number of parallel workers (`3`).
* `retries`: Default number of retries for failed tests (`1`).

These can often be overridden by environment variables (see `README.md`).

## Error Handling

* **Code Validation Failures:** Errors during script validation are reported back immediately.
* **Execution Failures:** Playwright captures errors; these are reflected in the report and the database status.
* **Timeouts:** Governed by `TEST_EXECUTION_TIMEOUT_MS` for UI-driven tests and Playwright's own timeouts (`timeout`, `expect.timeout`).
* **Queue/Worker Issues:** `pg-boss` has built-in retry mechanisms.

## Key Implementation Details

* **Queue System:** `pg-boss` provides reliable, database-backed queuing for all UI-driven tests.
* **Concurrency:** Managed via `MAX_CONCURRENT_TESTS` setting for pg-boss workers.
* **Isolation:** Tests run in child processes.
* **Real-time Updates:** Server-Sent Events (SSE) provide live progress.
* **Lazy S3:** The S3 client is initialized only when needed for uploading/retrieving job results.
* **Local Fallback:** If an S3 URL exists for a job result but fetching fails, the system may attempt to serve a local copy if available.
* **Environment Variables:** Crucial for database connection, S3 config, and tuning execution parameters (see `README.md`).

## Performance Optimizations

* **Unified Queue System:** Consistent handling for single and multiple tests.
* **Lazy S3 Initialization:** Avoids unnecessary S3 connections.
* **Local-First Storage:** Prioritizes local results, reducing S3 dependency for basic viewing.
* **Optimized Artifact Paths:** Unique `runId` prevents collisions between concurrent runs.

## Environment Configuration

The application uses two environment files:

1. **.env**: Base configuration with default values
   * Contains S3/MinIO configuration and database settings
   * Used in both development and production
   * Should NOT contain sensitive secrets for production

2. **.env.local**: Development overrides (not committed to version control)
   * Used for local development settings
   * Contains developer-specific configuration
   * Can override values from .env

**Current Configuration**:

* S3 endpoint and credentials for artifact storage
* Database file location
* BrowserStack credentials
* Test execution settings:
  * `MAX_CONCURRENT_TESTS`: Number of tests running in parallel (default: 2)
  * `TEST_EXECUTION_TIMEOUT_MS`: Maximum test execution time (default: 900000ms)
  * `TRACE_RECOVERY_INTERVAL_MS`: How often to check for trace issues (default: 300000ms)

**Best Practices Recommendations**:

* Keep the dual-file approach (.env + .env.local) which follows Next.js conventions
* Move sensitive credentials to .env.local only
* Add documentation for required environment variables
* Consider using environment-specific files (.env.production) for deployment
