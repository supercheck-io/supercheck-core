import { Job } from 'bullmq';
import { db } from "@/utils/db";
import { jobs, runs } from "@/db/schema/schema";
import { JobTrigger } from "@/db/schema/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { getQueues, JobExecutionTask, JOB_EXECUTION_QUEUE } from "./queue";
import crypto from "crypto";
import { getNextRunDate } from "@/lib/cron-utils";
import { createPlaygroundCleanupService, setPlaygroundCleanupInstance, type PlaygroundCleanupService } from './playground-cleanup';
import { prepareJobTestScripts } from './job-execution-utils';

// Map to store the created queues - REMOVED for statelessness
// const queueMap = new Map<string, Queue>();
// Map to store created workers - REMOVED, workers should be in a separate service
// const workerMap = new Map<string, Worker>();

// Constants
// const SCHEDULER_QUEUE = "job-scheduler"; - MOVED to queue.ts
// const JOB_QUEUE_FOR_SCHEDULER = "job-execution"; - MOVED to queue.ts

interface ScheduleOptions {
  name: string;
  cron: string;
  timezone?: string;
  jobId: string;
  // queue: string; // This is now constant (JOB_EXECUTION_QUEUE)
  retryLimit?: number;
}

/**
 * Creates or updates a job scheduler using BullMQ
 */
export async function scheduleJob(options: ScheduleOptions): Promise<string> {
  try {
    // Setting up scheduled job

    // Get queues from central management
    const { jobSchedulerQueue } = await getQueues();

    // Generate a unique name for this scheduled job
    const schedulerJobName = `scheduled-job-${options.jobId}`;

    // First, get job information to access projectId
    const jobData = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, options.jobId))
      .limit(1);
    
    if (jobData.length === 0) {
      throw new Error(`Job ${options.jobId} not found`);
    }
    
    const job = jobData[0];
    console.log(`[Schedule Job] Found job: ${job.name}, projectId: ${job.projectId}`);

    // Use the same variable resolution logic as manual/remote jobs
    // This ensures consistent behavior across all job trigger types
    console.log(`[Schedule Job] Preparing test scripts with variable resolution for job ${options.jobId}...`);
    const { testScripts, variableResolution } = await prepareJobTestScripts(
      options.jobId,
      job.projectId || '',
      crypto.randomUUID(), // temporary runId for logging
      `[Schedule Job ${options.jobId}]`
    );
    
    console.log(`[Schedule Job] Resolved ${Object.keys(variableResolution.variables).length} variables and ${Object.keys(variableResolution.secrets).length} secrets`);
    
    // Convert to the format expected by the worker
    const testCases = testScripts.map(script => ({
      id: script.id,
      title: script.name,
      script: script.script // This is already decoded and has variables resolved
    }));
    
    // Prepared test cases with variables resolved

    // Clean up any existing repeatable jobs for this job ID
    const repeatableJobs = await jobSchedulerQueue.getRepeatableJobs();
    const existingJob = repeatableJobs.find(job => 
      job.id === options.jobId || 
      job.key.includes(options.jobId) || 
      job.name === schedulerJobName
    );
    
    if (existingJob) {
      // Removing existing job
      await jobSchedulerQueue.removeRepeatableByKey(existingJob.key);
    }

    // Create a repeatable job that follows the cron schedule
    // The worker for JOB_SCHEDULER_QUEUE will process this.
    // The data payload contains what's needed to create the *actual* execution job.
    await jobSchedulerQueue.add(
      schedulerJobName,
      {
        jobId: options.jobId,
        name: options.name,
        testCases,
        queue: JOB_EXECUTION_QUEUE, // Keep for handleScheduledJobTrigger
        retryLimit: options.retryLimit || 3,
        // Pass resolved variables and job info to worker
        variables: variableResolution.variables,
        secrets: variableResolution.secrets,
        projectId: job.projectId!,
        organizationId: job.organizationId!,
      },
      {
        repeat: {
          pattern: options.cron,
          tz: options.timezone || 'UTC'
        },
        removeOnComplete: true,
        removeOnFail: 100,
        jobId: schedulerJobName, // Use a deterministic job ID for easier removal
      }
    );

    // Update the job's nextRunAt field in the database
    let nextRunAt = null;
    try {
      if (options.cron) {
        nextRunAt = getNextRunDate(options.cron);
      }
    } catch (error) {
      console.error(`Failed to calculate next run date: ${error}`);
    }
    
    if (nextRunAt) {
      await db
        .update(jobs)
        .set({ nextRunAt })
        .where(eq(jobs.id, options.jobId));
    }

    // WORKER LOGIC IS NOW IN A DEDICATED WORKER SERVICE
    // await ensureSchedulerWorker();

    // Job scheduler created
    return options.jobId;
  } catch (error) {
    console.error(`Failed to schedule job:`, error);
    throw error;
  }
}

/**
 * Handles a scheduled job trigger by creating a run record and adding an execution task
 *
 * NOTE: This function is the logic for a BullMQ worker. It is being kept here
 * for reference but should be moved to and executed by your dedicated worker service
 * (e.g., the `runner` application). When a job on the `JOB_SCHEDULER_QUEUE` is
 * processed, this is the code that should run.
 */
export async function handleScheduledJobTrigger(job: Job) {
  const jobId = job.data.jobId;
  try {
    const data = job.data;
    
    // Handling job trigger
    
    // Check if there's already a run in progress for this job
    const runningRuns = await db
      .select()
      .from(runs)
      .where(and(
        eq(runs.jobId, jobId),
        eq(runs.status, "running")
      ));
    
    if (runningRuns.length > 0) {
      // Job already running, skipping
      return;
    }

    // Create a run record
    const runId = crypto.randomUUID();
    
    // Insert with known fields from the schema
    await db
      .insert(runs)
      .values({
        id: runId,
        jobId: jobId,
        status: "running", // Using direct value matching TestRunStatus from schema
        startedAt: new Date(),
        trigger: "schedule" as JobTrigger,
      });
    
    // Created run record
    
    // Update job's lastRunAt field and calculate nextRunAt
    const now = new Date();
    const jobData = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    
    if (jobData.length > 0) {
      const cronSchedule = jobData[0].cronSchedule;
      let nextRunAt = null;
      
      try {
        if (cronSchedule) {
          nextRunAt = getNextRunDate(cronSchedule);
        }
      } catch (error) {
        console.error(`Failed to calculate next run date: ${error}`);
      }
      
      await db
        .update(jobs)
        .set({
          lastRunAt: now,
          nextRunAt: nextRunAt,
          status: "running", // Using direct value matching JobStatus from schema
        })
        .where(eq(jobs.id, jobId));
    }
    
    // Get the queue for execution
    const { jobQueue } = await getQueues();
    
    // Process the test cases that were passed from the scheduler setup
    // These contain the test scripts that were fetched at scheduling time
    if (!data.testCases || data.testCases.length === 0) {
      console.error(`[${jobId}/${runId}] No test cases found in scheduled job data`);
      throw new Error("No test cases found for scheduled job");
    }
    
    // Use pre-resolved test cases and variables from the scheduler data
    // All scheduled jobs now have variables resolved on the app side for consistency
    const processedTestScripts = data.testCases.map((test: { id: string; script: string; title: string }) => ({
      id: test.id,
      name: test.title || `Test ${test.id}`,
      script: test.script // Script is already decoded and has variables resolved
    }));
    
    if (processedTestScripts.length === 0) {
      console.error(`[${jobId}/${runId}] No test scripts found in scheduled job data`);
      throw new Error("No test scripts found for scheduled job");
    }
    
    console.log(`[${jobId}/${runId}] Using ${processedTestScripts.length} pre-resolved test scripts from scheduled job data`);
    
    // Use pre-resolved variables from the scheduler data
    const variableResolution = {
      variables: data.variables,
      secrets: data.secrets
    };
    
    // Create task for runner service with all necessary information
    const task: JobExecutionTask = {
      runId,
      jobId,
      testScripts: processedTestScripts,
      trigger: 'schedule',
      organizationId: data.organizationId,
      projectId: data.projectId,
      variables: variableResolution.variables,
      secrets: variableResolution.secrets
    };
    
    // Add task to the execution queue - always use runId as both job name and ID
    // This ensures SSE can find it consistently for both manual and scheduled jobs
    const jobOptions = {
      jobId: runId, // Set explicit jobId to match runId for SSE lookups
      attempts: data.retryLimit || 3,
      backoff: {
        type: 'exponential' as const,
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: false,
    };
    
    await jobQueue.add(runId, task, jobOptions);
    
    // Created execution task
    
  } catch (error) {
    console.error(`Failed to process scheduled job trigger:`, error);
    
    // Update job status to error
    try {
      await db
        .update(jobs)
        .set({
          status: "error", // Using direct value matching JobStatus from schema
        })
        .where(eq(jobs.id, jobId));
      
      // Update any "running" runs to "error" status
      await db
        .update(runs)
        .set({
          status: "error", // Using direct value matching TestRunStatus from schema
          errorDetails: `Failed to process scheduled job: ${error instanceof Error ? error.message : String(error)}`,
          completedAt: new Date(),
        })
        .where(and(
          eq(runs.jobId, jobId),
          eq(runs.status, "running")
        ));
        
    } catch (dbError) {
      console.error(`Failed to update job/run status:`, dbError);
    }
  }
}

/**
 * Deletes a job scheduler
 */
export async function deleteScheduledJob(schedulerId: string): Promise<boolean> {
  try {
    // Removing job scheduler
    
    const { jobSchedulerQueue } = await getQueues();
    
    // Get all repeatable jobs
    const repeatableJobs = await jobSchedulerQueue.getRepeatableJobs();
    
    // The name of the job is deterministic
    const schedulerJobName = `scheduled-job-${schedulerId}`;

    // Find all jobs that match this scheduler - checking both key and name patterns
    const jobsToRemove = repeatableJobs.filter(job => 
      job.id === schedulerId || 
      job.key.includes(schedulerId) ||
      job.name === schedulerJobName ||
      job.key.includes(schedulerJobName)
    );
    
    if (jobsToRemove.length > 0) {
      // Remove all matching jobs
      const removePromises = jobsToRemove.map(async (job) => {
        // Removing repeatable job
        return jobSchedulerQueue.removeRepeatableByKey(job.key);
      });
      
      await Promise.all(removePromises);
      // Removed repeatable jobs
      return true;
    } else {
      // No repeatable jobs found
      return false;
    }
  } catch (error) {
    console.error(`Failed to delete scheduled job:`, error);
    return false;
  }
}

/**
 * Initializes job schedulers for all jobs with cron schedules
 * Called on application startup
 */
export async function initializeJobSchedulers() {
  try {
    // Initializing job scheduler
    
    const jobsWithSchedules = await db
      .select()
      .from(jobs)
      .where(isNotNull(jobs.cronSchedule));
      
    // Found scheduled jobs to initialize
    
    let initializedCount = 0;
    let failedCount = 0;
    
    for (const job of jobsWithSchedules) {
      if (!job.cronSchedule) continue;
      
      try {
        const schedulerId = await scheduleJob({
          name: job.name,
          cron: job.cronSchedule,
          jobId: job.id,
          // queue: JOB_EXECUTION_QUEUE, // No longer needed here
          retryLimit: 3
        });
        
        // Update the job with the scheduler ID if needed
        if (!job.scheduledJobId || job.scheduledJobId !== schedulerId) {
          let nextRunAt = null;
          
          try {
            if (job.cronSchedule) {
              nextRunAt = getNextRunDate(job.cronSchedule);
            }
          } catch (error) {
            console.error(`Failed to calculate next run date: ${error}`);
          }
          
          await db
            .update(jobs)
            .set({ 
              scheduledJobId: schedulerId,
              nextRunAt: nextRunAt
            })
            .where(eq(jobs.id, job.id));
        }
        
        // Initialized job scheduler
        initializedCount++;
      } catch (error) {
        console.error(`Failed to initialize scheduler for job ${job.id}:`, error);
        failedCount++;
      }
    }
    
    // Job scheduler initialization complete
    return { success: true, initialized: initializedCount, failed: failedCount };
  } catch (error) {
    console.error(`Failed to initialize job schedulers:`, error);
    return { success: false, error };
  }
}

/**
 * Initialize playground cleanup service
 * Called on application startup after job schedulers
 */
export async function initializePlaygroundCleanup(): Promise<PlaygroundCleanupService | null> {
  try {
    // Initializing playground cleanup
    
    // Check if playground cleanup is disabled
    if (process.env.PLAYGROUND_CLEANUP_ENABLED !== 'true') {
      // Playground cleanup disabled
      return null;
    }

    // Create the playground cleanup service
    const playgroundCleanup = createPlaygroundCleanupService();
    
    // Get Redis connection from existing queue system
    const { redisConnection } = await getQueues();
    
    // Initialize the cleanup service with Redis connection
    await playgroundCleanup.initialize(redisConnection);
    
    // Set the global instance for access throughout the app
    setPlaygroundCleanupInstance(playgroundCleanup);
    
    // Playground cleanup initialized
    return playgroundCleanup;
  } catch (error) {
    console.error("Failed to initialize playground cleanup service:", error);
    // Don't fail the entire initialization if playground cleanup fails
    return null;
  }
}

/**
 * Cleanup function to close all queues and workers
 * Should be called when shutting down the application
 */
export async function cleanupJobScheduler() {
  try {
    // Cleaning up job scheduler
    
    // Clean up orphaned repeatable jobs in Redis
    try {
      // Cleaning up orphaned entries
      const { jobSchedulerQueue } = await getQueues();
      
      // Get all repeatable jobs
      const repeatableJobs = await jobSchedulerQueue.getRepeatableJobs();
      // Found repeatable jobs in Redis
      
      // Get all jobs with schedules from the database
      const jobsWithSchedules = await db
        .select({ id: jobs.id, scheduledJobId: jobs.scheduledJobId })
        .from(jobs)
        .where(isNotNull(jobs.scheduledJobId));
      
      const validJobIds = new Set(jobsWithSchedules.map((job: { id: string; scheduledJobId: string | null; }) => job.id));
      const validSchedulerIds = new Set(jobsWithSchedules.map((job: { id: string; scheduledJobId: string | null; }) => job.scheduledJobId).filter(Boolean));
      
      // Find orphaned jobs (jobs in Redis that don't have a valid jobId or schedulerId in the database)
      const orphanedJobs = repeatableJobs.filter(job => {
        // Extract the job ID from the job name if it follows the pattern "scheduled-job-{jobId}"
        const jobIdMatch = job.name?.match(/scheduled-job-([0-9a-f-]+)/);
        const jobId = jobIdMatch ? jobIdMatch[1] : null;
        
        return (!jobId || !validJobIds.has(jobId)) && 
               (!job.id || !validSchedulerIds.has(job.id as string));
      });
      
      if (orphanedJobs.length > 0) {
        // Found orphaned jobs to clean
        
        // Remove all orphaned jobs
        const removePromises = orphanedJobs.map(async (job) => {
          // Removing orphaned job
          return jobSchedulerQueue.removeRepeatableByKey(job.key);
        });
        
        await Promise.all(removePromises);
        // Removed orphaned jobs
      } else {
        // No orphaned jobs found
      }
      
      // The queue is managed centrally, so we don't close it here.
      // await schedulerQueue.close();
    } catch (redisError) {
      console.error("Error cleaning up Redis entries:", redisError);
      // Continue with initialization even if cleanup fails
    }
    
    // Job scheduler cleanup complete
    return true;
  } catch (error) {
    console.error("Failed to cleanup job scheduler:", error);
    return false;
  }
}

/**
 * Cleanup playground cleanup service
 * Should be called when shutting down the application
 */
export async function cleanupPlaygroundCleanup(): Promise<void> {
  try {
    // Cleaning up playground service
    
    const { getPlaygroundCleanupService } = await import('./playground-cleanup');
    const playgroundCleanup = getPlaygroundCleanupService();
    
    if (playgroundCleanup) {
      await playgroundCleanup.shutdown();
      // Playground cleanup shutdown
    } else {
      // No playground service to shutdown
    }
  } catch (error) {
    console.error("Failed to cleanup playground cleanup service:", error);
    // Don't fail the entire cleanup process
  }
} 