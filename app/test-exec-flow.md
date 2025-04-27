# Test Execution Flow

**Note:** This document describes the test execution flows initiated via the web user interface (Playground and Jobs), which involve API calls, job queuing, and potentially S3 storage. For running tests directly without the UI or queue, refer to the [Direct Playwright CLI section in the README](../README.md#running-tests-via-playwright-cli).

## Flow Diagram

```mermaid
flowchart TB
    subgraph "Single Test Execution (Playground)"
        A1[User clicks 'Run Test' in Playground] --> B1[Frontend validates inputs]
        B1 --> C1[Send POST to /api/test]
        C1 --> D1[API Handler (executeTest)]
        D1 --> E1[Generate Test ID + Setup]
        E1 --> F1[Write test to temp file]
        F1 --> G1[Create initial report]
        G1 --> H1[Queue task in BullMQ 'test-execution' queue]
        H1 --> I1[Worker picks up task]
        I1 --> J1[Execute Playwright test]
        J1 --> K1[Write reports & artifacts locally]
        K1 --> L1[Update DB status]
        
        M1[Frontend polls/SSE for status] --> N1[Receives updates]
        N1 --> O1[Displays report using shared component]
    end
    
    subgraph "Multiple Test Execution (Jobs)"
        A2[User runs job via UI] --> B2[POST to /api/jobs/run]
        B2 --> C2[API Handler (executeJob)]
        C2 --> D2[Create test run record in DB]
        D2 --> E2[Fetch associated tests]
        E2 --> F2[Queue job in BullMQ 'job-execution' queue]
        F2 --> G2[Worker picks up task]
        G2 --> H2[Create run directories]
        H2 --> I2[Write test files]
        I2 --> J2[Execute Playwright tests]
        J2 --> K2[Generate reports & artifacts]
        K2 --> L2[Upload to S3 if configured]
        L2 --> M2[Update DB status]
        
        N2[Frontend polls/SSE for status] --> O2[Receives updates]
        O2 --> P2[Displays report using shared component]
    end
    
    R[Shared ReportViewer Component] <--> O1
    R <--> P2
    
    C1 -.-> |API Response (Test ID)| M1
    C2 -.-> |API Response (Run ID)| N2
```

## Single Test Execution (Playground)

1. **Initiation**: User clicks "Run Test" in the Playground UI.
2. **API Call**: Frontend sends the test code and configuration to the `/api/test` endpoint.
3. **Backend Processing**:
    * Generates a unique Test ID and Run ID.
    * Creates necessary local directories for this specific run based on `playwright.config.mjs`.
    * Writes the test code to a temporary file within the run directory.
    * Validates the test code.
    * Creates an initial loading HTML page.
    * Adds a task to the BullMQ `test-execution` queue, including the Test ID and path to the temporary script.
4. **Worker Execution**:
    * A BullMQ worker picks up the task.
    * Executes the Playwright test via a child process.
    * Playwright writes the results and artifacts locally according to the paths in the configuration.
    * The worker updates the test status in the database.
5. **Frontend Display**:
    * The UI receives real-time updates via Server-Sent Events (SSE).
    * The ReportViewer component displays the final results.

## Multiple Test Execution (Jobs)

1. **Initiation**: User runs a job via the UI.
2. **API Call**: Frontend sends a request to the `/api/jobs/run` endpoint with the Job ID.
3. **Backend Processing**:
    * Creates a Test Run record in the database with `pending` status.
    * Retrieves all test scripts associated with the job.
    * Adds a task to the BullMQ `job-execution` queue with the Test Run ID.
4. **Worker Execution**:
    * A BullMQ worker picks up the job task.
    * Creates the necessary run directories.
    * Writes each test script to individual files.
    * Executes all Playwright tests.
    * Processes the results and combines reports.
    * Optionally uploads the combined report to S3 if configured.
    * Updates the Test Run status in the database.
5. **Frontend Display**:
    * The UI receives status updates via SSE.
    * The shared ReportViewer component displays the results.

## UI Consistency and Code Reuse

To ensure consistent user experience and maximize code reuse between Playground and Jobs:

* **Shared ReportViewer Component**: Both single test and job execution flows use the same ReportViewer component, which provides:
  * Intelligent loading states with progress indicators
  * Error handling with user-friendly messages
  * Automatic detection of trace viewer navigation
  * Sandboxed iframe for secure report rendering
  * Dark/light mode support to match UI preferences
  * Consistent navigation controls (back button, reload)
* **Common Status Updates**: Both flows rely on the same SSE implementation for real-time status updates.
* **Unified Report Retrieval Logic**: The same logic is used to attempt local file access first before falling back to S3 (when applicable).
* **Consistent Artifacts Access**: Screenshots, videos, and traces are accessed through the same UI patterns in both flows.
* **Normalized Data Structure**: Test results are normalized to a common format regardless of source.

## Test Artifact Storage

Test results and artifacts are stored based on the execution method and configuration:

* **Local Filesystem:** All tests executed via the UI initially store their results locally. The paths are determined by `playwright.config.mjs`:
  * **HTML Reports:** Typically stored under `public/test-results/tests/report/` (or `PLAYWRIGHT_REPORT_DIR`).
  * **Other Artifacts:** Typically stored in a run-specific directory under `public/artifacts/<runId>/` (or `PLAYWRIGHT_OUTPUT_DIR`).
* **S3 Storage (Optional):** For tests run as part of a Job, the final combined report and artifacts can be uploaded to S3 if configured, providing persistent storage independent of the local filesystem.
* **Database:** Metadata about tests, jobs, and test runs is stored in PostgreSQL.

## Playwright Configuration (`playwright.config.mjs`)

Key settings influencing execution include:

* `testDir`: Directory where Playwright looks for test files (`./public/tests`).
* `outputDir`: Directory for artifacts like screenshots and traces (`./public/artifacts/${runId}`).
* `reporter`: Configures the HTML report output directory (`./public/test-results/tests/report`).
* `workers`: Maximum number of concurrent worker processes (defaults to 3).
* `retries`: Number of retry attempts for failed tests (defaults to 1).

## Queue System

BullMQ provides a robust, Redis-based job queue system:

* **Scalability:** Multiple workers can process jobs across different containers.
* **Reliability:** Failed jobs can be automatically retried with configurable backoff.
* **Concurrency Control:** The `MAX_CONCURRENT_TESTS` environment variable limits concurrent job processing.
* **Persistence:** Jobs are stored in Redis and survive application restarts.
* **Real-time Updates:** The system uses Redis pub/sub for real-time status updates.

## Error Handling

* **Test Validation:** Tests are validated before execution to catch syntax errors.
* **Timeouts:** The `TEST_EXECUTION_TIMEOUT_MS` environment variable limits maximum test execution time.
* **Retries:** Failed tests can be automatically retried based on configuration.
* **Worker Recovery:** BullMQ automatically handles stalled jobs when workers crash.
* **UI Feedback:** The ReportViewer component provides user-friendly error messages when tests fail.

## Environment Configuration

Key environment variables that control the execution flow:

* **Database:** `DATABASE_URL` for PostgreSQL connection.
* **Redis:** `REDIS_URL` for BullMQ connection.
* **S3 Storage:** `AWS_*` and `S3_*` variables for artifact storage.
* **Execution Parameters:**
  * `MAX_CONCURRENT_TESTS`: Limits concurrent test executions (default: 3).
  * `TEST_EXECUTION_TIMEOUT_MS`: Maximum test execution time (default: 15 minutes).
* **Playwright Settings:** `PLAYWRIGHT_*` variables for overriding default configurations.

## Performance Optimizations

* **Distributed Workers:** BullMQ workers can be distributed across multiple instances.
* **Concurrency Control:** Fine-tuned job processing limits prevent resource exhaustion.
* **Local-First Storage:** Reports are stored locally first to reduce latency.
* **S3 Lazy Loading:** The S3 client is initialized only when needed.
* **Intelligent Error Recovery:** BullMQ automatically handles worker crashes and job retries.
