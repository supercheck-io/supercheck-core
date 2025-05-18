import { Queue } from 'bullmq';
import Redis, { RedisOptions } from 'ioredis';

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

// Constants for queue names and Redis keys
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';

// Redis capacity limit keys
export const RUNNING_CAPACITY_LIMIT_KEY = 'supercheck:capacity:running';
export const QUEUE_CAPACITY_LIMIT_KEY = 'supercheck:capacity:queued';

// Redis key TTL values (in seconds) - applies to both job and test execution
export const REDIS_JOB_KEY_TTL = 7 * 24 * 60 * 60;  // 7 days for job data (completed/failed jobs)
export const REDIS_EVENT_KEY_TTL = 24 * 60 * 60;    // 24 hours for events/stats
export const REDIS_METRICS_TTL = 48 * 60 * 60;      // 48 hours for metrics data
export const REDIS_CLEANUP_BATCH_SIZE = 100;        // Process keys in smaller batches to reduce memory pressure

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
  
  const connectionOpts: RedisOptions = {
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
        
        // Memory-optimized job options
        const defaultJobOptions = {
          removeOnComplete: { count: 500, age: 24 * 3600 }, // Keep completed jobs for 24 hours (500 max)
          removeOnFail: { count: 1000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (1000 max)
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        };

        // Queue settings with Redis TTL and auto-cleanup options
        const queueSettings = {
          connection,
          defaultJobOptions,
          // Settings to prevent orphaned Redis keys
          stalledInterval: 30000, // Check for stalled jobs every 30 seconds
          metrics: {
            maxDataPoints: 60, // Limit metrics storage to 60 data points (1 hour at 1 min interval)
            collectDurations: true
          }
        };

        testQueue = new Queue(TEST_EXECUTION_QUEUE, queueSettings);
        jobQueue = new Queue(JOB_EXECUTION_QUEUE, queueSettings);

        testQueue.on('error', (error) => console.error(`[Queue Client] Test Queue Error:`, error));
        jobQueue.on('error', (error) => console.error(`[Queue Client] Job Queue Error:`, error));

        // Set up periodic cleanup for orphaned Redis keys
        await setupQueueCleanup(connection);

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
 * Sets up periodic cleanup of orphaned Redis keys to prevent unbounded growth
 */
async function setupQueueCleanup(connection: Redis): Promise<void> {
  try {
    // Run initial cleanup on startup to clear any existing orphaned keys
    await performQueueCleanup(connection);
    
    // Schedule queue cleanup every 12 hours (43200000 ms) - more frequent than before
    const cleanupInterval = setInterval(async () => {
      try {
        await performQueueCleanup(connection);
      } catch (error) {
        console.error('[Queue Client] Error during scheduled queue cleanup:', error);
      }
    }, 12 * 60 * 60 * 1000); // Run cleanup every 12 hours
    
    // Make sure interval is properly cleared on process exit
    process.on('exit', () => clearInterval(cleanupInterval));
  } catch (error) {
    console.error('[Queue Client] Failed to set up queue cleanup:', error);
  }
}

/**
 * Performs the actual queue cleanup operations
 * Extracted to a separate function for reuse in initial and scheduled cleanup
 */
async function performQueueCleanup(connection: Redis): Promise<void> {
  console.log('[Queue Client] Running queue cleanup for Redis keys');
  
  // 1. Clean up completed/failed jobs older than their TTL
  if (testQueue) {
    await testQueue.clean(REDIS_JOB_KEY_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'completed');
    await testQueue.clean(REDIS_JOB_KEY_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'failed');
  }
  
  if (jobQueue) {
    await jobQueue.clean(REDIS_JOB_KEY_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'completed');
    await jobQueue.clean(REDIS_JOB_KEY_TTL * 1000, REDIS_CLEANUP_BATCH_SIZE, 'failed');
  }

  // 2. Trim event streams to reduce memory usage (keep last 1000 events)
  if (testQueue) {
    await testQueue.trimEvents(1000);
  }
  
  if (jobQueue) {
    await jobQueue.trimEvents(1000);
  }
  
  // 3. Process orphaned keys in smaller batches to reduce memory pressure
  await cleanupOrphanedKeys(connection, TEST_EXECUTION_QUEUE);
  await cleanupOrphanedKeys(connection, JOB_EXECUTION_QUEUE);
  
  console.log('[Queue Client] Queue cleanup completed');
}

/**
 * Cleans up orphaned keys for a specific queue in batches to reduce memory pressure
 */
async function cleanupOrphanedKeys(connection: Redis, queueName: string): Promise<void> {
  try {
    // Get keys in batches using scan instead of keys command
    let cursor = '0';
    do {
      const [nextCursor, keys] = await connection.scan(
        cursor, 
        'MATCH', 
        `bull:${queueName}:*`, 
        'COUNT', 
        '100'
      );
      
      cursor = nextCursor;
      
      // Process this batch of keys
      for (const key of keys) {
        // Skip keys that BullMQ manages properly (active jobs, waiting jobs, etc.)
        if (key.includes(':active') || key.includes(':wait') || 
            key.includes(':delayed') || key.includes(':failed') ||
            key.includes(':completed') || key.includes(':schedulers')) { // Preserve job scheduler keys
          continue;
        }
        
        // Check if the key has a TTL set
        const ttl = await connection.ttl(key);
        if (ttl === -1) { // -1 means no TTL is set
          // Set appropriate TTL based on key type
          let expiryTime = REDIS_JOB_KEY_TTL;
          
          if (key.includes(':events:')) {
            expiryTime = REDIS_EVENT_KEY_TTL;
          } else if (key.includes(':metrics')) {
            expiryTime = REDIS_METRICS_TTL;
          } else if (key.includes(':meta') || key.includes(':scheduler:')) {
            continue; // Skip meta keys and scheduler keys as they should live as long as the app runs
          }
          
          await connection.expire(key, expiryTime);
          console.log(`[Queue Client] Set TTL of ${expiryTime}s for key: ${key}`);
        }
      }
    } while (cursor !== '0');
  } catch (error) {
    console.error(`[Queue Client] Error cleaning up orphaned keys for ${queueName}:`, error);
  }
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
    
    const timeoutMs = expiryMinutes * 60 * 1000; // Convert minutes to milliseconds
    console.log(`[Queue Client] Setting timeout of ${timeoutMs}ms (${expiryMinutes} minutes)`);
    
    const jobOptions = {
      jobId: jobUuid,
      // Timeout option would be: timeout: timeoutMs
      // But timeout/duration is managed by worker instead
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
    
    const timeoutMs = expiryMinutes * 60 * 1000; // Convert minutes to milliseconds
    console.log(`[Queue Client] Setting timeout of ${timeoutMs}ms (${expiryMinutes} minutes)`);
    
    const jobOptions = {
      jobId: jobUuid,
      // Timeout option would be: timeout: timeoutMs
      // But timeout/duration is managed by worker instead
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
  const { fetchQueueStats } = await import('@/lib/queue-stats');
  
  try {
    // Get real queue stats from Redis
    const stats = await fetchQueueStats();
    
    console.log(`[Queue Client] Checking capacity - running: ${stats.running}/${stats.runningCapacity}, queued: ${stats.queued}/${stats.queuedCapacity}`);
    
    // First check: If running < RUNNING_CAPACITY, we can add more jobs immediately
    if (stats.running < stats.runningCapacity) {
      // There are available running slots, no need to check queue capacity
      return;
    }
    
    // Second check: If running at capacity, verify queued capacity is not exceeded
    if (stats.running >= stats.runningCapacity) {
      // Running is at or over capacity, need to check queue capacity
      if (stats.queued >= stats.queuedCapacity) {
        throw new Error(`Queue capacity limit reached (${stats.queued}/${stats.queuedCapacity} queued jobs). Please try again later when running capacity (${stats.running}/${stats.runningCapacity}) is available.`);
      }
    }
    
    // All good - we haven't hit capacity limits
    return;
  } catch (error) {
    // Rethrow capacity errors
    if (error instanceof Error && error.message.includes('capacity limit')) {
      console.error(`[Queue Client] Capacity limit error: ${error.message}`);
      throw error;
    }
    
    // For connection errors, log but still enforce a basic check
    console.error('Error checking queue capacity:', error instanceof Error ? error.message : String(error));
    
    // Fail closed on errors - be conservative when we can't verify capacity
    throw new Error(`Unable to verify queue capacity due to an error. Please try again later.`);
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

/**
 * Set capacity limit for running tests through Redis
 */
export async function setRunCapacityLimit(limit: number): Promise<void> {
  const redis = await getRedisConnection();
  try {
    await redis.set(RUNNING_CAPACITY_LIMIT_KEY, String(limit));
    console.log(`Set running capacity limit to ${limit} in Redis`);
  } finally {
    await redis.quit();
  }
}

/**
 * Set capacity limit for queued tests through Redis
 */
export async function setQueueCapacityLimit(limit: number): Promise<void> {
  const redis = await getRedisConnection();
  try {
    await redis.set(QUEUE_CAPACITY_LIMIT_KEY, String(limit));
    console.log(`Set queue capacity limit to ${limit} in Redis`);
  } finally {
    await redis.quit();
  }
}