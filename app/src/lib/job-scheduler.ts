import { Queue, Job, Worker } from 'bullmq';
import { db } from "@/lib/db";
import { jobs, jobTests, runs } from "@/db/schema/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { getRedisConnection } from "./queue";
import { JobExecutionTask, JOB_EXECUTION_QUEUE } from "./queue";
import crypto from "crypto";
import { getTest } from "@/actions/get-test";
import { getNextRunDate } from "@/lib/cron-utils";

// Map to store the created queues
const queueMap = new Map<string, Queue>();
// Map to store created workers
const workerMap = new Map<string, Worker>();

// Constants
const SCHEDULER_QUEUE = "job-scheduler";
const JOB_QUEUE_FOR_SCHEDULER = "job-execution";

interface ScheduleOptions {
  name: string;
  cron: string;
  timezone?: string;
  jobId: string;
  queue: string;
  retryLimit?: number;
}

/**
 * Creates or updates a job scheduler using BullMQ
 */
export async function scheduleJob(options: ScheduleOptions): Promise<string> {
  try {
    console.log(`Setting up scheduled job "${options.name}" (${options.jobId}) with cron pattern ${options.cron}`);

    // Redis connection for BullMQ
    const connection = await getRedisConnection();

    // Create scheduler queue if it doesn't exist
    let schedulerQueue: Queue;
    if (!queueMap.has(SCHEDULER_QUEUE)) {
      schedulerQueue = new Queue(SCHEDULER_QUEUE, { connection });
      queueMap.set(SCHEDULER_QUEUE, schedulerQueue);
    } else {
      schedulerQueue = queueMap.get(SCHEDULER_QUEUE)!;
    }

    // Create execution queue if needed
    let executionQueue: Queue;
    if (!queueMap.has(options.queue)) {
      executionQueue = new Queue(options.queue, { connection });
      queueMap.set(options.queue, executionQueue);
    } else {
      executionQueue = queueMap.get(options.queue)!;
    }

    // Generate a unique name for this scheduled job
    const schedulerJobName = `scheduled-job-${options.jobId}`;

    // Fetch all tests associated with the job
    const jobTestsList = await db
      .select({ testId: jobTests.testId, orderPosition: jobTests.orderPosition })
      .from(jobTests)
      .where(eq(jobTests.jobId, options.jobId))
      .orderBy(jobTests.orderPosition);

    console.log(`Job has ${jobTestsList.length} tests. Setting up repeatable job...`);

    // Fetch all test scripts upfront
    const testCasePromises = jobTestsList.map(async (jobTest) => {
      const test = await getTest(jobTest.testId);
      return {
        ...test.test,
        orderPosition: jobTest.orderPosition
      };
    });
    
    const testCases = await Promise.all(testCasePromises);

    // Clean up any existing repeatable jobs for this job ID
    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    const existingJob = repeatableJobs.find(job => 
      job.id === options.jobId || 
      job.key.includes(options.jobId) || 
      job.name === schedulerJobName
    );
    
    if (existingJob) {
      console.log(`Removing existing repeatable job: ${existingJob.key}`);
      await schedulerQueue.removeRepeatableByKey(existingJob.key);
    }

    // Create a repeatable job that follows the cron schedule
    await schedulerQueue.add(
      schedulerJobName,
      {
        jobId: options.jobId,
        name: options.name,
        testCases,
        queue: options.queue,
        retryLimit: options.retryLimit || 3,
      },
      {
        repeat: {
          pattern: options.cron,
          tz: options.timezone || 'UTC'
        },
        removeOnComplete: true,
        removeOnFail: 100,
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
      await db.update(jobs)
        .set({ nextRunAt })
        .where(eq(jobs.id, options.jobId));
    }

    // Ensure the worker exists
    await ensureSchedulerWorker();

    console.log(`Created job scheduler ${options.jobId} with cron pattern ${options.cron}`);
    return options.jobId;
  } catch (error) {
    console.error(`Failed to schedule job:`, error);
    throw error;
  }
}

/**
 * Ensures a worker exists to process the scheduler queue jobs
 */
async function ensureSchedulerWorker() {
  if (!workerMap.has(SCHEDULER_QUEUE)) {
    console.log(`Creating worker for ${SCHEDULER_QUEUE}`);
    const connection = await getRedisConnection();
    
    const worker = new Worker(
      SCHEDULER_QUEUE,
      async (job) => {
        console.log(`Processing scheduled job: ${job.name} (${job.id})`);
        await handleScheduledJobTrigger(job);
        return { success: true };
      },
      { connection }
    );

    worker.on('completed', (job) => {
      console.log(`Scheduled job completed: ${job.name}`);
    });

    worker.on('failed', (job, error) => {
      console.error(`Scheduled job failed: ${job?.name}`, error);
    });

    workerMap.set(SCHEDULER_QUEUE, worker);
  }
}

/**
 * Handles a scheduled job trigger by creating a run record and adding an execution task
 */
async function handleScheduledJobTrigger(job: Job) {
  try {
    const data = job.data;
    const jobId = data.jobId;
    
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
    const connection = await getRedisConnection();
    let executionQueue: Queue;
    
    if (!queueMap.has(data.queue)) {
      executionQueue = new Queue(data.queue, { connection });
      queueMap.set(data.queue, executionQueue);
    } else {
      executionQueue = queueMap.get(data.queue)!;
    }
    
    // Create task for runner service with all necessary information
    const task: JobExecutionTask = {
      runId,
      jobId,
      testScripts: data.testCases.map((test: { id: string; script: string; title: string }) => ({
        id: test.id,
        script: test.script,
        name: test.title
      }))
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
    
    await executionQueue.add(runId, task, jobOptions);
    
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
    
    const connection = await getRedisConnection();
    
    let schedulerQueue: Queue;
    if (!queueMap.has(SCHEDULER_QUEUE)) {
      schedulerQueue = new Queue(SCHEDULER_QUEUE, { connection });
      queueMap.set(SCHEDULER_QUEUE, schedulerQueue);
    } else {
      schedulerQueue = queueMap.get(SCHEDULER_QUEUE)!;
    }
    
    // Get all repeatable jobs
    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    
    // Find all jobs that match this scheduler - checking both key and name patterns
    const jobsToRemove = repeatableJobs.filter(job => 
      job.id === schedulerId || 
      job.key.includes(schedulerId) ||
      job.name === `scheduled-job-${schedulerId}` ||
      job.key.includes(`scheduled-job-${schedulerId}`)
    );
    
    if (jobsToRemove.length > 0) {
      // Remove all matching jobs
      const removePromises = jobsToRemove.map(async (job) => {
        console.log(`Removing repeatable job with key ${job.key}`);
        return schedulerQueue.removeRepeatableByKey(job.key);
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
    
    // Close any existing workers
    for (const [name, worker] of workerMap.entries()) {
      console.log(`Closing worker: ${name}`);
      await worker.close();
    }
    workerMap.clear();
    
    // Ensure the scheduler worker is created
    await ensureSchedulerWorker();
    
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
          queue: JOB_EXECUTION_QUEUE,
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
    
    // Close all workers
    for (const [name, worker] of workerMap.entries()) {
      console.log(`Closing worker: ${name}`);
      await worker.close();
    }
    workerMap.clear();
    
    // Close all queues
    for (const [name, queue] of queueMap.entries()) {
      console.log(`Closing queue: ${name}`);
      await queue.close();
    }
    queueMap.clear();
    
    // Clean up orphaned repeatable jobs in Redis
    try {
      console.log("Cleaning up orphaned Redis entries...");
      const connection = await getRedisConnection();
      const schedulerQueue = new Queue(SCHEDULER_QUEUE, { connection });
      
      // Get all repeatable jobs
      const repeatableJobs = await schedulerQueue.getRepeatableJobs();
      console.log(`Found ${repeatableJobs.length} repeatable jobs in Redis`);
      
      // Get all jobs with schedules from the database
      const jobsWithSchedules = await db
        .select({ id: jobs.id, scheduledJobId: jobs.scheduledJobId })
        .from(jobs)
        .where(isNotNull(jobs.scheduledJobId));
      
      const validJobIds = new Set(jobsWithSchedules.map(job => job.id));
      const validSchedulerIds = new Set(jobsWithSchedules.map(job => job.scheduledJobId).filter(Boolean));
      
      // Find orphaned jobs (jobs in Redis that don't have a valid jobId or schedulerId in the database)
      const orphanedJobs = repeatableJobs.filter(job => {
        // Extract the job ID from the job name if it follows the pattern "scheduled-job-{jobId}"
        const jobIdMatch = job.name?.match(/scheduled-job-([0-9a-f-]+)/);
        const jobId = jobIdMatch ? jobIdMatch[1] : null;
        
        return (!jobId || !validJobIds.has(jobId)) && 
               (!job.id || !validSchedulerIds.has(job.id));
      });
      
      if (orphanedJobs.length > 0) {
        console.log(`Found ${orphanedJobs.length} orphaned repeatable jobs to clean up`);
        
        // Remove all orphaned jobs
        const removePromises = orphanedJobs.map(async (job) => {
          console.log(`Removing orphaned repeatable job: ${job.key}`);
          return schedulerQueue.removeRepeatableByKey(job.key);
        });
        
        await Promise.all(removePromises);
        console.log(`Removed ${orphanedJobs.length} orphaned repeatable jobs`);
      } else {
        console.log("No orphaned repeatable jobs found");
      }
      
      await schedulerQueue.close();
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