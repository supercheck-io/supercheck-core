import { NextResponse } from 'next/server';
import { db } from "@/utils/db";
import { runs, reports, jobs, jobTests } from "@/db/schema/schema";
import { eq, and, count } from "drizzle-orm";
import { requireAuth, getUserOrgRole } from '@/lib/rbac/middleware';
import { isSuperAdmin } from '@/lib/admin';
import { getActiveProject } from '@/lib/session';

// Get run handler - requires auth but no project restrictions
export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const params = await context.params;
  try {
    const { userId } = await requireAuth();
    const runId = params.runId;
    
    if (!runId) {
      return NextResponse.json(
        { error: "Missing run ID" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Run not found" },
        { status: 404 }
      );
    }

    const run = result[0];

    // Check if user has access to this run's organization
    const userIsSuperAdmin = await isSuperAdmin();
    
    if (!userIsSuperAdmin && run.organizationId) {
      const orgRole = await getUserOrgRole(userId, run.organizationId);
      
      if (!orgRole) {
        return NextResponse.json(
          { error: 'Access denied: Not a member of this organization' },
          { status: 403 }
        );
      }
    }
    
    // Get test count for this job
    const testCountResult = await db
      .select({ count: count() })
      .from(jobTests)
      .where(eq(jobTests.jobId, run.jobId));
    
    const testCount = testCountResult[0]?.count || 0;
    
    const response = {
      ...run,
      testCount,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching run:', error);
    return NextResponse.json(
      { error: 'Failed to fetch run' },
      { status: 500 }
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
    await requireAuth();
    const runId = params.runId;
    console.log(`Attempting to delete run with ID: ${runId}`);
    
    if (!runId) {
      console.error('Missing run ID');
      return NextResponse.json(
        { success: false, error: "Missing run ID" },
        { status: 400 }
      );
    }

    // Get active project for user
    const activeProject = await getActiveProject();
    if (!activeProject) {
      return NextResponse.json(
        { error: 'No active project found' },
        { status: 400 }
      );
    }
    
    // First check if the run exists and belongs to the current project
    const existingRun = await db
      .select({ id: runs.id, jobId: runs.jobId })
      .from(runs)
      .leftJoin(jobs, eq(runs.jobId, jobs.id))
      .where(and(
        eq(runs.id, runId),
        eq(jobs.projectId, activeProject.id),
        eq(jobs.organizationId, activeProject.organizationId)
      ))
      .limit(1);
      
    if (!existingRun.length) {
      console.error(`Run with ID ${runId} not found`);
      return NextResponse.json(
        { success: false, error: "Run not found" },
        { status: 404 }
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
      .where(eq(runs.id, runId));
    
    console.log(`Successfully deleted run: ${runId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting run:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete run' },
      { status: 500 }
    );
  }
} 