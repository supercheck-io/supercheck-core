import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { jobs, apikey, jobTests } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

// POST /api/jobs/[id]/trigger - Trigger job remotely via API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
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

    // Parse optional request body for additional parameters
    let triggerOptions = {};
    try {
      const body = await request.text();
      if (body && body.trim()) {
        triggerOptions = JSON.parse(body);
      }
    } catch (error) {
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

    // Trigger the job by calling the existing job run API
    const runResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/jobs/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: jobId,
          tests: jobTestsResult.map(test => ({ id: test.id })),
          triggeredBy: "api",
          apiKeyName: key.name,
          apiKeyId: key.id,
          trigger: "remote", // Add trigger value
          ...triggerOptions, // Allow additional options from request body
        }),
      }
    );

    if (!runResponse.ok) {
      const errorData = await runResponse.json().catch(() => ({}));
      console.error(`Job trigger failed for ${jobId}:`, errorData);
      return NextResponse.json(
        { 
          error: "Failed to trigger job", 
          message: errorData.error || "An error occurred while triggering the job",
          details: errorData.details || null
        },
        { status: 500 }
      );
    }

    const runData = await runResponse.json();
    const executionTime = Date.now() - startTime;

    // Log successful API key usage
    console.log(`Job ${jobId} triggered successfully via API key ${key.name} (${key.id}) in ${executionTime}ms`);

    return NextResponse.json({
      success: true,
      message: "Job triggered successfully",
      data: {
        jobId: jobId,
        jobName: job.name,
        runId: runData.runId,
        testCount: jobTestsResult.length,
        triggeredBy: key.name,
        triggeredAt: now.toISOString(),
        executionTime: `${executionTime}ms`,
      },
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`Error triggering job via API key ${apiKeyUsed}...:`, error);
    
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "An unexpected error occurred while triggering the job",
        requestId: Date.now().toString(), // Simple request ID for debugging
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


