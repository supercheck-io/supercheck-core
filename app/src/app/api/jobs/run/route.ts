import { NextResponse } from "next/server";
import { getTest } from "@/actions/get-test";
import { createDb } from "@/db/client";
import { jobs, runs, JobStatus, TestRunStatus } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { addJobToQueue, JobExecutionTask } from "@/lib/queue";

export async function POST(request: Request) {
  let jobId: string | null = null;
  let runId: string | null = null;
  let dbInstance = await createDb();

  try {
    const data = await request.json();
    jobId = data.jobId as string;
    const tests = data.tests;

    console.log(`Received job execution request:`, { jobId, testCount: tests?.length });
    
    if (!jobId || !tests || !Array.isArray(tests) || tests.length === 0) {
      console.error("Invalid job data:", { jobId, tests });
      return NextResponse.json(
        { error: "Invalid job data. Job ID and tests are required." },
        { status: 400 }
      );
    }

    runId = crypto.randomUUID();
    const startTime = new Date();
    
    await dbInstance.insert(runs).values({
      id: runId,
      jobId,
      status: "running",
      startedAt: startTime,
    });

    console.log(`[${jobId}/${runId}] Created running test run record: ${runId}`);

    const testScripts = [];
    
    for (const test of tests) {
      let testScript = test.script;
      let testName = test.name || test.title || `Test ${test.id}`;
      if (!testScript) {
        console.log(`[${jobId}/${runId}] Fetching script for test ${test.id}`);
        const testResult = await getTest(test.id);
        if (testResult.success && testResult.test?.script) {
          testScript = testResult.test.script;
          testName = testResult.test.title || testName;
        } else {
          console.error(`[${jobId}/${runId}] Failed to fetch script for test ${test.id}, skipping.`);
          continue;
        }
      }
      testScripts.push({ id: test.id, name: testName, script: testScript });
    }

    if (testScripts.length === 0) {
        console.error(`[${jobId}/${runId}] No valid test scripts found after fetching. Aborting run.`);
        await dbInstance.update(runs).set({ status: "failed", completedAt: new Date(), errorDetails: "No valid test scripts found for the job." }).where(eq(runs.id, runId));
        return NextResponse.json(
            { error: "No valid test scripts could be prepared for the job." },
            { status: 400 }
        );
    }

    console.log(`[${jobId}/${runId}] Prepared ${testScripts.length} test scripts for queuing.`);

    const task: JobExecutionTask = {
      jobId: runId,
      testScripts,
      runId: runId,
      originalJobId: jobId
    };

    try {
      await addJobToQueue(task);
    } catch (error) {
      // Check if this is a queue capacity error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('capacity limit') || errorMessage.includes('Unable to verify queue capacity')) {
        console.log(`[Job API] Capacity limit reached: ${errorMessage}`);
        
        // Update the run status to failed with capacity limit error
        await dbInstance.update(runs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorDetails: errorMessage
          })
          .where(eq(runs.id, runId));
          
        // Update the job status back to its previous state (not running)
        await dbInstance.update(jobs)
          .set({
            status: "pending" as JobStatus
          })
          .where(eq(jobs.id, jobId));
          
        // Return a 429 status code (Too Many Requests) with the error message
        return NextResponse.json(
          { error: "Queue capacity limit reached", message: errorMessage },
          { status: 429 }
        );
      }
      
      // For other errors, log and return a 500 status code
      console.error(`[${jobId}/${runId}] Error processing job:`, error);
      
      // Re-throw for other errors to be caught by the main catch block
      throw error;
    }

    console.log(`[${jobId}/${runId}] Setting job status to "running" in the database.`);
    const currentDate = new Date();
    await dbInstance.update(jobs).set({ 
      status: "running", 
      lastRunAt: currentDate 
    }).where(eq(jobs.id, jobId));

    return NextResponse.json({
      message: "Job execution queued successfully.",
      jobId: jobId,
      runId: runId,
    });
  } catch (error) {
    console.error(`[${jobId || 'unknown'}/${runId || 'unknown'}] Error queuing job:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";

    if (runId) {
      try {
        await dbInstance.update(runs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorDetails: `Failed to queue job: ${errorMessage}`
          })
          .where(eq(runs.id, runId));
      } catch (dbError) {
        console.error(`[${jobId || 'unknown'}/${runId}] Failed to update run status to failed after queueing error:`, dbError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: `Failed to queue job execution: ${errorMessage}`,
        jobId: jobId,
        runId: runId,
      },
      { status: 500 }
    );
  }
}
