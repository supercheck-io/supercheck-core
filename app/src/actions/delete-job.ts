"use server";

import { db } from "../utils/db";
import { jobs, jobTests, runs } from "../db/schema/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireProjectContext } from "@/lib/project-context";
import { buildPermissionContext, hasPermission } from "@/lib/rbac/middleware";
import { ProjectPermission } from "@/lib/rbac/permissions";
import { logAuditEvent } from "@/lib/audit-logger";

export async function deleteJob(jobId: string) {
  try {
    console.log("Deleting job with ID:", jobId);

    if (!jobId) {
      return {
        success: false,
        error: "Job ID is required",
      };
    }

    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check DELETE_JOBS permission
    const permissionContext = await buildPermissionContext(
      userId,
      'project',
      organizationId,
      project.id
    );
    
    const canDeleteJobs = await hasPermission(permissionContext, ProjectPermission.DELETE_JOBS);
    
    if (!canDeleteJobs) {
      console.warn(`User ${userId} attempted to delete job ${jobId} without DELETE_JOBS permission`);
      return {
        success: false,
        error: "Insufficient permissions to delete jobs",
      };
    }

    // Check if the job exists and belongs to current project - get job details for audit
    const existingJob = await db
      .select({ 
        id: jobs.id, 
        name: jobs.name,
        description: jobs.description,
        cronSchedule: jobs.cronSchedule
      })
      .from(jobs)
      .where(and(
        eq(jobs.id, jobId),
        eq(jobs.projectId, project.id),
        eq(jobs.organizationId, organizationId)
      ))
      .limit(1);

    if (existingJob.length === 0) {
      return {
        success: false,
        error: "Job not found or access denied",
      };
    }

    // First delete any test runs associated with this job
    await db.delete(runs).where(eq(runs.jobId, jobId));

    // Then delete the job-test associations
    await db.delete(jobTests).where(eq(jobTests.jobId, jobId));

    // Finally delete the job itself
    await db.delete(jobs).where(eq(jobs.id, jobId));

    // Log the audit event for job deletion
    await logAuditEvent({
      userId,
      organizationId,
      action: 'job_deleted',
      resource: 'job',
      resourceId: jobId,
      metadata: {
        jobName: existingJob[0].name,
        jobDescription: existingJob[0].description,
        cronSchedule: existingJob[0].cronSchedule,
        projectId: project.id,
        projectName: project.name
      },
      success: true
    });

    // Revalidate the jobs path to ensure UI is updated
    revalidatePath("/jobs");

    console.log(`Successfully deleted job ${jobId} from project ${project.name} by user ${userId}`);

    return {
      success: true,
      message: "Job deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting job:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete job",
    };
  }
}
