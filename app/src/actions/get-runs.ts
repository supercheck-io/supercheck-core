'use server';

import { db } from "@/utils/db";
import { runs, jobs, reports, jobTests } from "@/db/schema/schema";
import { desc, eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { runSchema } from "@/components/runs/schema";

// Type for the response
export type RunResponse = z.infer<typeof runSchema>;

// Function to get test count for a job
export async function getJobTestCount(jobId: string): Promise<number> {
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

export async function getRuns(): Promise<RunResponse[]> {
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
    return result.map(run => ({
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
  } catch (error) {
    console.error("Failed to fetch runs:", error);
    return [];
  }
}

export async function getRun(id: string): Promise<RunResponse | null> {
  try {
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
      .where(eq(runs.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    const run = result[0];
    
    // Get test count for this job
    const testCount = await getJobTestCount(run.jobId);
    
    return {
      ...run,
      jobName: run.jobName ?? undefined,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
      testCount: testCount,
    };
  } catch (error) {
    console.error(`Failed to fetch run ${id}:`, error);
    return null;
  }
}
