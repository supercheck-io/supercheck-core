import { NextResponse } from "next/server";
import { db } from "@/utils/db";
import { runs, jobs, reports } from "@/db/schema/schema";
import { desc, eq, and } from "drizzle-orm";
import { buildPermissionContext, hasPermission, requireAuth } from '@/lib/rbac/middleware';
import { ProjectPermission } from '@/lib/rbac/permissions';
import { requireProjectContext } from '@/lib/project-context';

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    
    // Get URL parameters for optional filtering
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const organizationId = url.searchParams.get('organizationId');
    
    // Build the base query
    const baseQuery = db
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
      })
      .from(runs)
      .leftJoin(jobs, eq(runs.jobId, jobs.id))
      .leftJoin(
        reports, 
        and(
          eq(reports.entityId, runs.id),
          eq(reports.entityType, 'job')
        )
      );
    
    // Apply filters if provided
    let result;
    if (projectId && organizationId) {
      result = await baseQuery
        .where(and(
          eq(runs.projectId, projectId),
          eq(jobs.organizationId, organizationId)
        ))
        .orderBy(desc(runs.startedAt));
    } else {
      result = await baseQuery.orderBy(desc(runs.startedAt));
    }
    
    // Convert dates to ISO strings
    const formattedRuns = result.map(run => ({
      ...run,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    }));

    return NextResponse.json(formattedRuns);
  } catch (error) {
    console.error('Error fetching runs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch runs' },
      { status: 500 }
    );
  }
}
