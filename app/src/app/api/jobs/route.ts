import { NextResponse } from "next/server";
import { db } from "@/utils/db";
import {
  jobs,
  jobTests,
  tests as testsTable,
  runs,
  JobStatus,
  TestRunStatus,
  jobNotificationSettings,
} from "@/db/schema/schema";
import { desc, eq, inArray } from "drizzle-orm";

import { getTest } from "@/actions/get-test";
import { randomUUID } from "crypto";
import { getRunsForJob } from '@/actions/get-runs';

// Create a simple implementation here
async function executeJob(jobId: string, tests: { id: string; script: string }[]) {
  // This function is now simplified to just create a run record
  // The actual execution is handled by the backend service
  
  console.log(`Received job execution request: { jobId: ${jobId}, testCount: ${tests.length} }`);
  
  const runId = randomUUID();
  
  // Create a run record
  await db.insert(runs).values({
    id: runId,
    jobId: jobId,
    status: 'running' as TestRunStatus,
    startedAt: new Date(),
  });
  
  console.log(`[${jobId}] Created running test run record: ${runId}`);
  
  return {
    runId,
    jobId,
    status: 'running',
    message: 'Job execution request queued',
    // Properties needed for other parts of the code
    success: true,
    results: [],
    reportUrl: null
  };
}

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
  alertConfig?: {
    enabled: boolean;
    notificationProviders: string[];
    alertOnFailure: boolean;
    alertOnSuccess: boolean;
    alertOnTimeout: boolean;
    failureThreshold: number;
    recoveryThreshold: number;
    customMessage: string;
  };
  organizationId?: string;
  createdByUserId?: string;
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
export async function GET(request: Request) {
  try {
    const jobs = await getJobs();
    const jobsWithLastRunStatus = await Promise.all(
      jobs.map(async (job) => {
        const runs = await db.query.runs.findMany({
          where: eq(runs.jobId, job.id),
          orderBy: desc(runs.createdAt),
          limit: 1,
        });
        const lastRun = runs[0];
        return {
          ...job,
          status: lastRun ? lastRun.status : job.status,
        };
      })
    );
    return Response.json(jobsWithLastRunStatus);
  } catch (error) {
    console.error('Failed to fetch jobs with last run status:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch jobs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
    const [insertedJob] = await db.insert(jobs).values({
      id: jobId,
      name: jobData.name,
      description: jobData.description || null,
      cronSchedule: jobData.cronSchedule || null,
      status: jobData.status || 'pending',
      config: jobData.config || {},
      retryCount: jobData.retryCount || 0,
      timeoutSeconds: jobData.timeoutSeconds || 300,
      alertConfig: jobData.alertConfig ? {
        enabled: Boolean(jobData.alertConfig.enabled),
        notificationProviders: Array.isArray(jobData.alertConfig.notificationProviders) ? jobData.alertConfig.notificationProviders : [],
        alertOnFailure: jobData.alertConfig.alertOnFailure !== undefined ? Boolean(jobData.alertConfig.alertOnFailure) : true,
        alertOnSuccess: Boolean(jobData.alertConfig.alertOnSuccess),
        alertOnTimeout: Boolean(jobData.alertConfig.alertOnTimeout),
        failureThreshold: typeof jobData.alertConfig.failureThreshold === 'number' ? jobData.alertConfig.failureThreshold : 1,
        recoveryThreshold: typeof jobData.alertConfig.recoveryThreshold === 'number' ? jobData.alertConfig.recoveryThreshold : 1,
        customMessage: typeof jobData.alertConfig.customMessage === 'string' ? jobData.alertConfig.customMessage : "",
      } : null,
      organizationId: jobData.organizationId || null,
      createdByUserId: jobData.createdByUserId || null,
    }).returning();

    // Link notification providers if alert config is enabled
    if (insertedJob && jobData.alertConfig?.enabled && Array.isArray(jobData.alertConfig.notificationProviders)) {
      await Promise.all(
        jobData.alertConfig.notificationProviders.map(providerId =>
          db.insert(jobNotificationSettings).values({
            jobId: insertedJob.id,
            notificationProviderId: providerId,
          })
        )
      );
    }

    // If tests are provided, create job-test associations
    if (jobData.tests && jobData.tests.length > 0) {
      const jobTestValues = jobData.tests.map((test) => ({
        jobId: jobId,
        testId: test.id,
      }));

      await db.insert(jobTests).values(jobTestValues);
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

    if (!jobData.id) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!jobData.name || !jobData.cronSchedule || !jobData.description) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields. Name, description, and cron schedule are required.",
        },
        { status: 400 }
      );
    }

    // Update the job in the database
    await db
      .update(jobs)
      .set({
        name: jobData.name,
        description: jobData.description || "",
        cronSchedule: jobData.cronSchedule,
        status: jobData.status as JobStatus,
        alertConfig: (jobData as any).alertConfig || null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobData.id));

    // Delete existing job-test associations
    await db.delete(jobTests).where(eq(jobTests.jobId, jobData.id));

    // If tests are provided, create new job-test associations
    if (jobData.tests && jobData.tests.length > 0) {
      const jobTestValues = jobData.tests.map((test) => ({
        jobId: jobData.id!,
        testId: test.id,
      }));

      await db.insert(jobTests).values(jobTestValues);
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
    const runId = crypto.randomUUID();
    const startTime = new Date();

    // Insert a new test run record
    await db.insert(runs).values({
      id: runId,
      jobId,
      status: "running",
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
    const result = await executeJob(jobId, testScripts);

    // Map individual test results for the response
    const testResults = result.results && Array.isArray(result.results) 
      ? result.results.map((testResult: TestResult) => ({
          testId: testResult.testId,
          success: testResult.success,
          error: testResult.error,
          reportUrl: result.reportUrl, // All tests share the same report URL
        }))
      : [];

    // Calculate test duration
    const startTimeMs = startTime.getTime();
    const endTime = new Date().getTime();
    const durationMs = endTime - startTimeMs;
    const durationFormatted = `${Math.floor(durationMs / 1000)}s`;

    // Update the job status in the database
    await db
      .update(jobs)
      .set({
        status: result.success
          ? ("passed" as JobStatus)
          : ("failed" as JobStatus),
        lastRunAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // Create a separate variable for logs data that includes stdout and stderr
    const logsData = result.results && Array.isArray(result.results)
      ? result.results.map((r: TestResult) => {
          // Create a basic log entry with the test ID
          const logEntry: { testId: string; stdout: string; stderr: string } = {
            testId: r.testId,
            stdout: r.stdout?.toString() || "",
            stderr: r.stderr?.toString() || "",
          };

          // Return the log entry
          return logEntry;
        })
      : [];

    // Stringify the logs data for storage
    const logs = JSON.stringify(logsData);

    // Get error details if any tests failed
    const errorDetails = result.success
      ? null
      : JSON.stringify(
          result.results && Array.isArray(result.results) 
            ? result.results.filter((r: TestResult) => !r.success).map((r: TestResult) => r.error)
            : []
        );

    // Check if any individual tests failed - this is an additional check to ensure
    // we correctly flag runs with failed tests
    const hasFailedTests = result.results && Array.isArray(result.results) 
      ? result.results.some((r: TestResult) => !r.success)
      : false;

    // Update the test run record with results
    await db
      .update(runs)
      .set({
        status: hasFailedTests
          ? ("failed" as TestRunStatus)
          : ("passed" as TestRunStatus),
        duration: durationFormatted,
        completedAt: new Date(),
        logs: logs || "",
        errorDetails: errorDetails || "",
      })
      .where(eq(runs.id, runId));

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
