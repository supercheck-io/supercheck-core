import { Queue, Worker, Job, ConnectionOptions, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
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
  bullMQJobId?: string; // BullMQ generated job ID for reference
}

// Redis key prefix for job results
const JOB_RESULT_KEY_PREFIX = 'job:result:';
// Default TTL for job results in Redis (4 hours)
const JOB_RESULT_TTL_SECONDS = 4 * 60 * 60;

// Helper functions for storing and retrieving job results from Redis
async function setJobResult(jobId: string, result: StoredJobResult): Promise<void> {
  const redis = await getRedisConnection();
  const key = `${JOB_RESULT_KEY_PREFIX}${jobId}`;
  await redis.set(key, JSON.stringify(result), 'EX', JOB_RESULT_TTL_SECONDS);
}

async function getJobResultFromRedis(jobId: string): Promise<StoredJobResult | null> {
  const redis = await getRedisConnection();
  const key = `${JOB_RESULT_KEY_PREFIX}${jobId}`;
  const data = await redis.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as StoredJobResult;
  } catch (err) {
    console.error(`Error parsing job result for ${jobId}:`, err);
    return null;
  }
}

async function hasJobResult(jobId: string): Promise<boolean> {
  const redis = await getRedisConnection();
  const key = `${JOB_RESULT_KEY_PREFIX}${jobId}`;
  return (await redis.exists(key)) > 0;
}

// We'll need to declare this but defer actual initialization to avoid circular dependencies
let testStatusMapRef: TestStatusUpdateMap | null = null;

// Export the test status map reference for bidirectional updates
export { testStatusMapRef };

// Function to set the status map reference from test-execution.ts
export function setTestStatusMap(statusMap: TestStatusUpdateMap): void {
  testStatusMapRef = statusMap;
}

// Queue names
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';
export const SCHEDULED_JOB_PREFIX = 'scheduled-';

// Default timeout for jobs (15 minutes)
export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

// BullMQ queue instances
let testQueue: Queue | null = null;
let jobQueue: Queue | null = null;
let redisClient: Redis | null = null;
let testQueueEvents: QueueEvents | null = null;
let jobQueueEvents: QueueEvents | null = null;

// Track initialization state
let queueInitialized = false;
let queueInitializing = false;
let queueInitPromise: Promise<void> | null = null;

// Track worker initialization
let workerInitialized = {
  test: false,
  job: false
};

// Create a guard to prevent multiple worker initializations
let workerInitPromise: Promise<void> | null = null;

/**
 * Initialize Redis connection with robust handling
 */
async function getRedisConnection(): Promise<Redis> {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }
  
  // Close existing client if it exists but isn't ready
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (err) {
      console.error('Error closing existing Redis client:', err);
    }
    redisClient = null;
  }
  
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log(`Connecting to Redis at ${REDIS_URL.replace(/redis:\/\/([^:]+):([^@]+)@/, 'redis://$1:****@')}`);
  
  // Create new client with BullMQ-compatible options
  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      console.log(`Redis connection retry attempt ${times} with delay ${delay}ms`);
      return delay;
    }
  });
  
  // Set up event listeners for better monitoring
  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
  });
  
  redisClient.on('connect', () => {
    console.log('Redis client connected');
  });
  
  redisClient.on('ready', () => {
    console.log('Redis client ready');
  });
  
  redisClient.on('close', () => {
    console.log('Redis connection closed');
  });
  
  // Ensure connection is established
  if (redisClient.status !== 'ready') {
    console.log('Waiting for Redis connection to be ready...');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timed out'));
      }, 10000); // 10 second timeout
      
      redisClient!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      redisClient!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
  
  return redisClient;
}

/**
 * Get the BullMQ queue instance (singleton pattern)
 */
export async function getQueueInstances(): Promise<{ testQueue: Queue, jobQueue: Queue }> {
  if (testQueue && jobQueue) {
    return { testQueue, jobQueue };
  }
  
  await setupQueues();
  
  if (!testQueue || !jobQueue) {
    throw new Error('Failed to initialize queues');
  }
  
  return { testQueue, jobQueue };
}

/**
 * Add a test execution task to the queue
 */
export async function addTestToQueue(task: TestExecutionTask, expiryMinutes: number = 15): Promise<string> {
  const { testQueue } = await getQueueInstances();
  console.log(`Adding test to queue ${TEST_EXECUTION_QUEUE}:`, task);
  
  // Generate a unique ID for this job that we control
  const jobUuid = crypto.randomUUID();
  
  try {
    // Try to safely stringify the task for logging
    try {
      const safeTask = JSON.stringify(task);
      console.log(`Task data: ${safeTask}`);
    } catch (err) {
      console.warn(`Could not stringify task for logging:`, err);
    }
    
    // Define job options
    const jobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 1000
      },
      removeOnComplete: false,
      removeOnFail: false,
      jobId: jobUuid,
      // Use duration instead of timeout which is not supported in this version
      duration: expiryMinutes * 60 * 1000,
    };
    
    // Add the job to the queue
    const job = await testQueue.add(TEST_EXECUTION_QUEUE, task, jobOptions);
    console.log(`Successfully added test ${task.testId} to queue, tracking ID: ${job.id}`);
    
    // Store an initial entry in Redis
    if (task.testId) {
      await setJobResult(task.testId, {
        pending: true,
        timestamp: Date.now(),
        bullMQJobId: job.id
      });
    }
    
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
  const { jobQueue } = await getQueueInstances();
  console.log(`Adding job to queue ${JOB_EXECUTION_QUEUE}:`, { jobId: task.jobId, testCount: task.testScripts.length });
  
  // Generate a unique ID for this job
  const jobUuid = crypto.randomUUID();
  
  try {
    // Define job options
    const jobOptions = {
      attempts: 2,
      backoff: {
        type: 'exponential' as const,
        delay: 1000
      },
      removeOnComplete: false,
      removeOnFail: false,
      jobId: jobUuid,
      // Use duration instead of timeout which is not supported in this version
      duration: expiryMinutes * 60 * 1000,
    };
    
    // Add the job to the queue
    const job = await jobQueue.add(JOB_EXECUTION_QUEUE, task, jobOptions);
    console.log(`Successfully added job ${task.jobId} to queue, tracking ID: ${job.id}`);
    
    // Store tracking info in Redis
    if (task.jobId) {
      await setJobResult(task.jobId, {
        pending: true,
        timestamp: Date.now(),
        bullMQJobId: job.id
      });
    }
    
    return task.jobId;
  } catch (error) {
    console.error(`Error adding job ${task.jobId} to queue:`, error);
    throw new Error(`Failed to create job execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Schedule a recurring job using cron expression
 */
export async function scheduleJob(options: ScheduledJobOptions): Promise<string> {
  const { testQueue, jobQueue } = await getQueueInstances();
  
  const { name, cron, timezone, data, queue, retryLimit = 1, expireInMinutes = 30 } = options;
  
  // Determine which queue to use
  const targetQueue = queue === TEST_EXECUTION_QUEUE ? testQueue : jobQueue;
  
  // Generate a unique name for the schedule
  const scheduleName = `${SCHEDULED_JOB_PREFIX}${name}-${Date.now()}`;
  
  console.log(`Scheduling job ${scheduleName} with cron: ${cron}${timezone ? `, timezone: ${timezone}` : ''}`);
  
  try {
    // Create the job data
    const jobData = {
      ...data,
      _scheduled: true,
      _scheduleName: scheduleName
    };
    
    // Create job options with the repeat option
    const repeatOptions: any = {
      pattern: cron,
    };
    
    // Add timezone if provided
    if (timezone) {
      repeatOptions.tz = timezone;
    }
    
    // Add a repeatable job
    await targetQueue.add(
      queue,
      jobData,
      {
        jobId: `${scheduleName}-${crypto.randomUUID()}`,
        repeat: repeatOptions,
        attempts: retryLimit + 1,
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
  const { testQueue, jobQueue } = await getQueueInstances();
  
  try {
    // Get repeatable jobs from both queues
    const testRepeatableJobs = await testQueue.getRepeatableJobs();
    const jobRepeatableJobs = await jobQueue.getRepeatableJobs();
    
    // Filter for our scheduled job prefix
    const allJobs = [...testRepeatableJobs, ...jobRepeatableJobs]
      .filter(job => job.name && job.name.startsWith(SCHEDULED_JOB_PREFIX));
    
    return allJobs;
  } catch (error) {
    console.error('Error getting scheduled jobs:', error);
    return [];
  }
}

/**
 * Delete a scheduled job
 */
export async function deleteScheduledJob(scheduleName: string): Promise<boolean> {
  const { testQueue, jobQueue } = await getQueueInstances();
  
  try {
    console.log(`Deleting scheduled job: ${scheduleName}`);
    
    // Try both queues since we don't know which one has the job
    let removed = false;
    
    // Get all repeatable jobs from both queues
    const testRepeatableJobs = await testQueue.getRepeatableJobs();
    const jobRepeatableJobs = await jobQueue.getRepeatableJobs();
    
    // Find the job with the given name
    const allJobs = [...testRepeatableJobs, ...jobRepeatableJobs];
    
    // Use a non-null assertion to handle the potentially undefined scheduleName
    const job = allJobs.find(j => j.name && j.name.includes(scheduleName));
    
    if (job) {
      // Remove the repeatable job using its key
      if (job.key) {
        // Determine which queue the job belongs to
        const queue = testRepeatableJobs.includes(job) ? testQueue : jobQueue;
        await queue.removeRepeatableByKey(job.key);
        removed = true;
        console.log(`Successfully removed scheduled job: ${scheduleName}`);
      }
    }
    
    return removed;
  } catch (error) {
    console.error(`Error deleting scheduled job ${scheduleName}:`, error);
    return false;
  }
}

/**
 * Setup a worker function to process test execution tasks
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
  
  const { testQueue } = await getQueueInstances();
  
  try {
    // Create a worker for the test execution queue
    const worker = new Worker(
      TEST_EXECUTION_QUEUE,
      async (job) => {
        console.log(`Processing test job from BullMQ: ${job.id}`);
        
        if (!job.data) {
          console.error('Invalid job data:', job);
          throw new Error('Invalid job data');
        }
        
        try {
          // Execute the handler with the job data
          const result = await handler(job.data as TestExecutionTask);
          console.log(`Test job ${job.id} completed successfully`);
          
          // Store the result in Redis
          if (job.id) {
            await setJobResult(job.id, {
              result,
              completedAt: Date.now(),
              success: true
            });
          }
          
          // Store the result using testId from the task
          const testData = job.data as any;
          if (testData && typeof testData.testId === 'string') {
            await setJobResult(testData.testId, {
              result,
              completedAt: Date.now(),
              success: true
            });
            console.log(`Stored duplicate result mapping for testId: ${testData.testId}`);
          }
          
          return result;
        } catch (error) {
          console.error(`Error processing test job ${job.id}:`, error);
          
          // Store the error in Redis
          if (job.id) {
            await setJobResult(job.id, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
          }
          
          // Store the error using testId if available
          const testErrorData = job.data as any;
          if (testErrorData && typeof testErrorData.testId === 'string') {
            await setJobResult(testErrorData.testId, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
          }
          
          throw error;
        }
      },
      {
        connection: await getRedisConnection(),
        concurrency: maxConcurrency,
        removeOnComplete: {
          count: 50, // Keep last 50 completed jobs
          age: 4 * 60 * 60 // Keep jobs for 4 hours
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs
          age: 4 * 60 * 60 // Keep jobs for 4 hours
        }
      }
    );
    
    // Listen for worker events for better debugging
    worker.on('completed', (job) => {
      console.log(`Test job ${job.id} completed`);
    });
    
    worker.on('failed', (job, err) => {
      if (job) {
        console.error(`Test job ${job.id} failed:`, err);
      } else {
        console.error('Test job failed (no job reference):', err);
      }
    });
    
    worker.on('error', (err) => {
      console.error('Test worker error:', err);
    });
    
    workerInitialized.test = true;
    console.log(`Test worker initialized for queue: ${TEST_EXECUTION_QUEUE}`);
  } catch (error) {
    console.error(`Failed to set up test worker:`, error);
    throw error;
  }
}

/**
 * Setup a worker function to process job execution tasks (multiple tests)
 */
export async function setupJobExecutionWorker(
  maxConcurrency: number,
  handler: (task: JobExecutionTask) => Promise<any>
): Promise<void> {
  // If worker is already set up, don't do it again
  if (workerInitialized.job) {
    console.log('Job execution worker already initialized');
    return;
  }
  
  const { jobQueue } = await getQueueInstances();
  
  try {
    // Create a worker for the job execution queue
    const worker = new Worker(
      JOB_EXECUTION_QUEUE,
      async (job) => {
        console.log(`Processing job execution from BullMQ: ${job.id}`);
        
        if (!job.data) {
          console.error('Invalid job data:', job);
          throw new Error('Invalid job data');
        }
        
        try {
          // Execute the handler with the job data
          const result = await handler(job.data as JobExecutionTask);
          console.log(`Job worker handler completed for job ${job.id}, Success: ${result?.success}`);
          
          // Store the result in Redis
          if (job.id) {
            await setJobResult(job.id, {
              result,
              completedAt: Date.now(),
              success: !!result?.success,
              error: result?.error || null
            });
          }
          
          // Store using jobId from the task if different
          const jobData = job.data as any;
          if (jobData && typeof jobData.jobId === 'string') {
            await setJobResult(jobData.jobId, {
              result,
              completedAt: Date.now(),
              success: !!result?.success,
              error: result?.error || null
            });
            console.log(`Stored duplicate result mapping for jobId: ${jobData.jobId}`);
          }
          
          return result;
        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error);
          
          // Store the error in Redis
          if (job.id) {
            await setJobResult(job.id, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
          }
          
          // Store the error using jobId if available
          const jobErrorData = job.data as any;
          if (jobErrorData && typeof jobErrorData.jobId === 'string') {
            await setJobResult(jobErrorData.jobId, {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
          }
          
          throw error;
        }
      },
      {
        connection: await getRedisConnection(),
        concurrency: maxConcurrency,
        removeOnComplete: {
          count: 50, // Keep last 50 completed jobs
          age: 4 * 60 * 60 // Keep jobs for 4 hours
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs
          age: 4 * 60 * 60 // Keep jobs for 4 hours
        }
      }
    );
    
    // Listen for worker events
    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed`);
    });
    
    worker.on('failed', (job, err) => {
      if (job) {
        console.error(`Job ${job.id} failed:`, err);
      } else {
        console.error('Job failed (no job reference):', err);
      }
    });
    
    worker.on('error', (err) => {
      console.error('Job worker error:', err);
    });
    
    workerInitialized.job = true;
    console.log(`Job worker initialized for queue: ${JOB_EXECUTION_QUEUE}`);
  } catch (error) {
    console.error(`Failed to set up job worker:`, error);
    throw error;
  }
}

/**
 * Wait for a specific job to complete
 */
export async function waitForJobCompletion<T>(jobId: string, timeoutMs: number = DEFAULT_JOB_TIMEOUT_MS): Promise<T> {
  console.log(`Waiting for job ${jobId} to complete (timeout: ${timeoutMs}ms)`);
  
  return new Promise<T>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;
    let checkInterval: NodeJS.Timeout | null = null;
    
    // Cleanup function
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
    };
    
    // Set a timeout to reject the promise if it takes too long
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Helper function to check job results from Redis
    const checkResult = async () => {
      // First check by jobId directly
      const storedResult = await getJobResultFromRedis(jobId);
      
      if (storedResult) {
        // Check if the job is complete
        if (
          !storedResult.pending ||
          storedResult.completedAt ||
          storedResult.error ||
          typeof storedResult.success === 'boolean'
        ) {
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
    checkResult().catch(err => {
      console.error(`Error checking job result:`, err);
    });
    
    // Check periodically for job completion
    checkInterval = setInterval(() => {
      checkResult().catch(err => {
        console.error(`Error in completion check interval:`, err);
      });
    }, 1000);
    
    console.log(`Watching for job ${jobId} completion via Redis`);
  });
}

/**
 * Initialize the BullMQ queues
 */
async function setupQueues(): Promise<void> {
  if (queueInitialized) {
    return;
  }
  
  if (queueInitializing) {
    console.log("Queue initialization already in progress, waiting...");
    return queueInitPromise!;
  }
  
  queueInitializing = true;
  console.log("Initializing BullMQ queues...");
  
  queueInitPromise = (async () => {
    try {
      // Create Redis connection
      const connection = await getRedisConnection();
      
      // Common queue options
      const queueOptions = {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential' as const,
            delay: 1000
          },
          removeOnComplete: false,
          removeOnFail: false
        }
      };
      
      // Create queue events for monitoring
      testQueueEvents = new QueueEvents(TEST_EXECUTION_QUEUE, { connection });
      jobQueueEvents = new QueueEvents(JOB_EXECUTION_QUEUE, { connection });
      
      // Create queues
      testQueue = new Queue(TEST_EXECUTION_QUEUE, queueOptions);
      jobQueue = new Queue(JOB_EXECUTION_QUEUE, queueOptions);
      
      console.log('BullMQ queues initialized successfully');
      queueInitialized = true;
    } catch (error) {
      console.error('Failed to initialize BullMQ queues:', error);
      queueInitialized = false;
      queueInitializing = false;
      queueInitPromise = null;
      throw error;
    } finally {
      queueInitializing = false;
    }
  })();
  
  return queueInitPromise;
}

/**
 * Close BullMQ queues and connections
 */
export async function closeQueue(): Promise<void> {
  try {
    if (testQueue) {
      await testQueue.close();
      testQueue = null;
    }
    
    if (jobQueue) {
      await jobQueue.close();
      jobQueue = null;
    }
    
    if (testQueueEvents) {
      await testQueueEvents.close();
      testQueueEvents = null;
    }
    
    if (jobQueueEvents) {
      await jobQueueEvents.close();
      jobQueueEvents = null;
    }
    
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
    }
    
    workerInitialized = { test: false, job: false };
    queueInitialized = false;
    console.log('BullMQ queues and connections closed');
  } catch (error) {
    console.error('Error closing BullMQ queues:', error);
    throw error;
  }
}

/**
 * Get statistics about the queue
 */
export async function getQueueStats(): Promise<any> {
  if (!testQueue || !jobQueue) {
    return { status: 'not_initialized' };
  }
  
  try {
    const stats = {
      status: 'running',
      testQueueStats: await testQueue.getJobCounts(),
      jobQueueStats: await jobQueue.getJobCounts(),
      workerStatus: workerInitialized,
      // Get scheduled jobs count
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

/**
 * Test the queue by sending a test job and checking its status
 */
export async function testQueueConnectivity(): Promise<boolean> {
  console.log('Testing queue connectivity with test job...');
  
  try {
    const { testQueue } = await getQueueInstances();
    
    // Create a test job with unique ID
    const testId = crypto.randomUUID();
    const testData = { test: true, timestamp: Date.now() };
    
    // Define job options - using appropriate options for BullMQ
    const jobOptions = {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
      jobId: testId
    };
    
    // Create a QueueEvents instance for testing
    const queueEvents = new QueueEvents('__test_queue__', { connection: await getRedisConnection() });
    
    // Wait for events to be ready
    await new Promise<void>((resolve) => {
      queueEvents.once('waiting', () => resolve());
      setTimeout(() => resolve(), 1000); // Timeout fallback
    });
    
    // Create a worker for the test queue
    const worker = new Worker(
      '__test_queue__',
      async (testJob) => {
        console.log('Test job worker executed:', testJob.id, testJob.data);
        return { processed: true, data: testJob.data };
      },
      { connection: await getRedisConnection() }
    );
    
    // Send the test job
    console.log('Sending test job to queue...');
    const job = await testQueue.add('__test_queue__', testData, jobOptions);
    console.log(`Test job added with ID: ${job.id}`);
    
    // Set up a promise to be resolved when the job completes
    const completionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test job timeout'));
      }, 10000);
      
      queueEvents.on('completed', ({ jobId }) => {
        if (jobId === job.id) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      queueEvents.on('failed', ({ jobId }) => {
        if (jobId === job.id) {
          clearTimeout(timeout);
          reject(new Error('Test job failed'));
        }
      });
    });
    
    // Wait for the job to complete
    await completionPromise;
    console.log('Test job completed successfully');
    
    // Clean up
    await worker.close();
    await queueEvents.close();
    
    console.log('Queue connectivity test passed!');
    return true;
  } catch (error) {
    console.error('Queue connectivity test failed:', error);
    return false;
  }
}

/**
 * Get a job result directly from Redis
 */
export async function getJobResult(jobId: string): Promise<StoredJobResult | null> {
  return await getJobResultFromRedis(jobId);
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