import { Job } from 'bullmq';
import { db } from "@/utils/db";
import { jobs, jobTests, runs, tests, testsSelectSchema } from "@/db/schema/schema";
import { JobTrigger } from "@/db/schema/schema";
import { eq, isNotNull, and, inArray } from "drizzle-orm";
import { getQueues, JobExecutionTask, JOB_EXECUTION_QUEUE } from "./queue";
import crypto from "crypto";
import { getNextRunDate } from "@/lib/cron-utils";
import { z } from 'zod';
import { createPlaygroundCleanupService, setPlaygroundCleanupInstance, type PlaygroundCleanupService } from './playground-cleanup';
import { resolveProjectVariables, generateVariableFunctions, type VariableResolutionResult } from './variable-resolver';

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

    // Fetch all tests associated with the job
    const jobTestsList = await db
      .select({ testId: jobTests.testId, orderPosition: jobTests.orderPosition })
      .from(jobTests)
      .where(eq(jobTests.jobId, options.jobId))
      .orderBy(jobTests.orderPosition);

    // Setting up repeatable job

    // Fetch all test scripts upfront - directly from database to avoid auth issues
    const testIds = jobTestsList.map(jt => jt.testId);
    // Fetching test data
    
    const testData = await db
      .select()
      .from(tests)
      .where(inArray(tests.id, testIds));
      
    // Retrieved test records
    
    // Map tests with their order positions
    const testCases = jobTestsList.map(jobTest => {
      const test = testData.find(t => t.id === jobTest.testId);
      if (!test) {
        console.error(`Test not found for ID: ${jobTest.testId}`);
        return null;
      }
      return {
        ...test,
        orderPosition: jobTest.orderPosition
      };
    }).filter(Boolean); // Remove null entries
    
    // Prepared test cases

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
    
    // Resolve variables for the project
    let variableResolution: VariableResolutionResult = { variables: {}, secrets: {}, errors: undefined };
    if (jobData.length > 0 && jobData[0].projectId) {
      // Resolving project variables
      variableResolution = await resolveProjectVariables(jobData[0].projectId);
      
      if (variableResolution.errors && variableResolution.errors.length > 0) {
        console.warn(`[${jobId}/${runId}] Variable resolution errors for scheduled job:`, variableResolution.errors);
        // Continue execution but log warnings
      }
    }
    
    // Generate both getVariable and getSecret function implementations
    const variableFunctionCode = generateVariableFunctions(variableResolution.variables, variableResolution.secrets);
    
    // Process test scripts to include variable resolution
    const processedTestScripts = data.testCases.map((test: z.infer<typeof testsSelectSchema>) => ({
      id: test.id,
      script: variableFunctionCode + '\n' + test.script,
      name: test.title
    }));
    
    // Create task for runner service with all necessary information
    const task: JobExecutionTask = {
      runId,
      jobId,
      testScripts: processedTestScripts,
      trigger: 'schedule',
      organizationId: jobData[0]?.organizationId || '',
      projectId: jobData[0]?.projectId || '',
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