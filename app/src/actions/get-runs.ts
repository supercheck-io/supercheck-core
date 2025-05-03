'use server';

import { db } from "@/db/client";
import { runs, jobs, reports } from "@/db/schema";
import { desc, eq, or, and } from "drizzle-orm";
import { z } from "zod";
import { runSchema } from "@/components/runs/schema";

// Type for the response
export type RunResponse = z.infer<typeof runSchema>;

export async function getRuns(): Promise<RunResponse[]> {
  try {
    const dbInstance = await db();
    
    // Get all runs with job name and report urls in a single query with a left join
    const result = await dbInstance
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

// Helper function to get the report URL for a run
async function getReportUrlForRun(
  dbInstance: any,
  runId: string
): Promise<string | null> {
  try {
    // First check for a job report
    const report = await dbInstance
      .select({
        s3Url: reports.s3Url,
        entityType: reports.entityType,
      })
      .from(reports)
      .where(
        or(
          and(eq(reports.entityId, runId), eq(reports.entityType, "job")),
          and(eq(reports.entityId, runId), eq(reports.entityType, "test"))
        )
      )
      .limit(1);

    if (report.length > 0) {
      console.log(
        `Found report for run ${runId} with type ${report[0].entityType}: ${report[0].s3Url}`
      );
      return report[0].s3Url;
    }

    return null;
  } catch (error) {
    console.error(`Failed to get report URL for run ${runId}:`, error);
    return null;
  }
}

export async function getRun(id: string): Promise<RunResponse | null> {
  try {
    const dbInstance = await db();
    
    const result = await dbInstance
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
    
    return {
      ...run,
      jobName: run.jobName ?? undefined,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Failed to fetch run ${id}:`, error);
    return null;
  }
}
