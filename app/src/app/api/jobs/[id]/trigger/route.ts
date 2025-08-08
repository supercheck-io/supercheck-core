import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { jobs, apikey, jobTests, runs, tests, JobTrigger } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { addJobToQueue, JobExecutionTask } from "@/lib/queue";

declare const Buffer: {
  from(data: string, encoding: string): { toString(encoding: string): string };
};

/**
 * Helper function to decode base64-encoded test scripts
 */
async function decodeTestScript(base64Script: string): Promise<string> {
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  const isBase64 = base64Regex.test(base64Script);

  if (!isBase64) {
    return base64Script;
  }

  try {
    if (typeof window === "undefined") {
      const decoded = Buffer.from(base64Script, "base64").toString("utf-8");
      return decoded;
    }
    return base64Script;
  } catch (error) {
    console.error("Error decoding base64:", error);
    return base64Script;
  }
}

// POST /api/jobs/[id]/trigger - Trigger job remotely via API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let apiKeyUsed: string | null = null;
  
  try {
    const { id } = await params;
    const jobId = id;

    // Validate UUID format for job ID
    if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return NextResponse.json(
        { 
          error: "Invalid job ID format", 
          message: "Job ID must be a valid UUID" 
        },
        { status: 400 }
      );
    }

    // Get API key from headers (Bearer token only)
    const authHeader = request.headers.get("authorization");
    const apiKeyFromHeader = authHeader?.replace(/^Bearer\s+/i, "");

    if (!apiKeyFromHeader) {
      return NextResponse.json(
        { 
          error: "API key required", 
          message: "Include API key as Bearer token in Authorization header" 
        },
        { status: 401 }
      );
    }

    // Basic API key format validation
    const trimmedApiKey = apiKeyFromHeader.trim();
    if (!trimmedApiKey || trimmedApiKey.length < 10) {
      return NextResponse.json(
        { 
          error: "Invalid API key format", 
          message: "API key must be at least 10 characters long" 
        },
        { status: 401 }
      );
    }

    apiKeyUsed = trimmedApiKey.substring(0, 8); // For logging purposes

    // Verify the API key exists and get associated information
    const apiKeyResult = await db
      .select({
        id: apikey.id,
        name: apikey.name,
        enabled: apikey.enabled,
        expiresAt: apikey.expiresAt,
        jobId: apikey.jobId,
        userId: apikey.userId,
        lastRequest: apikey.lastRequest,
        requestCount: apikey.requestCount,
      })
      .from(apikey)
      .where(eq(apikey.key, trimmedApiKey))
      .limit(1);

    if (apiKeyResult.length === 0) {
      console.warn(`Invalid API key attempted: ${apiKeyUsed}... for job ${jobId}`);
      return NextResponse.json(
        { 
          error: "Invalid API key", 
          message: "The provided API key is invalid or has been revoked" 
        },
        { status: 401 }
      );
    }

    const key = apiKeyResult[0];

    // Check if API key is enabled
    if (!key.enabled) {
      console.warn(`Disabled API key attempted: ${key.name} (${key.id}) for job ${jobId}`);
      return NextResponse.json(
        { 
          error: "API key disabled", 
          message: "This API key has been disabled" 
        },
        { status: 401 }
      );
    }

    // Check if API key has expired
    if (key.expiresAt && new Date() > key.expiresAt) {
      console.warn(`Expired API key attempted: ${key.name} (${key.id}) for job ${jobId}`);
      return NextResponse.json(
        { 
          error: "API key expired", 
          message: `This API key expired on ${key.expiresAt.toISOString()}` 
        },
        { status: 401 }
      );
    }

    // Validate that the API key is authorized for this specific job
    if (key.jobId !== jobId) {
      console.warn(`API key unauthorized for job: ${key.name} attempted job ${jobId}, authorized for ${key.jobId}`);
      return NextResponse.json(
        { 
          error: "API key not authorized for this job", 
          message: "This API key does not have permission to trigger this job" 
        },
        { status: 403 }
      );
    }

    // Check if job exists and is in a valid state
    const jobResult = await db
      .select({
        id: jobs.id,
        name: jobs.name,
        status: jobs.status,
        createdByUserId: jobs.createdByUserId,
        organizationId: jobs.organizationId,
        projectId: jobs.projectId,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (jobResult.length === 0) {
      return NextResponse.json(
        { error: "Job not found", message: "The specified job does not exist" },
        { status: 404 }
      );
    }

    const job = jobResult[0];

    // Additional validation: ensure job is not in an error state that prevents triggering
    if (job.status === 'error') {
      return NextResponse.json(
        { 
          error: "Job not available", 
          message: `Job is currently in error state and cannot be triggered` 
        },
        { status: 400 }
      );
    }

    // Get the tests associated with this job
    const jobTestsResult = await db
      .select({
        id: jobTests.testId,
        orderPosition: jobTests.orderPosition,
      })
      .from(jobTests)
      .where(eq(jobTests.jobId, jobId))
      .orderBy(jobTests.orderPosition);

    if (jobTestsResult.length === 0) {
      return NextResponse.json(
        { 
          error: "No tests found for job", 
          message: "This job has no tests associated with it" 
        },
        { status: 400 }
      );
    }

    // Parse optional request body for additional parameters (currently not used but reserved for future features)
    try {
      const body = await request.text();
      if (body && body.trim()) {
        JSON.parse(body); // Validate JSON format but don't store
      }
    } catch {
      // Ignore JSON parsing errors for optional body
      console.warn(`Invalid JSON in trigger request body for job ${jobId}, proceeding with defaults`);
    }

    // Update API key usage statistics asynchronously
    const now = new Date();
    const currentCount = parseInt(key.requestCount || '0', 10);
    db.update(apikey)
      .set({ 
        lastRequest: now,
        requestCount: (currentCount + 1).toString(),
      })
      .where(eq(apikey.id, key.id))
      .catch((error) => {
        console.error(`Failed to update API key usage for ${key.id}:`, error);
      });

    // Create run record and prepare test scripts directly
    const runId = crypto.randomUUID();
    const startTime = new Date();
    
    await db.insert(runs).values({
      id: runId,
      jobId,
      projectId: job.projectId,
      status: "running",
      startedAt: startTime,
      trigger: "remote" as JobTrigger,
    });

    console.log(`[${jobId}/${runId}] Created running test run record: ${runId}`);

    // Prepare test scripts
    const testScripts = [];
    
    for (const testRef of jobTestsResult) {
      console.log(`[${jobId}/${runId}] Fetching script for test ${testRef.id} from database`);
      
      // Fetch test directly from database
      const testResult = await db
        .select({
          id: tests.id,
          title: tests.title,
          script: tests.script
        })
        .from(tests)
        .where(eq(tests.id, testRef.id))
        .limit(1);
      
      if (testResult.length > 0 && testResult[0].script) {
        // Decode the base64 script
        const testScript = await decodeTestScript(testResult[0].script);
        const testName = testResult[0].title || `Test ${testResult[0].id}`;
        testScripts.push({ id: testResult[0].id, name: testName, script: testScript });
      } else {
        console.error(`[${jobId}/${runId}] Failed to fetch script for test ${testRef.id}, skipping.`);
        continue;
      }
    }

    if (testScripts.length === 0) {
      console.error(`[${jobId}/${runId}] No valid test scripts found after fetching. Aborting run.`);
      await db.update(runs).set({ 
        status: "failed", 
        completedAt: new Date(), 
        errorDetails: "No valid test scripts found for the job." 
      }).where(eq(runs.id, runId));
      return NextResponse.json(
        { 
          error: "No valid test scripts could be prepared for the job.",
          message: "All tests associated with this job are invalid or missing scripts" 
        },
        { status: 400 }
      );
    }

    console.log(`[${jobId}/${runId}] Prepared ${testScripts.length} test scripts for queuing.`);

    // Create job execution task
    const task: JobExecutionTask = {
      jobId: jobId,
      testScripts,
      runId: runId,
      originalJobId: jobId,
      trigger: "remote",
      organizationId: job.organizationId || '',
      projectId: job.projectId || ''
    };

    try {
      await addJobToQueue(task);
    } catch (error) {
      // Check if this is a queue capacity error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('capacity limit') || errorMessage.includes('Unable to verify queue capacity')) {
        console.log(`[Job Trigger API] Capacity limit reached: ${errorMessage}`);
        
        // Update the run status to failed with capacity limit error
        await db.update(runs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorDetails: errorMessage
          })
          .where(eq(runs.id, runId));
          
        return NextResponse.json(
          { error: "Queue capacity limit reached", message: errorMessage },
          { status: 429 }
        );
      }
      
      // For other errors, log and re-throw
      console.error(`[${jobId}/${runId}] Error adding job to queue:`, error);
      throw error;
    }

    // Log successful API key usage
    console.log(`Job ${jobId} triggered successfully via API key ${key.name} (${key.id})`);

    return NextResponse.json({
      success: true,
      message: "Job triggered successfully",
      data: {
        jobId: jobId,
        jobName: job.name,
        runId: runId,
        testCount: testScripts.length,
        triggeredBy: key.name,
        triggeredAt: now.toISOString(),
      },
    });

  } catch (error) {
    console.error(`Error triggering job via API key ${apiKeyUsed}...:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    
    return NextResponse.json(
      { 
        error: "Failed to trigger job", 
        message: errorMessage,
        details: null
      },
      { status: 500 }
    );
  }
}

// GET /api/jobs/[id]/trigger - Get trigger information
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // Validate UUID format
    if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return NextResponse.json(
        { error: "Invalid job ID format" },
        { status: 400 }
      );
    }

    // Get job information
    const jobResult = await db
      .select({
        id: jobs.id,
        name: jobs.name,
        status: jobs.status,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (jobResult.length === 0) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const job = jobResult[0];
    const triggerUrl = `${process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin}/api/jobs/${jobId}/trigger`;

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        name: job.name,
        status: job.status,
      },
      triggerUrl,
      documentation: {
        method: "POST",
        headers: {
          "x-api-key": "your-api-key-here",
          "Content-Type": "application/json"
        },
        description: "Trigger this job remotely using your API key"
      }
    });

  } catch (error) {
    console.error("Error getting trigger information:", error);
    return NextResponse.json(
      { error: "Failed to get trigger information" },
      { status: 500 }
    );
  }
}


