import { Queue, ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { QueueStats } from './queue-stats';

// Interfaces matching those in the worker service
export interface TestExecutionTask {
  testId: string;
  code: string; // Pass code directly
}

export interface JobExecutionTask {
  jobId: string;
  testScripts: Array<{
    id: string;
    script: string;
    name?: string;
  }>;
  runId: string; // Optional run ID to distinguish parallel executions of the same job
  originalJobId?: string; // The original job ID from the 'jobs' table
}

// Queue names must match the worker service
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';

// Singleton instances
let redisClient: Redis | null = null;
let testQueue: Queue | null = null;
let jobQueue: Queue | null = null;

// Store initialization promise to prevent race conditions
let initPromise: Promise<void> | null = null;

// Queue event subscription type
export type JobType = 'test' | 'job';

/**
 * Get or create Redis connection using environment variables.
 */
export async function getRedisConnection(): Promise<Redis> {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  if (redisClient) {
    try { await redisClient.quit(); } catch (e) { console.error('Error quitting old Redis client', e); }
    redisClient = null;
  }

  // Read directly from process.env
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;

  console.log(`[Queue Client] Connecting to Redis at ${host}:${port}`);
  
  const connectionOpts: any = {
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Avoid ready check for client connection
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 3000); // Exponential backoff capped at 3s
      console.warn(`[Queue Client] Redis connection retry ${times}, delaying ${delay}ms`);
      return delay;
    }
  };

  redisClient = new Redis(connectionOpts);

  redisClient.on('error', (err) => console.error('[Queue Client] Redis Error:', err));
  redisClient.on('connect', () => console.log('[Queue Client] Redis Connected'));
  redisClient.on('ready', () => console.log('[Queue Client] Redis Ready'));
  redisClient.on('close', () => console.log('[Queue Client] Redis Closed'));

  // Wait briefly for connection, but don't block indefinitely if Redis is down
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
      redisClient?.once('ready', () => { clearTimeout(timeout); resolve(); });
      redisClient?.once('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  } catch (err) {
    console.error('[Queue Client] Failed initial Redis connection:', err);
    // Allow proceeding, BullMQ might handle reconnection attempts
  }

  return redisClient;
}

/**
 * Get queue instances, initializing them if necessary.
 */
async function getQueues(): Promise<{ testQueue: Queue, jobQueue: Queue }> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const connection = await getRedisConnection();
        const defaultJobOptions = {
          removeOnComplete: { count: 1000, age: 24 * 3600 }, // Keep completed jobs for 24 hours (1000 max)
          removeOnFail: { count: 5000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (5000 max)
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        };

        testQueue = new Queue(TEST_EXECUTION_QUEUE, { connection, defaultJobOptions });
        jobQueue = new Queue(JOB_EXECUTION_QUEUE, { connection, defaultJobOptions });

        testQueue.on('error', (error) => console.error(`[Queue Client] Test Queue Error:`, error));
        jobQueue.on('error', (error) => console.error(`[Queue Client] Job Queue Error:`, error));

        console.log('[Queue Client] BullMQ Queues initialized');
      } catch (error) {
        console.error('[Queue Client] Failed to initialize queues:', error);
        // Reset promise to allow retrying later
        initPromise = null;
        throw error; // Re-throw to indicate failure
      }
    })();
  }
  await initPromise;

  if (!testQueue || !jobQueue) {
    throw new Error('Queue initialization failed or did not complete.');
  }
  return { testQueue, jobQueue };
}

/**
 * Add a test execution task to the queue.
 */
export async function addTestToQueue(task: TestExecutionTask, expiryMinutes: number = 15): Promise<string> {
  const { testQueue } = await getQueues();
  const jobUuid = task.testId; // Use testId as the job ID for easier tracking
  console.log(`[Queue Client] Adding test ${jobUuid} to queue ${TEST_EXECUTION_QUEUE}`);

  try {
    // Check the current queue size against QUEUED_CAPACITY
    await verifyQueueCapacityOrThrow();
    
    const jobOptions = {
      jobId: jobUuid,
      // timeout: expiryMinutes * 60 * 1000, // Timeout/duration managed by worker
    };
    await testQueue.add(TEST_EXECUTION_QUEUE, task, jobOptions);
    console.log(`[Queue Client] Test ${jobUuid} added successfully.`);
    return jobUuid;
  } catch (error) {
    console.error(`[Queue Client] Error adding test ${jobUuid} to queue:`, error);
    throw new Error(`Failed to add test execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add a job execution task (multiple tests) to the queue.
 */
export async function addJobToQueue(task: JobExecutionTask, expiryMinutes: number = 30): Promise<string> {
  const { jobQueue } = await getQueues();
  const jobUuid = task.jobId; // Use jobId for tracking
  console.log(`[Queue Client] Adding job ${jobUuid} (${task.testScripts.length} tests) to queue ${JOB_EXECUTION_QUEUE}`);
  
  try {
    // Check the current queue size against QUEUED_CAPACITY
    await verifyQueueCapacityOrThrow();
    
    const jobOptions = {
      jobId: jobUuid,
      // timeout: expiryMinutes * 60 * 1000, // Timeout/duration managed by worker
    };
    await jobQueue.add(JOB_EXECUTION_QUEUE, task, jobOptions);
    console.log(`[Queue Client] Job ${jobUuid} added successfully.`);
    return jobUuid;
  } catch (error) {
    console.error(`[Queue Client] Error adding job ${jobUuid} to queue:`, error);
    throw new Error(`Failed to add job execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verify that we haven't exceeded QUEUED_CAPACITY before adding a new job
 * Throws an error if the queue capacity is exceeded
 */
export async function verifyQueueCapacityOrThrow(): Promise<void> {
  // Import the queue stats
  const { fetchQueueStats, QUEUED_CAPACITY } = await import('@/lib/queue-stats');
  
  try {
    // Get real queue stats from Redis
    const stats = await fetchQueueStats();
    
    // Check if adding one more job would exceed the queued capacity
    if (stats.running >= stats.runningCapacity && stats.queued >= stats.queuedCapacity) {
      throw new Error(`Queue capacity limit reached (${stats.queued}/${stats.queuedCapacity} queued jobs). Please try again later.`);
    }
    
    // All good - we haven't hit capacity limits
    return;
  } catch (error) {
    // Rethrow capacity errors
    if (error instanceof Error && error.message.includes('capacity limit')) {
      throw error;
    }
    
    // For connection errors, log but allow the job (fail open)
    console.error('Error checking queue capacity:', error instanceof Error ? error.message : String(error));
    return;
  }
}

/**
 * Close queue connections (useful for graceful shutdown).
 */
export async function closeQueue(): Promise<void> {
  console.log('[Queue Client] Closing queue connections...');
  await initPromise; // Ensure initialization finished before closing
  
  const promises = [];
  if (testQueue) promises.push(testQueue.close());
  if (jobQueue) promises.push(jobQueue.close());
  if (redisClient) promises.push(redisClient.quit());
  
  await Promise.all(promises).catch(err => console.error('[Queue Client] Error during queue closing:', err));
  
  testQueue = null;
  jobQueue = null;
  redisClient = null;
  initPromise = null;
  console.log('[Queue Client] Queue connections closed.');
}