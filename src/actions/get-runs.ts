'use server';

import { db } from "../db/client";
import { testRuns, jobs } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export type RunResponse = {
  id: string;
  jobId: string;
  jobName: string | null;
  status: string;
  duration: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reportUrl: string | null;
  logs: string | null;
  errorDetails: string | null;
  timestamp: string;
};

export async function getRuns(): Promise<RunResponse[]> {
  try {
    const dbInstance = await db();
    
    // Join testRuns with jobs to get job names
    const results = await dbInstance
      .select({
        id: testRuns.id,
        jobId: testRuns.jobId,
        jobName: jobs.name,
        status: testRuns.status,
        duration: testRuns.duration,
        startedAt: testRuns.startedAt,
        completedAt: testRuns.completedAt,
        logs: testRuns.logs,
        errorDetails: testRuns.errorDetails,
      })
      .from(testRuns)
      .leftJoin(jobs, eq(testRuns.jobId, jobs.id))
      .orderBy(desc(testRuns.startedAt));
    
    // Transform the results to include the report URL
    return results.map((run) => {
      return {
        ...run,
        startedAt: run.startedAt ? run.startedAt.toISOString() : null,
        completedAt: run.completedAt ? run.completedAt.toISOString() : null,
        reportUrl: `/api/test-results/jobs/${run.id}/report/index.html`,
        timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
      };
    });
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
        id: testRuns.id,
        jobId: testRuns.jobId,
        jobName: jobs.name,
        status: testRuns.status,
        duration: testRuns.duration,
        startedAt: testRuns.startedAt,
        completedAt: testRuns.completedAt,
        logs: testRuns.logs,
        errorDetails: testRuns.errorDetails,
      })
      .from(testRuns)
      .leftJoin(jobs, eq(testRuns.jobId, jobs.id))
      .where(eq(testRuns.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    const run = result[0];
    
    return {
      ...run,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      reportUrl: `/api/test-results/jobs/${run.id}/report/index.html`,
      timestamp: run.startedAt ? run.startedAt.toISOString() : new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Failed to fetch run ${id}:`, error);
    return null;
  }
}
