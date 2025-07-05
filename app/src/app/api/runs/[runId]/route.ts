import { NextResponse } from 'next/server';
import { db } from "@/utils/db";
import { runs, reports, jobs, jobTests } from "@/db/schema/schema";
import { eq, and, count } from "drizzle-orm";

// Enable CORS for all origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// Options handler for CORS preflight requests
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Get run handler
export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const params = await context.params;
  try {
    const runId = params.runId;
    
    if (!runId) {
      return NextResponse.json(
        { error: "Missing run ID" },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Get run with job name and report url
    const result = await db
      .select({
        id: runs.id,
        jobId: runs.jobId,
        jobName: jobs.name,
        status: runs.status,
        duration: runs.duration,
        startedAt: runs.startedAt,
        completedAt: runs.completedAt,
        logs: runs.logs,
        errorDetails: runs.errorDetails,
        reportUrl: reports.s3Url,
      })
      .from(runs)
      .leftJoin(jobs, eq(runs.jobId, jobs.id))
      .leftJoin(
        reports, 
        and(
          eq(reports.entityId, runs.id),
          eq(reports.entityType, 'job')
        )
      )
      .where(eq(runs.id, runId))
      .limit(1);
    
    if (result.length === 0) {
      return NextResponse.json(
        { error: "Run not found" },
        { 
          status: 404,
          headers: corsHeaders,
        }
      );
    }
    
    const run = result[0];
    
    // Get test count for this job
    const testCountResult = await db
      .select({ count: count() })
      .from(jobTests)
      .where(eq(jobTests.jobId, run.jobId));
    
    const testCount = testCountResult[0]?.count || 0;
    
    const response = {
      ...run,
      jobName: run.jobName ?? undefined,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
      testCount: testCount,
    };
    
    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching run: ${errorMessage}`, error);
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

// Delete run handler
export async function DELETE(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const params = await context.params;
  try {
    const runId = params.runId;
    console.log(`Attempting to delete run with ID: ${runId}`);
    
    if (!runId) {
      console.error('Missing run ID');
      return NextResponse.json(
        { success: false, error: "Missing run ID" },
        { 
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // First check if the run exists
    const existingRun = await db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
      
    if (!existingRun.length) {
      console.error(`Run with ID ${runId} not found`);
      return NextResponse.json(
        { success: false, error: "Run not found" },
        { 
          status: 404,
          headers: corsHeaders,
        }
      );
    }
    
    console.log(`Deleting reports for run: ${runId}`);
    // First delete any associated reports
    await db
      .delete(reports)
      .where(
        eq(reports.entityId, runId)
      );
    
    console.log(`Deleting run: ${runId}`);
    // Then delete the run itself
    await db
      .delete(runs)
      .where(
        eq(runs.id, runId)
      );
    
    console.log(`Successfully deleted run: ${runId}`);
    return NextResponse.json(
      { success: true },
      { 
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error deleting run: ${errorMessage}`, error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { 
        status: 500,
        headers: corsHeaders,
      }
    );
  }
} 