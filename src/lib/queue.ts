import PgBoss from 'pg-boss';
import { Job, JobWithMetadata } from 'pg-boss';

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

// Store job results for tracking completion
const jobResults = new Map<string, any>();

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

// Default timeout for jobs (15 minutes)
export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Get the pg-boss queue instance (singleton pattern)
 */
export async function getQueueInstance(): Promise<PgBoss> {
  if (!bossInstance) {
    try {
      const connectionString = process.env.DATABASE_URL || 
        `postgres://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || "postgres"}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "supertest"}`;
      
      console.log('Initializing pg-boss queue...');
      
      // Create a new boss instance with options
      bossInstance = new PgBoss({
        connectionString,
        // Additional configuration options
        retentionDays: 7,
        monitorStateIntervalSeconds: 30,
        // Set an application name for easier database query identification
        application_name: 'supertest-queue'
      });

      // Actively listen for errors
      bossInstance.on('error', error => {
        console.error('PgBoss error:', error);
        // Attempt to reconnect if connection issues
        if (error.message?.includes('connection') && bossInstance) {
          console.log('Attempting to restart PgBoss after connection error...');
          bossInstance.stop().catch(e => console.error('Error stopping PgBoss:', e));
          bossInstance = null;
          // Try to reconnect after a delay
          setTimeout(() => {
            getQueueInstance().catch(e => console.error('Failed to reconnect to PgBoss:', e));
          }, 5000);
        }
      });

      // Start the queue
      await bossInstance.start();
      console.log('PgBoss queue started successfully');

      // Setup the completion worker for all jobs
      setupCompletionWorkers().catch(err => console.error('Failed to setup completion workers:', err));
    } catch (error) {
      console.error('Failed to initialize pg-boss:', error);
      throw error;
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
  
  // Use the testId as the job ID for correlation
  const jobOptions = {
    retryLimit: 2,
    expireInMinutes: expiryMinutes,
    id: task.testId
  };
  
  // Send a job to the queue
  const jobId = await boss.send(TEST_EXECUTION_QUEUE, task, jobOptions);
  
  if (!jobId) {
    throw new Error('Failed to create test execution job');
  }
  
  // Return the job ID (same as test ID)
  return jobId;
}

/**
 * Add a job execution task (multiple tests) to the queue
 */
export async function addJobToQueue(task: JobExecutionTask, expiryMinutes: number = 30): Promise<string> {
  const boss = await getQueueInstance();
  
  console.log(`Adding job to queue ${JOB_EXECUTION_QUEUE}:`, {
    jobId: task.jobId,
    testCount: task.testScripts.length
  });
  
  // Use the jobId as the job ID for correlation
  const jobOptions = {
    retryLimit: 1, // Jobs are more complex, limited retries
    expireInMinutes: expiryMinutes,
    id: task.jobId
  };
  
  // Send a job to the queue
  const jobId = await boss.send(JOB_EXECUTION_QUEUE, task, jobOptions);
  
  if (!jobId) {
    throw new Error('Failed to create job execution job');
  }
  
  // Return the job ID (same as provided job ID)
  return jobId;
}

/**
 * Setup workers for job completion queues
 */
async function setupCompletionWorkers(): Promise<void> {
  const boss = await getQueueInstance();
  
  // Jobs can be completed successfully or failed with error
  const completedQueues = [
    `${COMPLETED_JOB_PREFIX}${TEST_EXECUTION_QUEUE}`,
    `${COMPLETED_JOB_PREFIX}${JOB_EXECUTION_QUEUE}`
  ];
  
  // Setup workers for each completion queue
  for (const queueName of completedQueues) {
    await boss.work(queueName, { batchSize: 20 }, async (jobs) => {
      if (!Array.isArray(jobs) || jobs.length === 0) return;
      
      for (const job of jobs) {
        // Store the result with the original job ID
        // In completed jobs, the data structure includes the original request
        // in a request property with id that matches the original job ID
        if (job.data && typeof job.data === 'object') {
          // Access request property safely with type assertion
          const originalJobId = (job.data as any).request?.id;
          
          if (originalJobId) {
            console.log(`Job ${originalJobId} completed, storing result`);
            jobResults.set(originalJobId, job.data);
          }
        }
      }
      
      return true;
    });
    
    console.log(`Completion worker set up for queue: ${queueName}`);
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
  
  // Set up the worker to process jobs
  try {
    // Explicitly type the job parameter to match pg-boss's work method
    await boss.work<TestExecutionTask>(
      TEST_EXECUTION_QUEUE, 
      { batchSize: maxConcurrency }, 
      async (jobs) => {
        if (!Array.isArray(jobs) || jobs.length === 0) return;
        
        for (const job of jobs) {
          console.log(`Processing test job: ${job.id}`);
          
          if (!job.data) {
            console.error('Invalid job data:', job);
            throw new Error('Invalid job data');
          }
          
          try {
            // Execute the handler with the job data
            const result = await handler(job.data);
            console.log(`Test job ${job.id} completed successfully`);
            
            // Store the result in case waitForJobCompletion is called before completion job is processed
            jobResults.set(job.id, { result });
            
            return result;
          } catch (error) {
            console.error(`Error processing test job ${job.id}:`, error);
            
            // Store the error in case waitForJobCompletion is called before completion job is processed
            jobResults.set(job.id, { error: error instanceof Error ? error.message : String(error) });
            
            throw error; // Rethrow to let pg-boss handle retries
          }
        }
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
    console.log('Job execution worker already initialized, skipping setup');
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
  
  // Set up the worker to process jobs
  try {
    // Explicitly type the job parameter to match pg-boss's work method
    await boss.work<JobExecutionTask>(
      JOB_EXECUTION_QUEUE, 
      { batchSize: maxConcurrency }, 
      async (jobs) => {
        if (!Array.isArray(jobs) || jobs.length === 0) return;
        
        for (const job of jobs) {
          console.log(`Processing job execution: ${job.id}`);
          
          if (!job.data) {
            console.error('Invalid job data:', job);
            throw new Error('Invalid job data');
          }
          
          try {
            // Execute the handler with the job data
            const result = await handler(job.data);
            console.log(`Job execution ${job.id} completed successfully`);
            
            // Store the result in case waitForJobCompletion is called before completion job is processed
            jobResults.set(job.id, { result });
            
            return result;
          } catch (error) {
            console.error(`Error processing job execution ${job.id}:`, error);
            
            // Store the error in case waitForJobCompletion is called before completion job is processed
            jobResults.set(job.id, { error: error instanceof Error ? error.message : String(error) });
            
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
 * Wait for a specific job to complete using a polling mechanism
 * This function uses pg-boss's job state to check for completion status
 */
export async function waitForJobCompletion<T>(jobId: string, timeoutMs: number = DEFAULT_JOB_TIMEOUT_MS): Promise<T> {
  console.log(`Waiting for job ${jobId} to complete (timeout: ${timeoutMs}ms)`);
  
  const boss = await getQueueInstance();
  
  return new Promise<T>((resolve, reject) => {
    const startTime = Date.now();
    let pollAttempts = 0;
    
    // Set a timeout to reject the promise if it takes too long
    const timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // This creates a polling interval to check for job completion
    const checkInterval = setInterval(async () => {
      pollAttempts++;
      
      try {
        // First, check our in-memory results
        if (jobResults.has(jobId)) {
          const result = jobResults.get(jobId);
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          
          // If the result contains an error, reject
          if (result.error) {
            reject(new Error(`Job ${jobId} failed: ${result.error}`));
            return;
          }
          
          console.log(`Job ${jobId} completed (result from in-memory store)`);
          resolve(result.result || result as unknown as T);
          return;
        }
        
        // Next, check the job state
        try {
          // Use getJobById to get job details - need queue name and job ID
          // First determine which queue this job belongs to based on the job ID format
          // TEST_EXECUTION_QUEUE uses testId as job ID
          // JOB_EXECUTION_QUEUE uses jobId as job ID
          const queueName = jobId.startsWith('test-') ? TEST_EXECUTION_QUEUE : JOB_EXECUTION_QUEUE;
          const job = await boss.getJobById(queueName, jobId);
          
          if (job) {
            // Check the state of the job
            if (job.state === 'completed') {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              
              console.log(`Job ${jobId} completed`);
              // The result is in the data or output property
              resolve((job.output || job.data) as unknown as T);
              return;
            } else if (job.state === 'failed') {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              
              console.error(`Job ${jobId} failed`);
              reject(new Error(`Job ${jobId} failed: ${JSON.stringify(job.output || 'Unknown error')}`));
              return;
            }
            // If job is still in 'created' or 'active' state, continue polling
            console.log(`Job ${jobId} is in state: ${job.state}, continuing to wait...`);
          } else {
            console.log(`Job ${jobId} not found, might be completed or archived. Still waiting...`);
          }
        } catch (error) {
          console.warn(`Error checking job state for ${jobId}:`, error);
          // Continue polling on error
        }
        
        // Log a warning if the job has been running for a long time
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs * 0.8 && pollAttempts % 5 === 0) {
          console.warn(`Job ${jobId} has been running for ${elapsed}ms (80% of timeout)`);
        }
      } catch (error) {
        console.error(`Error in poll check for ${jobId}:`, error);
      }
    }, 2000); // Check every 2 seconds
  });
}

/**
 * Close the pg-boss queue connection
 */
export async function closeQueue(): Promise<void> {
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
      workerStatus: workerInitialized
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