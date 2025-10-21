import { Queue, QueueEvents } from "bullmq";
import Redis, { RedisOptions } from "ioredis";

// Interfaces matching those in the worker service
export interface TestExecutionTask {
  testId: string;
  code: string; // Pass code directly
  variables?: Record<string, string>; // Resolved variables for the test
  secrets?: Record<string, string>; // Resolved secrets for the test
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
  trigger?: "manual" | "remote" | "schedule"; // Trigger type for the job execution
  organizationId: string; // Required for RBAC filtering
  projectId: string; // Required for RBAC filtering
  variables?: Record<string, string>; // Resolved variables for job execution
  secrets?: Record<string, string>; // Resolved secrets for job execution
}

// Health check task interface - REMOVING
// export interface HealthCheckExecutionTask { ... }

// Interface for Monitor Job Data (mirroring DTO in runner)
// Consider moving to a shared types location if used across app/worker extensively
export interface MonitorJobData {
  monitorId: string;
  type: "http_request" | "website" | "ping_host" | "port_check";
  target: string;
  config?: unknown; // Using unknown for config for now, can be refined with shared MonitorConfig type
  frequencyMinutes?: number;
}

// Interface for Monitor Execution Result (mirroring type in runner)
// This is the data that will be sent TO this queue BY the runner
// export interface MonitorResultData { // REMOVING
//   monitorId: string;
//   status: "up" | "down" | "error" | "timeout"; // Corresponds to MonitorResultStatus
//   checkedAt: string; // ISO string date
//   responseTimeMs?: number;
//   details?: any; // Corresponds to MonitorResultDetails, using any for now
//   isUp: boolean;
//   error?: string;
// }

// Constants for queue names and Redis keys
export const TEST_EXECUTION_QUEUE = "test-execution";
export const JOB_EXECUTION_QUEUE = "job-execution";
export const MONITOR_EXECUTION_QUEUE = "monitor-execution";

// Scheduler-related queues
export const JOB_SCHEDULER_QUEUE = "job-scheduler";
export const MONITOR_SCHEDULER_QUEUE = "monitor-scheduler";

// Redis capacity limit keys
export const RUNNING_CAPACITY_LIMIT_KEY = "supercheck:capacity:running";
export const QUEUE_CAPACITY_LIMIT_KEY = "supercheck:capacity:queued";
// export const HEALTH_CHECK_CAPACITY_LIMIT_KEY = 'supercheck:capacity:healthcheck'; // REMOVING

// Redis key TTL values (in seconds) - applies to both job and test execution
export const REDIS_JOB_KEY_TTL = 7 * 24 * 60 * 60; // 7 days for job data (completed/failed jobs)
export const REDIS_EVENT_KEY_TTL = 24 * 60 * 60; // 24 hours for events/stats
export const REDIS_METRICS_TTL = 48 * 60 * 60; // 48 hours for metrics data
export const REDIS_CLEANUP_BATCH_SIZE = 100; // Process keys in smaller batches to reduce memory pressure

// Singleton instances
let redisClient: Redis | null = null;
let testQueue: Queue | null = null;
let jobQueue: Queue | null = null;
let monitorExecution: Queue | null = null;
let jobSchedulerQueue: Queue | null = null;
let monitorSchedulerQueue: Queue | null = null;

let monitorExecutionEvents: QueueEvents | null = null;

// Store initialization promise to prevent race conditions
let initPromise: Promise<void> | null = null;

// Queue event subscription type
export type JobType = "test" | "job"; // Removed 'healthCheck'

/**
 * Get or create Redis connection using environment variables.
 */
export async function getRedisConnection(): Promise<Redis> {
  if (redisClient && redisClient.status === "ready") {
    return redisClient;
  }

  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (e) {
      console.error("Error quitting old Redis client", e);
    }
    redisClient = null;
  }

  // Read directly from process.env
  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379");
  const password = process.env.REDIS_PASSWORD;

  // Connecting to Redis

  const connectionOpts: RedisOptions = {
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Avoid ready check for client connection
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 3000); // Exponential backoff capped at 3s
      console.warn(
        `[Queue Client] Redis connection retry ${times}, delaying ${delay}ms`
      );
      return delay;
    },
  };

  redisClient = new Redis(connectionOpts);

  redisClient.on("error", (err) =>
    console.error("[Queue Client] Redis Error:", err)
  );
  redisClient.on("connect", () => {});
  redisClient.on("ready", async () => {
    // Check Redis memory policy when connection is ready
    try {
      if (redisClient) {
        const info = await redisClient.info("memory");
        const maxmemoryPolicy = info
          .split("\n")
          .find((line) => line.startsWith("maxmemory_policy:"))
          ?.split(":")[1]
          ?.trim();
        console.log(
          `[Queue Client] Redis maxmemory_policy: ${maxmemoryPolicy}`
        );
      }
    } catch (err) {
      console.warn("[Queue Client] Failed to check Redis memory policy:", err);
    }
  });
  redisClient.on("close", () => {});

  // Wait briefly for connection, but don't block indefinitely if Redis is down
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Redis connection timeout")),
        5000
      );
      redisClient?.once("ready", () => {
        clearTimeout(timeout);
        resolve();
      });
      redisClient?.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (err) {
    console.error("[Queue Client] Failed initial Redis connection:", err);
    // Allow proceeding, BullMQ might handle reconnection attempts
  }

  return redisClient;
}

/**
 * Get queue instances, initializing them if necessary.
 */
async function getQueues(): Promise<{
  testQueue: Queue;
  jobQueue: Queue;
  monitorExecutionQueue: Queue;
  jobSchedulerQueue: Queue;
  monitorSchedulerQueue: Queue;
  redisConnection: Redis;
}> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const connection = await getRedisConnection();

        // Memory-optimized job options
        const defaultJobOptions = {
          removeOnComplete: { count: 500, age: 24 * 3600 }, // Keep completed jobs for 24 hours (500 max)
          removeOnFail: { count: 1000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (1000 max)
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        };

        // Health check job options (different from regular jobs) - REMOVING
        // const healthCheckJobOptions = { ... };

        // Queue settings with Redis TTL and auto-cleanup options
        const queueSettings = {
          connection,
          defaultJobOptions,
          // Settings to prevent orphaned Redis keys
          stalledInterval: 30000, // Check for stalled jobs every 30 seconds
          metrics: {
            maxDataPoints: 60, // Limit metrics storage to 60 data points (1 hour at 1 min interval)
            collectDurations: true,
          },
        };

        // Health check queue settings - REMOVING
        // const healthCheckQueueSettings = { ... };

        testQueue = new Queue(TEST_EXECUTION_QUEUE, queueSettings);
        jobQueue = new Queue(JOB_EXECUTION_QUEUE, queueSettings);
        monitorExecution = new Queue(MONITOR_EXECUTION_QUEUE, queueSettings);

        // Schedulers
        jobSchedulerQueue = new Queue(JOB_SCHEDULER_QUEUE, queueSettings);
        monitorSchedulerQueue = new Queue(
          MONITOR_SCHEDULER_QUEUE,
          queueSettings
        );

        monitorExecutionEvents = new QueueEvents(MONITOR_EXECUTION_QUEUE, {
          connection: connection,
        });

        testQueue.on("error", (error) =>
          console.error(`[Queue Client] Test Queue Error:`, error)
        );
        jobQueue.on("error", (error) =>
          console.error(`[Queue Client] Job Queue Error:`, error)
        );
        monitorExecution.on("error", (error) =>
          console.error(`[Queue Client] Monitor Execution Queue Error:`, error)
        );
        jobSchedulerQueue.on("error", (error) =>
          console.error(`[Queue Client] Job Scheduler Queue Error:`, error)
        );
        monitorSchedulerQueue.on("error", (error) =>
          console.error(`[Queue Client] Monitor Scheduler Queue Error:`, error)
        );
        monitorExecutionEvents.on("error", (error) =>
          console.error(
            `[Queue Client] Monitor Execution Queue Events Error:`,
            error
          )
        );

        // Set up periodic cleanup for orphaned Redis keys
        await setupQueueCleanup(connection);

        // BullMQ Queues initialized
      } catch (error) {
        console.error("[Queue Client] Failed to initialize queues:", error);
        // Reset promise to allow retrying later
        initPromise = null;
        throw error; // Re-throw to indicate failure
      }
    })();
  }
  await initPromise;

  if (
    !testQueue ||
    !jobQueue ||
    !monitorExecution ||
    !monitorExecutionEvents ||
    !jobSchedulerQueue ||
    !monitorSchedulerQueue ||
    !redisClient
  ) {
    throw new Error(
      "One or more queues or event listeners could not be initialized."
    );
  }
  return {
    testQueue,
    jobQueue,
    monitorExecutionQueue: monitorExecution,
    jobSchedulerQueue,
    monitorSchedulerQueue,
    redisConnection: redisClient,
  };
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
        console.error(
          "[Queue Client] Error during scheduled queue cleanup:",
          error
        );
      }
    }, 12 * 60 * 60 * 1000); // Run cleanup every 12 hours

    // Make sure interval is properly cleared on process exit
    process.on("exit", () => clearInterval(cleanupInterval));
  } catch (error) {
    console.error("[Queue Client] Failed to set up queue cleanup:", error);
  }
}

/**
 * Performs the actual queue cleanup operations
 * Extracted to a separate function for reuse in initial and scheduled cleanup
 */
async function performQueueCleanup(connection: Redis): Promise<void> {
  // Running queue cleanup
  const queuesToClean = [
    { name: TEST_EXECUTION_QUEUE, queue: testQueue },
    { name: JOB_EXECUTION_QUEUE, queue: jobQueue },
    { name: MONITOR_EXECUTION_QUEUE, queue: monitorExecution },
    { name: JOB_SCHEDULER_QUEUE, queue: jobSchedulerQueue },
    { name: MONITOR_SCHEDULER_QUEUE, queue: monitorSchedulerQueue },
  ];

  for (const { name, queue } of queuesToClean) {
    if (queue) {
      // Cleaning up queue
      await cleanupOrphanedKeys(connection, name); // Cleans up BullMQ internal keys

      // Clean completed and failed jobs older than REDIS_JOB_KEY_TTL from the queue itself
      await queue.clean(
        REDIS_JOB_KEY_TTL * 1000,
        REDIS_CLEANUP_BATCH_SIZE,
        "completed"
      );
      await queue.clean(
        REDIS_JOB_KEY_TTL * 1000,
        REDIS_CLEANUP_BATCH_SIZE,
        "failed"
      );

      // Trim events to prevent Redis memory issues
      await queue.trimEvents(1000); // Keep last 1000 events
      // Finished cleaning queue
    }
  }
  // Finished queue cleanup
}

/**
 * Cleans up orphaned keys for a specific queue in batches to reduce memory pressure
 */
async function cleanupOrphanedKeys(
  connection: Redis,
  queueName: string
): Promise<void> {
  try {
    // Get keys in batches using scan instead of keys command
    let cursor = "0";
    do {
      const [nextCursor, keys] = await connection.scan(
        cursor,
        "MATCH",
        `bull:${queueName}:*`,
        "COUNT",
        "100"
      );

      cursor = nextCursor;

      // Process this batch of keys
      for (const key of keys) {
        // Skip keys that BullMQ manages properly (active jobs, waiting jobs, etc.)
        if (
          key.includes(":active") ||
          key.includes(":wait") ||
          key.includes(":delayed") ||
          key.includes(":failed") ||
          key.includes(":completed") ||
          key.includes(":schedulers")
        ) {
          // Preserve job scheduler keys
          continue;
        }

        // Check if the key has a TTL set
        const ttl = await connection.ttl(key);
        if (ttl === -1) {
          // -1 means no TTL is set
          // Set appropriate TTL based on key type
          let expiryTime = REDIS_JOB_KEY_TTL;

          if (key.includes(":events:")) {
            expiryTime = REDIS_EVENT_KEY_TTL;
          } else if (key.includes(":metrics")) {
            expiryTime = REDIS_METRICS_TTL;
          } else if (key.includes(":meta") || key.includes(":scheduler:")) {
            continue; // Skip meta keys and scheduler keys as they should live as long as the app runs
          }

          await connection.expire(key, expiryTime);
          // Set TTL for key
        }
      }
    } while (cursor !== "0");
  } catch (error) {
    console.error(
      `[Queue Client] Error cleaning up orphaned keys for ${queueName}:`,
      error
    );
  }
}

/**
 * Add a test execution task to the queue.
 * Note: Test executions skip parallel execution queue capacity checks (similar to monitors)
 */
export async function addTestToQueue(task: TestExecutionTask): Promise<string> {
  const { testQueue } = await getQueues();
  const jobUuid = task.testId; // Use testId as the job ID for easier tracking
  // Adding test to queue

  try {
    // Skip capacity check for test executions (similar to monitor executions)
    // Only job executions will use the parallel execution queue

    const jobOptions = {
      jobId: jobUuid,
      // Timeout option would be: timeout: timeoutMs
      // But timeout/duration is managed by worker instead
    };
    await testQueue.add(TEST_EXECUTION_QUEUE, task, jobOptions);
    // Test added successfully
    return jobUuid;
  } catch (error) {
    console.error(
      `[Queue Client] Error adding test ${jobUuid} to queue:`,
      error
    );
    throw new Error(
      `Failed to add test execution job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Add a job execution task (multiple tests) to the queue.
 */
export async function addJobToQueue(task: JobExecutionTask): Promise<string> {
  const { jobQueue } = await getQueues();
  const runId = task.runId; // Use runId for consistency with scheduled jobs
  // Adding job to queue

  try {
    // Check the current queue size against QUEUED_CAPACITY
    await verifyQueueCapacityOrThrow();

    // Setting timeout

    const jobOptions = {
      jobId: runId, // Use runId as BullMQ job ID for consistency
      attempts: 3,
      backoff: {
        type: "exponential" as const,
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    };

    // Use runId as the job name (first parameter) to match scheduled jobs
    await jobQueue.add(runId, task, jobOptions);
    // Job added successfully
    return runId;
  } catch (error) {
    console.error(`[Queue Client] Error adding job ${runId} to queue:`, error);
    throw new Error(
      `Failed to add job execution job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Verify that we haven't exceeded QUEUED_CAPACITY before adding a new job
 * Throws an error if the queue capacity is exceeded
 */
export async function verifyQueueCapacityOrThrow(): Promise<void> {
  // Import the queue stats
  const { fetchQueueStats } = await import("@/lib/queue-stats");

  try {
    // Get real queue stats from Redis
    const stats = await fetchQueueStats();

    // Checking capacity

    // First check: If running < RUNNING_CAPACITY, we can add more jobs immediately
    if (stats.running < stats.runningCapacity) {
      // There are available running slots, no need to check queue capacity
      return;
    }

    // Second check: If running at capacity, verify queued capacity is not exceeded
    if (stats.running >= stats.runningCapacity) {
      // Running is at or over capacity, need to check queue capacity
      if (stats.queued >= stats.queuedCapacity) {
        throw new Error(
          `Queue capacity limit reached (${stats.queued}/${stats.queuedCapacity} queued jobs). Please try again later when running capacity (${stats.running}/${stats.runningCapacity}) is available.`
        );
      }
    }

    // All good - we haven't hit capacity limits
    return;
  } catch (error) {
    // Rethrow capacity errors
    if (error instanceof Error && error.message.includes("capacity limit")) {
      console.error(`[Queue Client] Capacity limit error: ${error.message}`);
      throw error;
    }

    // For connection errors, log but still enforce a basic check
    console.error(
      "Error checking queue capacity:",
      error instanceof Error ? error.message : String(error)
    );

    // Fail closed on errors - be conservative when we can't verify capacity
    throw new Error(
      `Unable to verify queue capacity due to an error. Please try again later.`
    );
  }
}

/**
 * Close queue connections (useful for graceful shutdown).
 */
export async function closeQueue(): Promise<void> {
  const promises = [];
  if (testQueue) promises.push(testQueue.close());
  if (jobQueue) promises.push(jobQueue.close());
  if (monitorExecution) promises.push(monitorExecution.close());
  if (jobSchedulerQueue) promises.push(jobSchedulerQueue.close());
  if (monitorSchedulerQueue) promises.push(monitorSchedulerQueue.close());
  if (redisClient) promises.push(redisClient.quit());

  if (monitorExecutionEvents) promises.push(monitorExecutionEvents.close());

  try {
    await Promise.all(promises);
    // All queues closed
  } catch (error) {
    console.error("[Queue Client] Error closing queues and events:", error);
  } finally {
    testQueue = null;
    jobQueue = null;
    monitorExecution = null;
    jobSchedulerQueue = null;
    monitorSchedulerQueue = null;
    redisClient = null;
    initPromise = null;
    monitorExecutionEvents = null;
  }
}

/**
 * Set capacity limit for running tests through Redis
 */
export async function setRunCapacityLimit(limit: number): Promise<void> {
  const sharedRedis = await getRedisConnection();
  const redis = sharedRedis.duplicate();

  try {
    await redis.set(RUNNING_CAPACITY_LIMIT_KEY, String(limit));
  } finally {
    await redis.quit();
  }
}

/**
 * Set capacity limit for queued tests through Redis
 */
export async function setQueueCapacityLimit(limit: number): Promise<void> {
  const sharedRedis = await getRedisConnection();
  const redis = sharedRedis.duplicate();

  try {
    await redis.set(QUEUE_CAPACITY_LIMIT_KEY, String(limit));
  } finally {
    await redis.quit();
  }
}

/**
 * Add a monitor execution task to the MONITOR_EXECUTION_QUEUE.
 */
export async function addMonitorExecutionJobToQueue(
  task: MonitorJobData
): Promise<string> {
  // Adding monitor execution job

  try {
    const { monitorExecutionQueue } = await getQueues();
    const job = await monitorExecutionQueue.add(
      "executeMonitorJob", // Use the correct job name that the processor expects
      task,
      {
        jobId: task.monitorId, // Use monitorId as job ID to prevent duplicates if job already in queue
        removeOnComplete: true, // Auto-remove successful monitor jobs
        removeOnFail: { count: 10 }, // Keep last 10 failed jobs for debugging
        priority: 1, // Higher priority for immediate execution
      }
    );
    // Monitor execution job added
    return job.id!;
  } catch (error) {
    console.error(
      `[Queue Client] Error adding monitor execution job for monitor ${task.monitorId}:`,
      error
    );
    throw new Error(
      `Failed to add monitor execution job: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export { getQueues };
