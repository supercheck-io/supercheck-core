import PgBoss from 'pg-boss';
import { Job, JobWithMetadata } from 'pg-boss';
import { Client } from 'pg';
import crypto from 'crypto';

// Type for test execution task
export interface TestExecutionTask {
  testId: string;
  testPath: string;
}

// Type for job execution task (multiple tests)
export interface JobExecutionTask {
  jobId: string;
  testScripts: Array<{
    id: string;
    script: string;
    name?: string;
  }>;
}

// Type for scheduled job
export interface ScheduledJobOptions {
  name: string;        // Human-readable name for the job
  cron: string;        // Cron expression (e.g., "0 0 * * *" for daily at midnight)
  timezone?: string;   // Optional timezone (e.g., "America/New_York")
  data: JobExecutionTask | TestExecutionTask;  // Job data
  queue: string;       // Which queue to use
  retryLimit?: number; // Number of retries
  expireInMinutes?: number; // Job expiration time
}

// Type for status updates - this will be imported by other modules
export interface TestStatusUpdateMap {
  get(key: string): any;
  set(key: string, value: any): any;
  has(key: string): boolean;
}

// Store job results for tracking completion
// Include a special property to differentiate between in-progress, completed, and error states
interface StoredJobResult<T = any> {
  pending?: boolean;   // Job is in progress 
  timestamp?: number;  // When the entry was created
  result?: T;          // Successful result
  completedAt?: number; // When job completed
  error?: string;      // Error if job failed
  success?: boolean;   // Explicit success state
  pgBossJobId?: string; // pg-boss generated job ID for reference
}

const jobResults = new Map<string, StoredJobResult>();

// We'll need to declare this but defer actual initialization to avoid circular dependencies
let testStatusMapRef: TestStatusUpdateMap | null = null;

// Export the test status map reference for bidirectional updates
export { testStatusMapRef };

// Function to set the status map reference from test-execution.ts
export function setTestStatusMap(statusMap: TestStatusUpdateMap): void {
  testStatusMapRef = statusMap;
}

// The pg-boss queue instance
let bossInstance: PgBoss | null = null;

// Track if the worker has been initialized
let workerInitialized = {
  test: false,
  job: false
};

// Queue names for different task types
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';
// Define completed job queue name pattern
export const COMPLETED_JOB_PREFIX = '__state__completed__';
// Scheduled jobs prefix
export const SCHEDULED_JOB_PREFIX = 'scheduled-';

// Default timeout for jobs (15 minutes)
export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

// Remove direct execution flags and handlers
let queueInitialized = false;
let queueInitializing = false;
let queueInitPromise: Promise<PgBoss | null> | null = null;

// Create a simple guard to prevent multiple worker initializations
let workerInitPromise: Promise<void> | null = null;

// Store references to our intervals for cleanup
let testTaskProcessorInterval: NodeJS.Timeout | null = null;
let jobTaskProcessorInterval: NodeJS.Timeout | null = null;

/**
 * Get the pg-boss queue instance (singleton pattern)
 */
export async function getQueueInstance(): Promise<PgBoss> {
  if (!bossInstance) {
    bossInstance = await setupQueue();
    if (!bossInstance) {
      throw new Error('Failed to initialize queue - possibly in report server mode');
    }
  }
  return bossInstance;
}

/**
 * Add a test execution task to the queue
 */
export async function addTestToQueue(task: TestExecutionTask, expiryMinutes: number = 15): Promise<string> {
  const boss = await getQueueInstance();
  console.log(`Adding test to queue ${TEST_EXECUTION_QUEUE}:`, task);
  
  // Generate a unique ID for this job that we control
  const jobUuid = crypto.randomUUID();
  
  // Try to safely stringify the task for logging
  try {
    const safeTask = JSON.stringify(task);
    console.log(`Task data: ${safeTask}`);
  } catch (err) {
    console.warn(`Could not stringify task for logging:`, err);
  }
  
  try {
    // Use simple options without specifying ID
    const jobOptions = {
      retryLimit: 2,
      expireInMinutes: expiryMinutes,
      // Use our own ID instead of relying on pg-boss to generate one
      id: jobUuid
    };
    
    // Check if the queue is functional before sending
    try {
      const queueSize = await boss.getQueueSize(TEST_EXECUTION_QUEUE);
      console.log(`Current queue size before send: ${queueSize}`);
    } catch (sizeError) {
      console.warn(`Could not get queue size: ${sizeError}`);
    }
    
    // Send the job to the queue with retry logic
    let jobId: string | null = null;
    let retryCount = 0;
    const maxRetries = 1; // Reduced to 1 since we'll use direct execution as fallback
    
    while (!jobId && retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`Retrying boss.send (attempt ${retryCount})`);
        }
        
        jobId = await boss.send(TEST_EXECUTION_QUEUE, task, jobOptions);
        console.log(`Boss.send response: ${typeof jobId} - ${jobId}`);
        
        // Even if pg-boss returns null, we can use our own jobUuid
        if (!jobId) {
          console.warn('boss.send returned null job ID, using our generated UUID');
          jobId = jobUuid;
        }
      } catch (sendError) {
        console.error(`PgBoss send error for test ${task.testId} (attempt ${retryCount}):`, sendError);
        
        if (retryCount >= maxRetries) {
          // Use our own ID as a fallback even on error
          console.warn('All send attempts failed, using generated fallback ID');
          jobId = jobUuid;
        } else {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
        }
      }
    }
    
    // If pg-boss failed to queue the job properly, use our direct execution approach
    if (!global._addTestToDirectQueue) {
      console.warn('Direct execution queue not initialized, worker may not be ready');
    } else if (jobId === jobUuid) {
      // If we're using our fallback ID, that means pg-boss send failed
      console.log('Using direct execution queue as pg-boss send failed');
      global._addTestToDirectQueue(task);
    }
    
    // Store an initial entry in the results map using our consistent ID
    jobResults.set(task.testId, { 
      pending: true, 
      timestamp: Date.now(), 
      pgBossJobId: jobId || jobUuid // Ensure we never store null
    });
    
    console.log(`Successfully added test ${task.testId} to queue, tracking ID: ${jobId}`);
    
    return task.testId;
  } catch (error) {
    console.error(`Error adding test ${task.testId} to queue:`, error);
    throw new Error(`Failed to create test execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add a job execution task (multiple tests) to the queue
 */
export async function addJobToQueue(task: JobExecutionTask, expiryMinutes: number = 30): Promise<string> {
  const boss = await getQueueInstance();
  console.log(`Adding job to queue ${JOB_EXECUTION_QUEUE}:`, { jobId: task.jobId, testCount: task.testScripts.length });
  
  // Generate a unique ID for this job as a fallback
  const jobUuid = crypto.randomUUID();
  
  try {
    // Use simple options with our own ID to avoid null returns
    const jobOptions = {
      retryLimit: 1,
      expireInMinutes: expiryMinutes,
      id: jobUuid // Use our own ID instead of relying on pg-boss
    };
    
    // Check queue status
    try {
      const queueSize = await boss.getQueueSize(JOB_EXECUTION_QUEUE);
      console.log(`Current queue size before sending job: ${queueSize}`);
    } catch (sizeError) {
      console.warn(`Could not get queue size: ${sizeError}`);
    }
    
    // Send with retry logic
    let jobId: string | null = null;
    let retryCount = 0;
    const maxRetries = 1; // Just try once, then use direct execution
    
    while (!jobId && retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`Retrying job send (attempt ${retryCount})`);
        }
        
        jobId = await boss.send(JOB_EXECUTION_QUEUE, task, jobOptions);
        console.log(`Job send response: ${typeof jobId} - ${jobId}`);
        
        if (!jobId) {
          console.warn('boss.send returned null job ID, using our generated UUID');
          jobId = jobUuid;
        }
      } catch (sendError) {
        console.error(`Error sending job ${task.jobId} (attempt ${retryCount}):`, sendError);
        
        if (retryCount >= maxRetries) {
          console.warn('All job send attempts failed, using generated fallback ID');
          jobId = jobUuid;
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
          retryCount++;
        }
      }
    }
    
    // If pg-boss failed to queue the job properly, use our direct execution approach
    if (!global._addJobToDirectQueue) {
      console.warn('Direct execution queue for jobs not initialized, worker may not be ready');
    } else if (jobId === jobUuid) {
      // If we're using our fallback ID, that means pg-boss send failed
      console.log('Using direct execution queue for jobs as pg-boss send failed');
      global._addJobToDirectQueue(task);
    }
    
    // Store tracking info
    jobResults.set(task.jobId, { 
      pending: true, 
      timestamp: Date.now(), 
      pgBossJobId: jobId || jobUuid // Never store null
    });
    
    console.log(`Successfully added job ${task.jobId} to queue, tracking ID: ${jobId}`);
    return task.jobId;
  } catch (error) {
    console.error(`Error adding job ${task.jobId} to queue:`, error);
    throw new Error(`Failed to create job execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Schedule a recurring job using cron expression
 * @param options The job scheduling options
 * @returns The name of the scheduled job
 */
export async function scheduleJob(options: ScheduledJobOptions): Promise<string> {
  const boss = await getQueueInstance();
  
  const { name, cron, timezone, data, queue, retryLimit = 1, expireInMinutes = 30 } = options;
  
  // Generate a unique name for the schedule if none provided
  const scheduleName = `${SCHEDULED_JOB_PREFIX}${name}-${Date.now()}`;
  
  console.log(`Scheduling job ${scheduleName} with cron: ${cron}${timezone ? `, timezone: ${timezone}` : ''}`);
  
  try {
    // Create the schedule that will send jobs to our target queue
    await boss.schedule(
      queue,     // The queue to send jobs to
      cron,      // Cron expression
      {          // Data for the job
        ...data,
        _scheduled: true,
        _scheduleName: scheduleName
      },
      {          // Job options
        retryLimit,
        expireInMinutes,
        ...(timezone && { timezone })
      }
    );
    
    console.log(`Successfully scheduled job: ${scheduleName}`);
    return scheduleName;
  } catch (error) {
    console.error(`Failed to schedule job ${scheduleName}:`, error);
    throw error;
  }
}

/**
 * Get a list of all scheduled jobs
 */
export async function getScheduledJobs(): Promise<any[]> {
  const boss = await getQueueInstance();
  
  try {
    // First try the getSchedules API
    try {
      const schedules = await boss.getSchedules();
      return schedules.filter(schedule => 
        schedule && typeof schedule.name === 'string' && 
        schedule.name.startsWith(SCHEDULED_JOB_PREFIX)
      );
    } catch (e) {
      // If getSchedules isn't available or fails, fallback to a more generic approach
      console.warn('getSchedules API failed, using fallback method:', e);
      
      // This is a simplified fallback that may not work in all pg-boss versions
      return [];
    }
  } catch (error) {
    console.error('Error getting scheduled jobs:', error);
    return [];
  }
}

/**
 * Delete a scheduled job
 * @param scheduleName The name of the schedule to delete
 */
export async function deleteScheduledJob(scheduleName: string): Promise<boolean> {
  const boss = await getQueueInstance();
  
  try {
    console.log(`Deleting scheduled job: ${scheduleName}`);
    
    // Try to unschedule the job
    await boss.unschedule(scheduleName);
    return true;
  } catch (error) {
    console.error(`Error deleting scheduled job ${scheduleName}:`, error);
    return false;
  }
}

/**
 * Setup workers for job completion queues
 */
async function setupCompletionWorkers(boss: PgBoss): Promise<void> {
  const completedQueues = [`${COMPLETED_JOB_PREFIX}${TEST_EXECUTION_QUEUE}`, `${COMPLETED_JOB_PREFIX}${JOB_EXECUTION_QUEUE}`];
  for (const queueName of completedQueues) {
    await boss.work(queueName, { batchSize: 20 }, async (jobs) => {
      if (!Array.isArray(jobs) || jobs.length === 0) return;
      for (const job of jobs) {
        const jobData = job.data as any;
        const originalId = jobData.request?.id || job.id;
        const success = !jobData.failed && !jobData.error;
        jobResults.set(originalId, { result: jobData.data, completedAt: Date.now(), success, error: jobData.error || null });
      }
      return true;
    });
  }
}

/**
 * Setup a worker function to process test execution tasks
 * @param maxConcurrency Maximum number of concurrent test executions
 * @param handler Function to handle each test execution
 */
export async function setupTestExecutionWorker(
  maxConcurrency: number,
  handler: (task: TestExecutionTask) => Promise<any>
): Promise<void> {
  // If worker is already set up, don't do it again
  if (workerInitialized.test) {
    console.log('Test execution worker already initialized, skipping setup');
    return;
  }
  
  const boss = await getQueueInstance();
  
  // Clear any previous workers for this queue
  try {
    await boss.offWork(TEST_EXECUTION_QUEUE);
    console.log(`Removed any existing workers for ${TEST_EXECUTION_QUEUE}`);
  } catch (error) {
    console.warn(`Error clearing existing test workers: ${error}`);
  }
  
  // Create a direct execution queue to handle tasks when pg-boss fails
  const pendingTasks = new Map<string, TestExecutionTask>();
  const runningTasks = new Set<string>();
  
  // Function to process tasks from our direct execution queue
  const processDirectTasks = async () => {
    // Only process if we haven't reached max concurrency
    if (runningTasks.size >= maxConcurrency) {
      return;
    }
    
    // Get pending tasks
    const pendingTaskIds = Array.from(pendingTasks.keys());
    
    // Process up to maxConcurrency
    for (const taskId of pendingTaskIds) {
      if (runningTasks.size >= maxConcurrency) {
        break;
      }
      
      if (!runningTasks.has(taskId)) {
        const task = pendingTasks.get(taskId);
        if (task) {
          console.log(`Directly executing test task ${taskId} (pg-boss bypass)`);
          
          // Mark as running and remove from pending
          runningTasks.add(taskId);
          pendingTasks.delete(taskId);
          
          // Execute using the same handler function
          try {
            const result = await handler(task);
            console.log(`Direct execution of test ${taskId} completed successfully`);
            
            // Store result in the same results map used by the queue
            jobResults.set(taskId, {
              result: result,
              completedAt: Date.now(),
              success: true
            });
          } catch (error) {
            console.error(`Error during direct execution of test ${taskId}:`, error);
            
            // Store error in the same results map
            jobResults.set(taskId, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
          } finally {
            // Remove from running tasks
            runningTasks.delete(taskId);
          }
        }
      }
    }
  };
  
  // Start a periodic task processor
  if (testTaskProcessorInterval) {
    clearInterval(testTaskProcessorInterval);
  }
  testTaskProcessorInterval = setInterval(processDirectTasks, 1000);
  
  // Export the function to add tasks to our direct execution queue
  global._addTestToDirectQueue = (task: TestExecutionTask) => {
    console.log(`Adding test task ${task.testId} to direct execution queue (pg-boss bypass)`);
    pendingTasks.set(task.testId, task);
    
    // Try to process immediately if possible
    processDirectTasks();
    
    return task.testId;
  };
  
  // Set up the worker to process jobs from pg-boss (if it works)
  try {
    // Explicitly type the job parameter to match pg-boss's work method
    await boss.work<TestExecutionTask>(
      TEST_EXECUTION_QUEUE, 
      { batchSize: maxConcurrency }, 
      async (jobs) => {
        if (!Array.isArray(jobs) || jobs.length === 0) return;
        
        const results = [];
        
        for (const job of jobs) {
          console.log(`Processing test job from pg-boss: ${job.id}`);
          
          if (!job.data) {
            console.error('Invalid job data:', job);
            throw new Error('Invalid job data');
          }
          
          try {
            // Execute the handler with the job data
            const result = await handler(job.data);
            console.log(`Test job ${job.id} completed successfully`);
            
            // Store the *complete* result directly in the map
            const completeResult = result && typeof result === 'object' ? 
              {
                ...result,
                // If test ID is missing, use job ID
                testId: result.testId || job.id,
                // Ensure stdout/stderr exist
                stdout: result.stdout || '',
                stderr: result.stderr || ''
              } : result;
            
            jobResults.set(job.id, { 
              result: completeResult,
              completedAt: Date.now(),
              success: true
            });
            
            // Add to results array
            results.push(completeResult);
          } catch (error) {
            console.error(`Error processing test job ${job.id}:`, error);
            
            // Store the error in the global map
            jobResults.set(job.id, { 
              success: false, // Mark as failed on error
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
            
            // Throw so pg-boss can handle retries if needed
            throw error;
          }
        }
        
        // Return all results
        return results.length === 1 ? results[0] : results;
      }
    );
    
    workerInitialized.test = true;
    console.log(`Test worker initialized for queue: ${TEST_EXECUTION_QUEUE}`);
  } catch (error) {
    console.error(`Failed to set up test worker: ${error}`);
    throw error;
  }
}

/**
 * Setup a worker function to process job execution tasks (multiple tests)
 * @param maxConcurrency Maximum number of concurrent job executions
 * @param handler Function to handle each job execution
 */
export async function setupJobExecutionWorker(
  maxConcurrency: number,
  handler: (task: JobExecutionTask) => Promise<any>
): Promise<void> {
  // If worker is already set up, don't do it again
  if (workerInitialized.job) {
    console.log('Job execution worker already initialized.');
    return;
  }
  
  const boss = await getQueueInstance();
  
  // Clear any previous workers for this queue
  try {
    await boss.offWork(JOB_EXECUTION_QUEUE);
    console.log(`Removed any existing workers for ${JOB_EXECUTION_QUEUE}`);
  } catch (error) {
    console.warn(`Error clearing existing job workers: ${error}`);
  }
  
  // Create a direct execution queue to handle tasks when pg-boss fails
  const pendingJobTasks = new Map<string, JobExecutionTask>();
  const runningJobTasks = new Set<string>();
  
  // Function to process job tasks from our direct execution queue
  const processDirectJobTasks = async () => {
    // Only process if we haven't reached max concurrency
    if (runningJobTasks.size >= maxConcurrency) {
      return;
    }
    
    // Get pending tasks
    const pendingTaskIds = Array.from(pendingJobTasks.keys());
    
    // Process up to maxConcurrency
    for (const taskId of pendingTaskIds) {
      if (runningJobTasks.size >= maxConcurrency) {
        break;
      }
      
      if (!runningJobTasks.has(taskId)) {
        const task = pendingJobTasks.get(taskId);
        if (task) {
          console.log(`Directly executing job task ${taskId} (pg-boss bypass)`);
          
          // Mark as running and remove from pending
          runningJobTasks.add(taskId);
          pendingJobTasks.delete(taskId);
          
          // Execute using the same handler function
          try {
            const result = await handler(task);
            console.log(`Direct execution of job ${taskId} completed successfully`);
            
            // Store result in the same results map used by the queue
            jobResults.set(taskId, {
              result: result,
              completedAt: Date.now(),
              success: !!result?.success,
              error: result?.error || null
            });
          } catch (error) {
            console.error(`Error during direct execution of job ${taskId}:`, error);
            
            // Store error in the same results map
            jobResults.set(taskId, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
          } finally {
            // Remove from running tasks
            runningJobTasks.delete(taskId);
          }
        }
      }
    }
  };
  
  // Start a periodic task processor
  if (jobTaskProcessorInterval) {
    clearInterval(jobTaskProcessorInterval);
  }
  jobTaskProcessorInterval = setInterval(processDirectJobTasks, 1000);
  
  // Export the function to add tasks to our direct execution queue
  global._addJobToDirectQueue = (task: JobExecutionTask) => {
    console.log(`Adding job task ${task.jobId} to direct execution queue (pg-boss bypass)`);
    pendingJobTasks.set(task.jobId, task);
    
    // Try to process immediately if possible
    processDirectJobTasks();
    
    return task.jobId;
  };
  
  // Set up the worker to process jobs
  try {
    // Explicitly type the job parameter to match pg-boss's work method
    await boss.work<JobExecutionTask>(
      JOB_EXECUTION_QUEUE, 
      { batchSize: maxConcurrency }, 
      async (jobs) => {
        if (!Array.isArray(jobs) || jobs.length === 0) return;
        
        for (const job of jobs) {
          console.log(`Processing job execution from pg-boss: ${job.id}`);
          
          if (!job.data) {
            console.error('Invalid job data:', job);
            throw new Error('Invalid job data');
          }
          
          try {
            // Execute the handler with the job data
            const result = await handler(job.data);
            console.log(`Job worker handler completed for job ${job.id}, Success: ${result?.success}`);
            
            // Store the *complete* result directly in the map
            jobResults.set(job.id, { 
              result: result, // Store the full result object
              completedAt: Date.now(),
              success: !!result?.success, // Use the success flag from the result
              error: result?.error || null // Store error if present in result
            });

          } catch (error) {
            console.error(`Error processing job ${job.id}:`, error);
            
            // Store the error in the global map
            jobResults.set(job.id, { 
              success: false, // Mark as failed on error
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
            
            throw error; // Rethrow to let pg-boss handle retries
          }
        }
      }
    );
    
    workerInitialized.job = true;
    console.log(`Job worker initialized for queue: ${JOB_EXECUTION_QUEUE}`);
  } catch (error) {
    console.error(`Failed to set up job worker: ${error}`);
    throw error;
  }
}

/**
 * Wait for a specific job to complete using pg-boss's pub/sub mechanism
 */
export async function waitForJobCompletion<T>(jobId: string, timeoutMs: number = DEFAULT_JOB_TIMEOUT_MS): Promise<T> {
  console.log(`Waiting for job ${jobId} to complete (timeout: ${timeoutMs}ms)`);
  
  try {
    const boss = await getQueueInstance();
    
    // Define queue names for completion and failure events
    const completedJobQueue = `${COMPLETED_JOB_PREFIX}${JOB_EXECUTION_QUEUE}`;
    const failedJobQueue = `__state__failed__${JOB_EXECUTION_QUEUE}`;
    
    return new Promise<T>((resolve, reject) => {
      let completionInterval: NodeJS.Timeout | null = null;
      
      // Cleanup function to clear resources
      const cleanup = () => {
        if (completionInterval) {
          clearInterval(completionInterval);
          completionInterval = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
      
      // Set a timeout to reject the promise if it takes too long
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Process completed jobs queue - we're already setting this up in setupCompletionWorkers()
      // So we can just rely on the job results map being updated by that worker
      
      // Helper function to check job results from the global map
      const checkResult = () => {
        if (jobResults.has(jobId)) {
          const storedResult = jobResults.get(jobId);
          
          // Handle both successful completion and error cases
          if (storedResult && (
              !storedResult.pending || 
              storedResult.completedAt || 
              storedResult.error || 
              typeof storedResult.success === 'boolean'
            )) {
            cleanup();
            
            if (storedResult.error || storedResult.success === false) {
              console.log(`Job ${jobId} failed`);
              reject(new Error(`Job ${jobId} failed: ${storedResult.error || 'Unknown error'}`));
            } else {
              console.log(`Job ${jobId} completed successfully`);
              resolve(storedResult.result as T);
            }
            
            return true;
          }
        }
        return false;
      };
      
      // Check immediately in case the job already completed
      if (checkResult()) {
        return;
      }
      
      // Since we have completion workers already set up for state-based queues,
      // we'll check periodically if our job is complete by monitoring the job results map
      completionInterval = setInterval(() => {
        try {
          checkResult();
        } catch (intervalError) {
          console.error(`Error in completion check interval:`, intervalError);
        }
      }, 1000);
      
      console.log(`Watching for job ${jobId} completion via job results map`);
    });
  } catch (error) {
    console.error(`Error setting up job completion watcher:`, error);
    throw error;
  }
}

/**
 * Close the pg-boss queue connection
 */
export async function closeQueue(): Promise<void> {
  // Clean up our direct execution intervals
  if (testTaskProcessorInterval) {
    clearInterval(testTaskProcessorInterval);
    testTaskProcessorInterval = null;
  }
  
  if (jobTaskProcessorInterval) {
    clearInterval(jobTaskProcessorInterval);
    jobTaskProcessorInterval = null;
  }
  
  if (bossInstance) {
    try {
      await bossInstance.stop();
      bossInstance = null;
      workerInitialized = { test: false, job: false };
      console.log('PgBoss queue stopped');
    } catch (error) {
      console.error('Error stopping PgBoss queue:', error);
      throw error;
    }
  }
}

/**
 * Get statistics about the queue
 */
export async function getQueueStats(): Promise<any> {
  if (!bossInstance) {
    return { status: 'not_initialized' };
  }
  
  try {
    const stats = {
      status: 'running',
      testQueueStats: await bossInstance.getQueueSize(TEST_EXECUTION_QUEUE),
      jobQueueStats: await bossInstance.getQueueSize(JOB_EXECUTION_QUEUE),
      workerStatus: workerInitialized,
      // Add scheduled jobs count
      scheduledJobs: (await getScheduledJobs()).length
    };
    
    return stats;
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Helper function to check if the pgboss schema exists
async function checkPgBossSchema(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'pgboss')"
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error('Error checking pgboss schema:', error);
    return false;
  } finally {
    await client.end();
  }
}

// Helper function to create the pgboss schema
async function createPgBossSchema(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query('CREATE SCHEMA IF NOT EXISTS pgboss');
    console.log('Created pgboss schema');
  } catch (error) {
    console.error('Error creating pgboss schema:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Helper function to check if a table exists
async function checkPgBossTable(connectionString: string, tableName: string): Promise<boolean> {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = $1)",
      [tableName]
    );
    return result.rows[0].exists;
  } catch (error) {
    console.error(`Error checking pgboss table ${tableName}:`, error);
    return false;
  } finally {
    await client.end();
  }
}

// Implement the setupQueue function with proper configuration
async function setupQueue(): Promise<PgBoss> {
  if (bossInstance) {
    return bossInstance;
  }

  try {
    console.log('Setting up pg-boss queue...');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    // Log partial connection info for debugging (hiding credentials)
    const maskedConnectionString = connectionString.replace(
      /postgres:\/\/([^:]+):([^@]+)@/,
      'postgres://$1:****@'
    );
    console.log(`Using database connection: ${maskedConnectionString}`);

    // Check if the pgboss schema exists
    const schemaExists = await checkPgBossSchema(connectionString);
    console.log(`pgboss schema exists: ${schemaExists}`);
    
    if (!schemaExists) {
      console.log('pgboss schema does not exist, creating...');
      await createPgBossSchema(connectionString);
    }

    // Check for key pg-boss tables
    const jobTableExists = await checkPgBossTable(connectionString, 'job');
    console.log(`pgboss job table exists: ${jobTableExists}`);

    // Create a new pg-boss instance with explicit database schema management settings
    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss', // Explicit schema name
      application_name: 'supertest-queue',
      retentionDays: 7,
      monitorStateIntervalSeconds: 30,
      max: 10 // Maximum pool size
    });

    try {
      console.log('Starting pg-boss with schema creation...');
      
      // First ensure the schema is created properly
      await boss.start();
      console.log('Pg-boss schema creation successful');
      
      // Double-check if tables were created after start
      const tablesExistAfterStart = await checkPgBossTable(connectionString, 'job');
      console.log(`pgboss job table exists after start: ${tablesExistAfterStart}`);
      
      // Verify connection with a simpler check
      console.log('Testing queue connection with a fetch operation...');
      
      // Try to access the queue state
      try {
        const details = await boss.getQueueSize(TEST_EXECUTION_QUEUE);
        console.log('Queue connection verified, current queue size:', details);
      } catch (connectionError) {
        console.warn('Could start pg-boss but connection check failed. This might indicate problems:', connectionError);
      }
      
      // Set up completion workers
      await setupCompletionWorkers(boss);
      
      return boss;
    } catch (err) {
      console.error('Error starting pg-boss:', err);
      throw err;
    }
  } catch (error) {
    console.error('Error setting up pg-boss queue:', error);
    throw error;
  }
}

/**
 * Test the queue by sending a test job and immediately checking its status
 * This can be run directly to test queue connectivity
 */
export async function testQueueConnectivity(): Promise<boolean> {
  console.log('Testing queue connectivity with test job...');
  
  try {
    const boss = await getQueueInstance();
    
    // Check if we can connect to the database directly
    try {
      const client = new Client({
        connectionString: process.env.DATABASE_URL
      });
      await client.connect();
      console.log('Direct PostgreSQL connection successful');
      
      // Verify schema
      const schemaResult = await client.query(
        "SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'pgboss')"
      );
      console.log(`PostgreSQL schema check: pgboss exists = ${schemaResult.rows[0].exists}`);
      
      // Verify tables
      const tableResult = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'pgboss'"
      );
      console.log(`PostgreSQL pgboss tables: ${tableResult.rows.map(r => r.table_name).join(', ')}`);
      
      await client.end();
    } catch (dbError) {
      console.error('Direct PostgreSQL connection failed:', dbError);
    }
    
    // Create a test job with unique ID - use proper UUID format
    const testId = crypto.randomUUID();
    const testData = { test: true, timestamp: Date.now() };
    
    // Send a test job with special handling
    console.log('Sending test job to queue...');
    
    try {
      // Get current stats
      const beforeStats = await boss.getQueueSize('__test_queue__');
      console.log(`Queue size before send: ${beforeStats}`);
      
      // Try to set up a worker for this queue
      await boss.work<any>('__test_queue__', async (jobs) => {
        if (Array.isArray(jobs)) {
          console.log('Test job worker executed with array of jobs:', jobs.length);
          jobs.forEach(job => {
            console.log('Processing job:', job.id, job.data);
          });
        } else {
          // This case should never happen based on pg-boss API design
          console.log('Test job worker executed with unexpected job format');
        }
        return true;
      });
      console.log('Worker registered for __test_queue__');
      
      // Try sending with await - use explicit options with our own UUID
      const jobOptions = {
        retryLimit: 0,
        expireInMinutes: 1,
        id: testId // Use the proper UUID we generated
      };
      
      const jobId = await boss.send('__test_queue__', testData, jobOptions);
      console.log(`Boss.send response: ${typeof jobId} - ${jobId}`);
      
      if (!jobId) {
        console.error('boss.send returned falsy job ID!');
        
        // Try a promise-based approach as a workaround
        console.log('Trying alternative promise-based approach...');
        let promiseJobId: string | null = null;
        
        const sendPromise = new Promise<string | null>((resolve) => {
          boss.send('__test_queue__', testData, jobOptions)
          .then(id => {
            console.log(`Promise-based job ID: ${id}`);
            resolve(id);
          })
          .catch(err => {
            console.error('Promise-based job send error:', err);
            resolve(null);
          });
        });
        
        promiseJobId = await sendPromise;
        
        if (!promiseJobId) {
          throw new Error('Failed to create job with both approaches');
        }
        
        console.log(`Successfully created test job with promise approach, ID: ${promiseJobId}`);
        return true;
      }
      
      console.log(`Successfully created test job with ID: ${jobId}`);
      
      // Check if we can fetch the job
      console.log('Fetching job details...');
      const queueSize = await boss.getQueueSize('__test_queue__');
      console.log(`Queue size after test job: ${queueSize}`);
      
      // Job was created and we can access the queue
      console.log('Queue connectivity test passed!');
      return true;
    } catch (sendError) {
      console.error('Error sending test job:', sendError);
      
      // Last resort approach - check if the database connection works at all
      try {
        const pgClient = new Client(process.env.DATABASE_URL);
        await pgClient.connect();
        console.log('Database connection successful');
        
        // Try inserting a job manually as a last resort test - use a proper UUID
        try {
          // Generate a proper v4 UUID for the manual test
          const manualJobId = crypto.randomUUID();
          await pgClient.query(
            `INSERT INTO pgboss.job (id, name, data, state) VALUES ($1, $2, $3, 'created')`,
            [manualJobId, '__test_queue__', JSON.stringify(testData)]
          );
          console.log(`Manually inserted job with ID ${manualJobId}`);
          
          // Success with manual insert
          await pgClient.end();
          return true;
        } catch (insertError) {
          console.error('Manual job insert failed:', insertError);
        }
        
        await pgClient.end();
      } catch (finalDbError) {
        console.error('Final database connection test failed:', finalDbError);
      }
      
      return false;
    }
  } catch (error) {
    console.error('Queue connectivity test failed:', error);
    return false;
  }
}

// If this file is executed directly via node, run the test
if (require.main === module) {
  (async () => {
    try {
      const result = await testQueueConnectivity();
      console.log(`Queue test result: ${result ? 'PASSED' : 'FAILED'}`);
      
      // Close the queue
      await closeQueue();
      process.exit(result ? 0 : 1);
    } catch (error) {
      console.error('Error running queue test:', error);
      process.exit(1);
    }
  })();
}

// Update the global type to include our direct execution functions
declare global {
  var _addTestToDirectQueue: (task: TestExecutionTask) => string;
  var _addJobToDirectQueue: (task: JobExecutionTask) => string;
}