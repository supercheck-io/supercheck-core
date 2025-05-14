import { Queue } from 'bullmq';
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getRedisConnection } from "./queue";
import { JobExecutionTask } from "./queue";

// Map to store the created queues by name
const queueMap = new Map<string, Queue>();

interface ScheduleOptions {
  name: string;
  cron: string;
  timezone?: string;
  data: JobExecutionTask | Record<string, unknown>;
  queue: string;
  retryLimit?: number;
  expireInMinutes?: number;
}

/**
 * Schedules a job to run on a cron schedule
 * @returns The name of the scheduled job (to be used for cancellation)
 */
export async function scheduleJob(options: ScheduleOptions): Promise<string> {
  try {
    const redisConnection = await getRedisConnection();
    
    // Generate a unique name for this schedule
    const scheduleName = `schedule_${options.name}_${Date.now()}`;
    
    // Create a queue if it doesn't exist or get the existing one
    if (!queueMap.has(options.queue)) {
      queueMap.set(options.queue, new Queue(options.queue, { 
        connection: redisConnection 
      }));
    }
    
    const queue = queueMap.get(options.queue)!;
    
    // Add a repeatable job
    await queue.add(
      scheduleName,
      options.data,
      { 
        repeat: { 
          pattern: options.cron,
          tz: options.timezone || 'UTC' 
        },
        jobId: scheduleName,
        attempts: options.retryLimit || 1,
        removeOnComplete: true,
        removeOnFail: 10
      }
    );
    
    console.log(`Scheduled job ${scheduleName} with cron pattern ${options.cron}`);
    return scheduleName;
  } catch (error) {
    console.error(`Error scheduling job:`, error);
    throw new Error(`Failed to schedule job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Deletes a scheduled job by name
 * @returns True if the job was deleted successfully
 */
export async function deleteScheduledJob(scheduleName: string): Promise<boolean> {
  try {
    // We need to find which queue this schedule belongs to
    // Either we need to keep track of this or search through all queues
    
    // For simplicity, assume it's in the job-execution queue
    const queue = queueMap.get('job-execution') || new Queue('job-execution', {
      connection: await getRedisConnection()
    });
    
    // Remove the repeatable job
    const removed = await queue.removeRepeatable(
      scheduleName,    // job name
      { 
        pattern: "* * * * *",  // A default pattern (doesn't matter as we use jobId)
        jobId: scheduleName 
      }
    );
    
    console.log(`Deleted scheduled job ${scheduleName}: ${removed}`);
    return true;
  } catch (error) {
    console.error(`Error deleting scheduled job ${scheduleName}:`, error);
    return false;
  }
}

/**
 * Initialize the job scheduler by scheduling all jobs that have a scheduledJobId
 * This is meant to be called during app startup
 * @returns Promise<boolean> true if successful, false otherwise
 */
export async function safeInitializeJobScheduler(): Promise<boolean> {
  try {
    console.log(`[JOB SCHEDULER] Initializing job scheduler...`);
    
    // Get the database instance
    const dbInstance = await db();
    
    // Find all jobs with scheduled jobs
    const scheduledJobs = await dbInstance
      .select({
        id: jobs.id,
        name: jobs.name,
        cronSchedule: jobs.cronSchedule,
        scheduledJobId: jobs.scheduledJobId,
      })
      .from(jobs)
      .where(
        isNotNull(jobs.scheduledJobId)
      );
    
    console.log(`[JOB SCHEDULER] Found ${scheduledJobs.length} jobs with schedules to initialize`);
    
    // Loop through each job and reschedule it
    for (const job of scheduledJobs) {
      try {
        if (job.scheduledJobId && job.cronSchedule) {
          // First, clean up any existing schedule
          try {
            await deleteScheduledJob(job.scheduledJobId);
          } catch (cleanupError) {
            console.warn(`[JOB SCHEDULER] Error cleaning up existing schedule for job ${job.id}:`, cleanupError);
            // Continue anyway, we'll create a new schedule
          }
          
          // Create a new schedule using the same cronSchedule
          console.log(`[JOB SCHEDULER] Rescheduling job ${job.id} (${job.name}) with cron: ${job.cronSchedule}`);
          
          // Schedule the job with the job execution queue
          const newScheduleId = await scheduleJob({
            name: job.name,
            cron: job.cronSchedule,
            timezone: "UTC", // Default timezone
            data: {
              jobId: job.id,
            },
            queue: "job-execution",
            retryLimit: 1,
          });
          
          // Update the job with the new schedule ID
          await dbInstance
            .update(jobs)
            .set({
              scheduledJobId: newScheduleId,
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, job.id));
            
          console.log(`[JOB SCHEDULER] Successfully rescheduled job ${job.id} with new schedule ID: ${newScheduleId}`);
        }
      } catch (jobError) {
        console.error(`[JOB SCHEDULER] Error scheduling job ${job.id}:`, jobError);
        // Continue with other jobs even if one fails
      }
    }
    
    console.log(`[JOB SCHEDULER] Job scheduler initialization complete`);
    return true;
  } catch (error) {
    console.error(`[JOB SCHEDULER] Error initializing job scheduler:`, error);
    return false;
  }
} 