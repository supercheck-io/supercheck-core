import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { runs, jobs, reports, jobTests } from "@/db/schema/schema";
import { desc, eq, and, count } from "drizzle-orm";

// Function to get test count for a job
async function getJobTestCount(jobId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: count() })
      .from(jobTests)
      .where(eq(jobTests.jobId, jobId));
    
    return result[0].count || 0;
  } catch (error) {
    console.error(`Failed to get test count for job ${jobId}:`, error);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get all runs with job name and report urls in a single query with a left join
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
      .orderBy(desc(runs.startedAt));
    
    // Convert dates to ISO strings
    const formattedRuns = result.map(run => ({
      id: run.id,
      jobId: run.jobId,
      jobName: run.jobName ?? undefined,
      status: run.status,
      duration: run.duration,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      logs: run.logs,
      errorDetails: run.errorDetails,
      reportUrl: run.reportUrl,
      timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
    }));

    return NextResponse.json(formattedRuns);
  } catch (error) {
    console.error("Failed to fetch runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch runs" },
      { status: 500 }
    );
  }
}
