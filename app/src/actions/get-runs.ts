"use server";

import { db } from "@/utils/db";
import { runs, reports, jobs, jobTests } from "@/db/schema/schema";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { ProjectPermission } from '@/lib/rbac/permissions';

// Type based on the actual API response from /api/runs/[runId]
type RunResponse = {
  id: string;
  jobId: string;
  jobName?: string;
  status: string;
  duration?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  logs?: string | null;
  errorDetails?: string | null;
  reportUrl?: string | null;
  timestamp?: string;
  testCount?: number;
  trigger?: string;
};

export async function getRun(runId: string): Promise<RunResponse | null> {
  try {
    const { userId } = await requireAuth();
    
    if (!runId) {
      throw new Error("Missing run ID");
    }

    // First, find the run and its associated job/project without filtering by active project
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
        trigger: runs.trigger,
        projectId: jobs.projectId,
        organizationId: jobs.organizationId,
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
      return null;
    }

    const run = result[0];
    
    // Get test count for this job
    const testCountResult = await db
      .select({ count: count() })
      .from(jobTests)
      .where(eq(jobTests.jobId, run.jobId));
    
    const testCount = testCountResult[0]?.count || 0;
    
    const response: RunResponse = {
      ...run,
      testCount,
    };
    
    return response;
  } catch (error) {
    console.error('Error fetching run:', error);
    throw new Error('Failed to fetch run');
  }
}