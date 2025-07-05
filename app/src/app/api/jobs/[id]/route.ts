import { NextRequest, NextResponse } from "next/server";
import { updateJob } from "@/actions/update-job";
import { db } from "@/utils/db";
import { jobs, jobTests, tests as testsTable } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const jobId = params.id;
    
    // Get the job details
    const jobResult = await db
      .select({
        id: jobs.id,
        name: jobs.name,
        description: jobs.description,
        cronSchedule: jobs.cronSchedule,
        status: jobs.status,
        alertConfig: jobs.alertConfig,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        organizationId: jobs.organizationId,
        createdByUserId: jobs.createdByUserId,
        lastRunAt: jobs.lastRunAt,
        nextRunAt: jobs.nextRunAt,
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
    
    // Get associated tests for this job
    const testsResult = await db
      .select({
        id: testsTable.id,
        title: testsTable.title,
        description: testsTable.description,
        type: testsTable.type,
        priority: testsTable.priority,
        script: testsTable.script,
        createdAt: testsTable.createdAt,
        updatedAt: testsTable.updatedAt,
      })
      .from(testsTable)
      .innerJoin(jobTests, eq(testsTable.id, jobTests.testId))
      .where(eq(jobTests.jobId, jobId));
    
    const response = {
      ...job,
      lastRunAt: job.lastRunAt ? job.lastRunAt.toISOString() : null,
      nextRunAt: job.nextRunAt ? job.nextRunAt.toISOString() : null,
      tests: testsResult.map((test) => ({
        ...test,
        name: test.title || "",
        script: test.script, // Return as-is, let frontend handle decoding
        createdAt: test.createdAt ? test.createdAt.toISOString() : null,
        updatedAt: test.updatedAt ? test.updatedAt.toISOString() : null,
      })),
      createdAt: job.createdAt ? job.createdAt.toISOString() : null,
      updatedAt: job.updatedAt ? job.updatedAt.toISOString() : null,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const body = await request.json();
    const result = await updateJob({
      jobId: params.id,
      ...body
    });
    
    if (result.success) {
      return NextResponse.json(result.job);
    } else {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error updating job:", error);
    return NextResponse.json(
      { error: "Failed to update job" },
      { status: 500 }
    );
  }
} 