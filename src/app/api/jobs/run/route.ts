import { NextResponse } from "next/server";
import { executeMultipleTests } from "@/lib/test-execution";
import { getTest } from "@/actions/get-test";
import { db } from "@/db/client";
import { jobs, testRuns, JobStatus, TestRunStatus } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// Define the TestResult interface to match what's returned by executeMultipleTests
interface TestResult {
  testId: string;
  success: boolean;
  error: string | null;
  stdout?: string;
  stderr?: string;
}

export async function POST(request: Request) {
  try {
    // Parse the job data from the request
    const data = await request.json();
    const { jobId, tests } = data;

    console.log("Received job execution request:", { jobId, testCount: tests?.length });
    
    if (!jobId || !tests || !Array.isArray(tests) || tests.length === 0) {
      console.error("Invalid job data:", { jobId, tests });
      return NextResponse.json(
        { error: "Invalid job data. Job ID and tests are required." },
        { status: 400 }
      );
    }

    // Create a new test run record in the database
    const dbInstance = await db();
    const runId = crypto.randomUUID();
    const startTime = new Date().toISOString();
    
    // Insert a new test run record
    await dbInstance.insert(testRuns).values({
      id: runId,
      jobId: jobId,
      status: "pending",
      startedAt: startTime,
    });

    console.log(`Created test run record with ID: ${runId}`);

    // Prepare test scripts for execution
    const testScripts = [];
    
    // Fetch test scripts for each test in the job
    for (const test of tests) {
      console.log("Processing test:", test);
      
      // If script is missing, try to fetch it
      let testScript = test.script;
      let testName = test.name || test.title || `Test ${test.id}`;
      
      if (!testScript) {
        console.log(`Fetching script for test ${test.id}`);
        // Fetch the test from the database to get the script
        const testResult = await getTest(test.id);
        console.log("Test fetch result:", { success: testResult.success, hasScript: !!testResult.test?.script });
        
        if (testResult.success && testResult.test?.script) {
          testScript = testResult.test.script;
          testName = testResult.test.title || testName;
        } else {
          console.error(`Failed to fetch script for test ${test.id}`);
          // Add a placeholder for tests without scripts
          testScripts.push({
            id: test.id,
            name: testName,
            script: `
              test('Missing test script', async ({ page }) => {
                test.fail();
                console.log('Test script not found');
                expect(false).toBeTruthy();
              });
            `
          });
          continue;
        }
      }

      // Add the test to our list
      testScripts.push({
        id: test.id,
        name: testName,
        script: testScript
      });
    }

    console.log(`Prepared ${testScripts.length} test scripts for execution`);

    // Execute all tests in a single run, using runId instead of jobId
    const result = await executeMultipleTests(testScripts, runId);
    console.log("Test execution result:", { success: result.success, reportUrl: result.reportUrl });
    
    // Map individual test results for the response
    const testResults = result.results.map(testResult => ({
      testId: testResult.testId,
      success: testResult.success,
      error: testResult.error,
      reportUrl: result.reportUrl // All tests share the same report URL
    }));

    // Calculate test duration
    const startTimeDate = new Date(startTime).getTime();
    const endTime = new Date().getTime();
    const durationMs = endTime - startTimeDate;
    const durationFormatted = `${Math.floor(durationMs / 1000)}s`;

    // Update the job status in the database
    await dbInstance
      .update(jobs)
      .set({
        status: result.success ? "completed" as JobStatus : "failed" as JobStatus,
        lastRunAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId));

    console.log(`Updated job status to ${result.success ? "completed" : "failed"}`);

    // The test results from executeMultipleTests don't include stdout/stderr in the results array
    // So we need to create a separate structure for logs
    const logsData = result.results.map((r: TestResult) => {
      // Create a basic log entry with the test ID
      const logEntry: { testId: string; stdout: string; stderr: string } = {
        testId: r.testId,
        stdout: r.stdout || "",
        stderr: r.stderr || ""
      };
      
      // Return the log entry
      return logEntry;
    });
    
    // Stringify the logs data for storage
    const logs = JSON.stringify(logsData);

    // Get error details if any tests failed
    const errorDetails = result.success 
      ? null 
      : JSON.stringify(
          result.results
            .filter(r => !r.success)
            .map(r => r.error)
        );
    
    // Check if any individual tests failed - this is an additional check to ensure
    // we correctly flag runs with failed tests
    const hasFailedTests = result.results.some(r => !r.success);
    
    // Update the test run record with results
    await dbInstance
      .update(testRuns)
      .set({
        status: (result.success && !hasFailedTests) ? "passed" as TestRunStatus : "failed" as TestRunStatus,
        completedAt: new Date().toISOString(),
        duration: durationFormatted,
        logs,
        errorDetails,
      })
      .where(eq(testRuns.id, runId));

    console.log(`Updated test run record with results, status: ${(result.success && !hasFailedTests) ? "passed" : "failed"}`);

    // Return the combined result with the run ID
    return NextResponse.json({
      jobId,
      runId,
      success: result.success,
      reportUrl: result.reportUrl,
      results: testResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error running job:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}
