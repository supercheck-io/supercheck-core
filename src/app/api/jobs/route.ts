import { NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  jobs,
  jobTests,
  tests,
  testRuns,
  JobStatus,
  TestRunStatus,
} from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

import { executeMultipleTests } from "@/lib/test-execution";
import { getTest } from "@/actions/get-test";
import { randomUUID } from "crypto";

interface Test {
  id: string;
  name?: string;
  title?: string;
  script?: string;
}

interface JobData {
  id?: string;
  name: string;
  description: string;
  cronSchedule: string;
  status?: JobStatus;
  timeoutSeconds: number;
  retryCount: number;
  config: Record<string, unknown>;
  tests: Test[];
}

// Define the TestResult interface to match what's returned by executeMultipleTests
interface TestResult {
  testId: string;
  success: boolean;
  error: string | null;
  stdout?: string;
  stderr?: string;
}

// GET all jobs
export async function GET() {
  try {
    const dbInstance = await db();

    // Get all jobs from the database
    const allJobs = await dbInstance
      .select()
      .from(jobs)
      .leftJoin(jobTests, eq(jobs.id, jobTests.jobId))
      .orderBy(desc(jobs.createdAt));

    // Group jobs by ID and collect test IDs
    const jobMap = new Map<string, unknown>();
    for (const row of allJobs) {
      const job = row.jobs;
      const testId = row.job_tests?.testId;

      if (!jobMap.has(job.id)) {
        jobMap.set(job.id, {
          ...job,
          tests: testId ? [{ testId }] : [],
        });
      } else if (testId) {
        const existingJob = jobMap.get(job.id);
        (existingJob as { tests: { testId: string }[] }).tests.push({ testId });
      }
    }

    // Convert map to array
    const jobsArray = Array.from(jobMap.values());

    // Map the jobs to include full test information
    const jobsWithTests = await Promise.all(
      jobsArray.map(async (job) => {
        // Get the test IDs associated with this job
        const testIds = (job as { tests: { testId: string }[] }).tests.map(
          (test: { testId: string }) => test.testId
        );

        // If there are test IDs, fetch the full test information
        let testDetails: Test[] = [];
        if (testIds.length > 0) {
          // Fetch test details for each test ID
          const testResults = await dbInstance
            .select()
            .from(tests)
            .where(inArray(tests.id, testIds));

          // Convert test results to match our Test interface
          testDetails = testResults.map((test) => ({
            id: test.id,
            name: test.title,
            type: test.type,
          }));
        }

        // Return the job with its associated tests
        return {
          ...(job as object),
          tests: testDetails,
        };
      })
    );

    return NextResponse.json({ success: true, jobs: jobsWithTests });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

// POST to create a new job
export async function POST(request: Request) {
  try {
    // Check if this is a job execution request
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "run") {
      return await runJob(request);
    }

    // Regular job creation
    const jobData: JobData = await request.json();
    const dbInstance = await db();

    // Validate required fields
    if (!jobData.name || !jobData.cronSchedule) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields. Name and cron schedule are required.",
        },
        { status: 400 }
      );
    }

    // Generate a unique ID for the job
    const jobId = randomUUID();

    // Insert the job into the database with default values for nullable fields
    await dbInstance.insert(jobs).values({
      name: jobData.name,
      description: jobData.description || "",
      cronSchedule: jobData.cronSchedule,
      status: (jobData.status || "pending") as JobStatus,
    });

    // If tests are provided, create job-test associations
    if (jobData.tests && jobData.tests.length > 0) {
      const jobTestValues = jobData.tests.map((test) => ({
        jobId: jobId,
        testId: test.id,
      }));

      await dbInstance.insert(jobTests).values(jobTestValues);
    }

    return NextResponse.json({
      success: true,
      job: {
        id: jobId,
        name: jobData.name,
        description: jobData.description || "",
        cronSchedule: jobData.cronSchedule,
      },
    });
  } catch (error) {
    console.error("Error creating job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create job" },
      { status: 500 }
    );
  }
}

// PUT to update an existing job
export async function PUT(request: Request) {
  try {
    const jobData: JobData = await request.json();
    const dbInstance = await db();

    if (!jobData.id) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!jobData.name || !jobData.cronSchedule) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields. Name and cron schedule are required.",
        },
        { status: 400 }
      );
    }

    // Update the job in the database
    await dbInstance
      .update(jobs)
      .set({
        name: jobData.name,
        description: jobData.description || "",
        cronSchedule: jobData.cronSchedule,
        status: jobData.status as JobStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobData.id));

    // Delete existing job-test associations
    await dbInstance.delete(jobTests).where(eq(jobTests.jobId, jobData.id));

    // If tests are provided, create new job-test associations
    if (jobData.tests && jobData.tests.length > 0) {
      const jobTestValues = jobData.tests.map((test) => ({
        jobId: jobData.id!,
        testId: test.id,
      }));

      await dbInstance.insert(jobTests).values(jobTestValues);
    }

    return NextResponse.json({
      success: true,
      job: {
        id: jobData.id,
        name: jobData.name,
        description: jobData.description || "",
        cronSchedule: jobData.cronSchedule,
      },
    });
  } catch (error) {
    console.error("Error updating job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update job" },
      { status: 500 }
    );
  }
}

// Helper function to run a job
async function runJob(request: Request) {
  try {
    // Parse the job data from the request
    const data = await request.json();
    const { jobId, tests } = data;

    if (!jobId || !tests || !Array.isArray(tests) || tests.length === 0) {
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

    // Prepare test scripts for execution
    const testScripts = [];

    // Fetch test scripts for each test in the job
    for (const test of tests) {
      // If script is missing, try to fetch it
      let testScript = test.script;
      let testName = test.name || test.title || `Test ${test.id}`;

      if (!testScript) {
        // Fetch the test from the database to get the script
        const testResult = await getTest(test.id);
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
            `,
          });
          continue;
        }
      }

      // Add the test to our list
      testScripts.push({
        id: test.id,
        name: testName,
        script: testScript,
      });
    }

    // Execute all tests in a single run
    const result = await executeMultipleTests(testScripts, runId);

    // Map individual test results for the response
    const testResults = result.results.map((testResult: TestResult) => ({
      testId: testResult.testId,
      success: testResult.success,
      error: testResult.error,
      reportUrl: result.reportUrl, // All tests share the same report URL
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
        status: result.success
          ? ("completed" as JobStatus)
          : ("failed" as JobStatus),
        lastRunAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId));

    // Create a separate variable for logs data that includes stdout and stderr
    const logsData = result.results.map((r: TestResult) => {
      // Create a basic log entry with the test ID
      const logEntry: { testId: string; stdout: string; stderr: string } = {
        testId: r.testId,
        stdout: r.stdout?.toString() || "",
        stderr: r.stderr?.toString() || "",
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
          result.results.filter((r) => !r.success).map((r) => r.error)
        );

    // Update the test run record with results
    await dbInstance
      .update(testRuns)
      .set({
        status: result.success
          ? ("passed" as TestRunStatus)
          : ("failed" as TestRunStatus),
        completedAt: new Date().toISOString(),
        duration: durationFormatted,
        logs,
        errorDetails,
      })
      .where(eq(testRuns.id, runId));

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
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}
