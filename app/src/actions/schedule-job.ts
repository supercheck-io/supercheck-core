"use server";

import { db } from "../db/client";
import { jobs as jobsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { scheduleJob } from "../lib/job-scheduler";
import { getJob } from "./get-jobs";

interface ScheduleJobResponse {
  success: boolean;
  error?: string;
  scheduleName?: string;
}

/**
 * Server action to schedule a job with BullMQ using cron
 */
export async function scheduleCronJob(jobId: string, cronExpression: string): Promise<ScheduleJobResponse> {
  try {
    // Validate cron expression
    if (!cronExpression) {
      return {
        success: false,
        error: "Cron expression is required"
      };
    }

    // Get job details
    const jobResult = await getJob(jobId);
    if (!jobResult.success || !jobResult.job) {
      return {
        success: false,
        error: "Job not found"
      };
    }

    const job = jobResult.job;
    
    // Schedule the job in BullMQ
    const scheduleName = await scheduleJob({
      name: job.name,
      cron: cronExpression,
      timezone: "UTC", // Could make this configurable in the future
      jobId: jobId,
      queue: "job-execution",
      retryLimit: 1
    });

    // Update job in the database with next run details
    const dbInstance = await db();
    await dbInstance
      .update(jobsTable)
      .set({
        scheduledJobId: scheduleName,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, jobId));

    return {
      success: true,
      scheduleName
    };
  } catch (error) {
    console.error("Error scheduling job:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to schedule job"
    };
  }
}

/**
 * Server action to cancel a scheduled job
 */
export async function cancelScheduledJob(jobId: string): Promise<ScheduleJobResponse> {
  try {
    // Get the job to find its scheduledJobId
    const jobResult = await getJob(jobId);
    if (!jobResult.success || !jobResult.job) {
      console.warn(`Cannot cancel schedule for job ${jobId}: Job not found`);
      // Return success:true to allow job deletion to continue
      return {
        success: true,
        error: "Job not found"
      };
    }

    const job = jobResult.job;
    if (!job.scheduledJobId) {
      console.log(`Job ${jobId} has no scheduled job to cancel`);
      return {
        success: true,
        error: "Job is not scheduled"
      };
    }

    try {
      // Import deleteScheduledJob dynamically to avoid circular imports
      const { deleteScheduledJob } = await import("../lib/job-scheduler");
      const deleted = await deleteScheduledJob(job.scheduledJobId);

      if (!deleted) {
        console.warn(`Failed to delete scheduled job ${job.scheduledJobId}`);
        // Still update the database to remove the reference
      }
    } catch (deleteError) {
      console.error("Error deleting scheduled job:", deleteError);
      // Continue with DB update even if BullMQ deletion fails
    }

    // Update the job in the database to remove the scheduledJobId
    try {
      const dbInstance = await db();
      await dbInstance
        .update(jobsTable)
        .set({
          scheduledJobId: null,
          updatedAt: new Date(),
        })
        .where(eq(jobsTable.id, jobId));
    } catch (dbError) {
      console.error("Error updating job in database:", dbError);
      // Still return success since the schedule might be removed
    }

    return {
      success: true
    };
  } catch (error) {
    console.error("Error canceling scheduled job:", error);
    // Return success to allow job deletion to proceed anyway
    return {
      success: true,
      error: "Failed to cancel scheduled job, but job deletion can proceed"
    };
  }
} 