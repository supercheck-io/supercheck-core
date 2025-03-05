# Test Execution Flow Documentation

This document explains the complete flow of test execution in the SuperTest application, from when a user clicks "Run Script" until the report is displayed in the iframe.

## Flow Diagram

```
┌───────────────────────────┐         ┌───────────────────────┐          ┌───────────────────────────┐
│     UI Component          │         │                       │          │      Test Execution        │
│                           │         │     API Endpoint      │          │                           │
│ 1. User clicks Run Test   │──────►  │ 5. /api/test (POST)   │────────► │ 6. executeTest()          │
│ 2. Switch to report tab   │         │    - Parse request    │          │    - Generate test ID      │
│ 3. Validate inputs        │         │    - Call executeTest │          │    - Create directories    │
│ 4. Prepare test data      │         │    - Return result    │          │    - Create initial report │
└───────────┬───────────────┘         └───────────────────────┘          └────────────┬──────────────┘
            │                                      ▲                                   │
            │                                      │                                   ▼
            │                                      │                     ┌───────────────────────────┐
            │                                      │                     │  Background Execution      │
            │                                      │                     │                           │
            │                                      │                     │ 11. executeTestInChild    │
            │                                      │                     │     - Run Playwright test │
            │                                      │                     │     - Generate final report│
            │                                      │                     └────────────┬──────────────┘
┌───────────▼───────────────┐                      │                                  │
│     UI Updates            │                      │                                  │
│                           │                      │                                  │
│ 7. Add test to list       │         ┌───────────────────────┐                      │
│ 8. Set initial report URL │◄────────┤  Status API Endpoint  │◄─────────────────────┘
│ 9. Start polling          │         │ 10. /api/test-status  │
└───────────┬───────────────┘         │     - Check test state │
            │                         │     - Verify report    │
            │                         └───────────────────────┘
            │                                     ▲
            │                                     │
            │                                     │
┌───────────▼───────────────┐                     │
│    Polling & Display      │                     │
│                           │─────────────────────┘
│ 12. Check if complete     │
│ 13. Update report URL     │
│ 14. Display final report  │
└───────────────────────────┘
```

## Detailed Step-by-Step Execution Flow

### Phase 1: UI Interaction & API Call

1. **User Clicks "Run Test" Button**: The process begins when the user clicks the "Run Test" button in the UI, triggering the `runTest()` function.

2. **Switch to Report Tab**: The UI automatically switches to the report tab to show immediate feedback.

3. **Validate Inputs**: The code validates required inputs like the test title.

4. **Prepare Test Data**: The code, title, description, and tags are packaged into an object to send to the API.

5. **API Endpoint Call**: The frontend sends a POST request to `/api/test` with the test data.

### Phase 2: Backend Execution Setup

6. **Execute Test Function**: The API endpoint calls the `executeTest()` function, which:
   - Generates a unique test ID using `crypto.randomUUID()`
   - Marks the test as active in the tracking system
   - Creates directories for test artifacts
   - Validates the test code
   - Creates an initial "loading" HTML report
   - Updates the test status to "running"
   - Starts the actual test execution in a child process

7. **Frontend Updates Test List**: After receiving the API response, the frontend adds the new test to the list with "pending" status.

8. **Set Initial Report URL**: The frontend sets the iframe source to the initial report URL, which shows a loading indicator.

9. **Start Polling**: The frontend starts polling for test status updates every 2 seconds.

### Phase 3: Background Test Execution & Status Updates

10. **Status API Endpoint**: The polling calls the `/api/test-status/{testId}` endpoint, which:
    - Gets the current test status from the global map
    - Verifies if the report actually exists
    - Checks the report content to see if it's still the loading report or the final report
    - Returns the current status to the frontend

11. **Background Test Execution**: Meanwhile, the test runs in a child process:
    - The Playwright test executes in a separate process
    - Output (stdout/stderr) is collected
    - When the test completes, a final HTML report is generated
    - The test status is updated to "completed"

### Phase 4: Report Display & Completion

12. **Check Test Completion**: When polling detects the test is complete, it stops polling.

13. **Update Report URL**: The frontend updates the iframe source with a cache-busting parameter to ensure the latest report is displayed.

14. **Display Final Report**: The iframe shows the final Playwright HTML report with test results.

### Phase 5: Viewing Previous Test Reports

When a user clicks on a previous test run in the test list:

- The `selectTestReport()` function is called
- The report URL is constructed with the selected test ID
- The iframe source is updated to display the selected test report
- The UI switches to the report tab

## Key Implementation Details

1. **Initial Loading Report**: A temporary HTML report is generated immediately, showing a spinner and auto-refreshing.

2. **Non-Blocking Execution**: Tests run in a child process, allowing the UI to remain responsive.

3. **Polling Mechanism**: The UI polls the status API to check when a test completes.

4. **Report Detection**: The status API checks the content of the report to determine if it's still the loading report.

5. **Test Tracking**: Active tests are tracked to prevent premature cleanup of test directories.

6. **Cleanup Management**: Test directories are preserved for a configurable time (default: 24 hours) before cleanup.

This architecture ensures users get immediate feedback while tests run in the background, and can view both in-progress and completed test reports seamlessly.
