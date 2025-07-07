import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { jobs, apikey, jobTests } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/utils/auth";

// POST /api/jobs/[id]/trigger - Trigger job remotely via API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    
    // Get API key from headers
    const apiKeyFromHeader = request.headers.get("x-api-key") || 
                           request.headers.get("authorization")?.replace("Bearer ", "");

    if (!apiKeyFromHeader) {
      return NextResponse.json(
        { 
          error: "API key required", 
          message: "Include API key in 'x-api-key' header or as Bearer token in Authorization header" 
        },
        { status: 401 }
      );
    }

    // Verify the API key directly from database
    const apiKey = await db
      .select()
      .from(apikey)
      .where(eq(apikey.key, apiKeyFromHeader))
      .limit(1);

    if (apiKey.length === 0) {
      return NextResponse.json(
        { 
          error: "Invalid API key", 
          message: "The provided API key is invalid or expired" 
        },
        { status: 401 }
      );
    }

    const key = apiKey[0];

    // Check if API key is enabled
    if (!key.enabled) {
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
      return NextResponse.json(
        { 
          error: "API key expired", 
          message: "This API key has expired" 
        },
        { status: 401 }
      );
    }

    // Check if this API key has permission for this job
    if (key.jobId !== jobId) {
      return NextResponse.json(
        { 
          error: "API key not authorized for this job", 
          message: "This API key does not have permission to trigger this job" 
        },
        { status: 403 }
      );
    }

    // Check if job exists
    const job = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (job.length === 0) {
      return NextResponse.json(
        { error: "Job not found", message: "The specified job does not exist" },
        { status: 404 }
      );
    }

    // Get the tests associated with this job
    const jobTestsResult = await db
      .select({
        id: jobTests.testId,
      })
      .from(jobTests)
      .where(eq(jobTests.jobId, jobId));

    if (jobTestsResult.length === 0) {
      return NextResponse.json(
        { 
          error: "No tests found for job", 
          message: "This job has no tests associated with it" 
        },
        { status: 400 }
      );
    }

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
          apiKeyName: key!.name || "API Key",
        }),
      }
    );

    if (!runResponse.ok) {
      const errorData = await runResponse.json();
      return NextResponse.json(
        { 
          error: "Failed to trigger job", 
          message: errorData.error || "An error occurred while triggering the job" 
        },
        { status: 500 }
      );
    }

    const runData = await runResponse.json();

    return NextResponse.json({
      success: true,
      message: "Job triggered successfully",
      data: {
        jobId: jobId,
        runId: runData.runId,
        triggeredBy: key!.name || "API Key",
        triggeredAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error("Error triggering job:", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "An unexpected error occurred while triggering the job" 
      },
      { status: 500 }
    );
  }
}

// GET /api/jobs/[id]/trigger - Get job trigger information
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // This endpoint provides information about how to trigger the job
    // It can be used without authentication for documentation purposes
    
    // Check if job exists
    const job = await db
      .select({
        id: jobs.id,
        name: jobs.name,
        description: jobs.description,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (job.length === 0) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const triggerUrl = `${baseUrl}/api/jobs/${jobId}/trigger`;

    return NextResponse.json({
      success: true,
      job: {
        id: job[0].id,
        name: job[0].name,
        description: job[0].description,
      },
      triggerInfo: {
        url: triggerUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "YOUR_API_KEY"
        },
        alternativeAuth: {
          "Authorization": "Bearer YOUR_API_KEY"
        },
        examples: {
          curl: `curl -X POST "${triggerUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY"`,
          javascript: `fetch("${triggerUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY"
  }
})`,
          python: `import requests

response = requests.post("${triggerUrl}", 
  headers={
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY"
  }
)`,
        },
      },
    });

  } catch (error) {
    console.error("Error getting job trigger info:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 