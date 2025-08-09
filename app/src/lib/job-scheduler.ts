import { Job } from 'bullmq';
import { db } from "@/utils/db";
import { jobs, jobTests, runs, tests, testsSelectSchema } from "@/db/schema/schema";
import { JobTrigger } from "@/db/schema/schema";
import { eq, isNotNull, and, inArray } from "drizzle-orm";
import { getQueues, JobExecutionTask, JOB_EXECUTION_QUEUE } from "./queue";
import crypto from "crypto";
import { getNextRunDate } from "@/lib/cron-utils";
import { z } from 'zod';

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
    console.log(`Setting up scheduled job "${options.name}" (${options.jobId}) with cron pattern ${options.cron}`);

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

    console.log(`Job has ${jobTestsList.length} tests. Setting up repeatable job...`);

    // Fetch all test scripts upfront - directly from database to avoid auth issues
    const testIds = jobTestsList.map(jt => jt.testId);
    console.log(`Fetching test data for ${testIds.length} tests: ${testIds.join(', ')}`);
    
    const testData = await db
      .select()
      .from(tests)
      .where(inArray(tests.id, testIds));
      
    console.log(`Retrieved ${testData.length} test records from database`);
    
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
    
    console.log(`Final testCases count: ${testCases.length}`);

    // Clean up any existing repeatable jobs for this job ID
    const repeatableJobs = await jobSchedulerQueue.getRepeatableJobs();
    const existingJob = repeatableJobs.find(job => 
      job.id === options.jobId || 
      job.key.includes(options.jobId) || 
      job.name === schedulerJobName
    );
    
    if (existingJob) {
      console.log(`Removing existing repeatable job: ${existingJob.key}`);
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

    console.log(`Created job scheduler ${options.jobId} with cron pattern ${options.cron}`);
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
    
    console.log(`Handling scheduled job trigger for job ${jobId}`);
    
    // Check if there's already a run in progress for this job
    const runningRuns = await db
      .select()
      .from(runs)
      .where(and(
        eq(runs.jobId, jobId),
        eq(runs.status, "running")
      ));
    
    if (runningRuns.length > 0) {
      console.log(`Job ${jobId} already has a running execution, skipping`);
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
    
    console.log(`Created run record ${runId} for scheduled job ${jobId}`);
    
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
    
    // Create task for runner service with all necessary information
    const task: JobExecutionTask = {
      runId,
      jobId,
      testScripts: data.testCases.map((test: z.infer<typeof testsSelectSchema>) => ({
        id: test.id,
        script: test.script,
        name: test.title
      })),
      trigger: 'schedule',
      organizationId: jobData[0]?.organizationId || '',
      projectId: jobData[0]?.projectId || ''
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
    
    console.log(`Created execution task for scheduled job ${jobId}, run ${runId} with jobId = runId`);
    
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
    console.log(`Removing job scheduler ${schedulerId}`);
    
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
        console.log(`Removing repeatable job with key ${job.key}`);
        return jobSchedulerQueue.removeRepeatableByKey(job.key);
      });
      
      await Promise.all(removePromises);
      console.log(`Removed ${jobsToRemove.length} repeatable jobs for scheduler ${schedulerId}`);
      return true;
    } else {
      console.log(`No repeatable jobs found for scheduler ${schedulerId}`);
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
    console.log("Initializing job scheduler...");
    
    // DEPRECATED: Worker management is now external
    // for (const [name, worker] of workerMap.entries()) { ... }
    // workerMap.clear();
    // await ensureSchedulerWorker();
    
    const jobsWithSchedules = await db
      .select()
      .from(jobs)
      .where(isNotNull(jobs.cronSchedule));
      
    console.log(`Found ${jobsWithSchedules.length} scheduled jobs to initialize`);
    
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
        
        console.log(`Initialized job scheduler ${schedulerId} for job ${job.id}`);
        initializedCount++;
      } catch (error) {
        console.error(`Failed to initialize scheduler for job ${job.id}:`, error);
        failedCount++;
      }
    }
    
    console.log(`Job scheduler initialization complete: ${initializedCount} succeeded, ${failedCount} failed`);
    return { success: true, initialized: initializedCount, failed: failedCount };
  } catch (error) {
    console.error(`Failed to initialize job schedulers:`, error);
    return { success: false, error };
  }
}

/**
 * Cleanup function to close all queues and workers
 * Should be called when shutting down the application
 */
export async function cleanupJobScheduler() {
  try {
    console.log("Cleaning up job scheduler...");
    
    // DEPRECATED: Worker and queue management is now external / centralized
    // for (const [name, worker] of workerMap.entries()) { ... }
    // workerMap.clear();
    // for (const [name, queue] of queueMap.entries()) { ... }
    // queueMap.clear();
    
    // Clean up orphaned repeatable jobs in Redis
    try {
      console.log("Cleaning up orphaned Redis entries...");
      const { jobSchedulerQueue } = await getQueues();
      
      // Get all repeatable jobs
      const repeatableJobs = await jobSchedulerQueue.getRepeatableJobs();
      console.log(`Found ${repeatableJobs.length} repeatable jobs in Redis`);
      
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
        console.log(`Found ${orphanedJobs.length} orphaned repeatable jobs to clean up`);
        
        // Remove all orphaned jobs
        const removePromises = orphanedJobs.map(async (job) => {
          console.log(`Removing orphaned repeatable job: ${job.key}`);
          return jobSchedulerQueue.removeRepeatableByKey(job.key);
        });
        
        await Promise.all(removePromises);
        console.log(`Removed ${orphanedJobs.length} orphaned repeatable jobs`);
      } else {
        console.log("No orphaned repeatable jobs found");
      }
      
      // The queue is managed centrally, so we don't close it here.
      // await schedulerQueue.close();
    } catch (redisError) {
      console.error("Error cleaning up Redis entries:", redisError);
      // Continue with initialization even if cleanup fails
    }
    
    console.log("Job scheduler cleanup complete");
    return true;
  } catch (error) {
    console.error("Failed to cleanup job scheduler:", error);
    return false;
  }
} 