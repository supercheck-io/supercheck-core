"use server";

import { db } from "@/utils/db";
import { jobs, jobTests, jobNotificationSettings } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { scheduleJob, deleteScheduledJob } from "@/lib/job-scheduler";
import { JOB_EXECUTION_QUEUE } from "@/lib/queue";
import { getNextRunDate } from "@/lib/cron-utils";

const updateJobSchema = z.object({
  jobId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional().default(""),
  cronSchedule: z.string().optional(),
  tests: z.array(z.object({
    id: z.string().uuid(),
  })),
  alertConfig: z.object({
    enabled: z.boolean(),
    notificationProviders: z.array(z.string()),
    alertOnFailure: z.boolean(),
    alertOnSuccess: z.boolean().optional(),
    alertOnTimeout: z.boolean().optional(),
    failureThreshold: z.number(),
    recoveryThreshold: z.number(),
    customMessage: z.string().optional(),
  }).optional(),
});

export type UpdateJobData = z.infer<typeof updateJobSchema>;

export async function updateJob(data: UpdateJobData) {
  console.log(`Updating job ${data.jobId}`);
  
  try {
    // Validate the data
    const validatedData = updateJobSchema.parse(data);
    
    const dbInstance = db;
    
    // Check if the job exists
    const existingJob = await dbInstance
      .select()
      .from(jobs)
      .where(eq(jobs.id, validatedData.jobId))
      .limit(1);
      
    if (!existingJob || existingJob.length === 0) {
      return { 
        success: false, 
        message: `Job with ID ${validatedData.jobId} not found` 
      };
    }
    
    const job = existingJob[0];
    
    try {
      // Calculate next run date if cron schedule is provided
      let nextRunAt = null;
      try {
        if (validatedData.cronSchedule) {
          nextRunAt = getNextRunDate(validatedData.cronSchedule);
        }
      } catch (error) {
        console.error(`Failed to calculate next run date: ${error}`);
      }
      
      // Update the job basic information
      await dbInstance.update(jobs)
        .set({
          name: validatedData.name,
          description: validatedData.description || "",
          cronSchedule: validatedData.cronSchedule || null,
          nextRunAt: nextRunAt,
          alertConfig: validatedData.alertConfig || null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, validatedData.jobId));
      
      // Update notification provider links if alert config is enabled
      if (validatedData.alertConfig?.enabled && Array.isArray(validatedData.alertConfig.notificationProviders)) {
        // First, delete existing links
        await dbInstance.delete(jobNotificationSettings)
          .where(eq(jobNotificationSettings.jobId, validatedData.jobId));
        
        // Then, create new links
        await Promise.all(
          validatedData.alertConfig.notificationProviders.map(providerId =>
            dbInstance.insert(jobNotificationSettings).values({
              jobId: validatedData.jobId,
              notificationProviderId: providerId,
            })
          )
        );
      }
      
      // Delete all existing test associations
      await dbInstance.delete(jobTests)
        .where(eq(jobTests.jobId, validatedData.jobId));
      
      // Create new test associations with updated ordering
      const testRelations = validatedData.tests.map((test, index) => ({
        jobId: validatedData.jobId,
        testId: test.id,
        orderPosition: index,
      }));
      
      if (testRelations.length > 0) {
        await dbInstance.insert(jobTests).values(testRelations);
      }
      
      // Handle scheduling changes
      const previousSchedule = job.cronSchedule;
      const newSchedule = validatedData.cronSchedule;
      const previousSchedulerId = job.scheduledJobId;
      
      // Case 1: Previously scheduled, now removed or changed
      if (previousSchedule && (!newSchedule || previousSchedule !== newSchedule)) {
        if (previousSchedulerId) {
          try {
            await deleteScheduledJob(previousSchedulerId);
            console.log(`Deleted previous job scheduler: ${previousSchedulerId}`);
          } catch (deleteError) {
            console.error(`Error deleting previous scheduler ${previousSchedulerId}:`, deleteError);
            // Continue anyway - we'll still clear the scheduledJobId in the database
          }
          
          // If schedule is removed (not just changed), always clear scheduler ID
          if (!newSchedule || newSchedule.trim() === '') {
            await dbInstance.update(jobs)
              .set({ scheduledJobId: null })
              .where(eq(jobs.id, validatedData.jobId));
          }
        }
      }
      
      // Case 2: New schedule added or schedule changed
      let scheduledJobId = null;
      if (newSchedule && newSchedule.trim() !== '' && (!previousSchedule || previousSchedule !== newSchedule)) {
        try {
          scheduledJobId = await scheduleJob({
            name: validatedData.name,
            cron: newSchedule,
            jobId: validatedData.jobId,
            retryLimit: 3
          });
          
          console.log(`Created new job scheduler: ${scheduledJobId}`);
          
          // Update the job with the new scheduler ID
          await dbInstance.update(jobs)
            .set({ scheduledJobId })
            .where(eq(jobs.id, validatedData.jobId));
        } catch (scheduleError) {
          console.error(`Failed to schedule job:`, scheduleError);
          // Continue anyway - the job is updated but schedule failed
        }
      } else if (newSchedule && newSchedule === previousSchedule && previousSchedulerId) {
        // Keep the existing scheduler ID if schedule hasn't changed
        scheduledJobId = previousSchedulerId;
      }
      
      console.log(`Job ${validatedData.jobId} updated successfully`);
      
      // Revalidate the jobs page
      revalidatePath('/jobs');
      revalidatePath(`/jobs/edit/${validatedData.jobId}`);
      
      return {
        success: true,
        message: "Job updated successfully",
        job: {
          id: validatedData.jobId,
          name: validatedData.name,
          description: validatedData.description || "",
          cronSchedule: validatedData.cronSchedule || null,
          nextRunAt: nextRunAt?.toISOString() || null,
          scheduledJobId,
          testCount: validatedData.tests.length,
        }
      };
    } catch (dbError) {
      console.error(`Database error:`, dbError);
      return {
        success: false,
        message: `Failed to update job: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
        error: dbError
      };
    }
  } catch (validationError) {
    console.error(`Validation error:`, validationError);
    return {
      success: false,
      message: "Invalid data provided",
      error: validationError
    };
  }
}
