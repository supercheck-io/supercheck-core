'use server';

import { db } from "@/db/client";
import { runs, jobs, reports } from "@/db/schema";
import { desc, eq, or, and } from "drizzle-orm";
import { z } from "zod";
import { runSchema } from "@/components/runs/schema";

// Type for the response
export type RunResponse = z.infer<typeof runSchema>;

// Helper function to fetch a report URL for a run ID
async function getReportUrlForRun(dbInstance: any, runId: string): Promise<string | null> {
  try {
    const reportResult = await dbInstance.query.reports.findFirst({
      where: or(
        and(eq(reports.entityId, runId), eq(reports.entityType, 'job')),
        and(eq(reports.entityId, runId), eq(reports.entityType, 'test'))
      ),
      columns: {
        s3Url: true,
        entityType: true
      }
    });
    
    if (reportResult?.s3Url) {
      console.log(`Found report for run ${runId} with type ${reportResult.entityType}: ${reportResult.s3Url}`);
      return reportResult.s3Url;
    }
    
    // Fall back to the local path if no S3 URL is available
    return `/api/test-results/jobs/${runId}/report/index.html`;
  } catch (error) {
    console.error(`Error fetching report URL for run ${runId}:`, error);
    return `/api/test-results/jobs/${runId}/report/index.html`;
  }
}

export async function getRuns(): Promise<RunResponse[]> {
  try {
    const dbInstance = await db();
    
    // Join runs with jobs to get job names
    const results = await dbInstance
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
      })
      .from(runs)
      .leftJoin(jobs, eq(runs.jobId, jobs.id))
      .orderBy(desc(runs.startedAt));
    
    // Transform the results to include the report URL
    const runsWithReportUrls = await Promise.all(results.map(async (run) => {
      const reportUrl = await getReportUrlForRun(dbInstance, run.id);
      
      return {
        ...run,
        jobName: run.jobName ?? undefined,
        startedAt: run.startedAt ? run.startedAt.toISOString() : null,
        completedAt: run.completedAt ? run.completedAt.toISOString() : null,
        reportUrl,
        timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
      };
    }));
    
    return runsWithReportUrls;
  } catch (error) {
    console.error("Failed to fetch runs:", error);
    return [];
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
      })
      .from(runs)
      .leftJoin(jobs, eq(runs.jobId, jobs.id))
      .where(eq(runs.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    const run = result[0];
    const reportUrl = await getReportUrlForRun(dbInstance, id);
    
    return {
      ...run,
      jobName: run.jobName ?? undefined,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      reportUrl,
      timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Failed to fetch run ${id}:`, error);
    return null;
  }
}
