import { Redis } from "ioredis";
import { JOB_EXECUTION_QUEUE } from "@/lib/queue";

// Default capacity limits - enforced at both API and worker level
export const RUNNING_CAPACITY = parseInt(process.env.RUNNING_CAPACITY || "5");

/**
 * Maximum number of jobs that can be queued.
 * This is a hard limit enforced at the API layer - new submissions will be rejected
 * with a 429 (Too Many Requests) status code once this limit is reached.
 */
export const QUEUED_CAPACITY = parseInt(process.env.QUEUED_CAPACITY || "50");

export interface QueueStats {
  running: number;
  runningCapacity: number;
  queued: number;
  queuedCapacity: number;
}

/**
 * Check if a job should be processed based on current queue stats
 * This ensures workers only process jobs that are within the running capacity
 * Returns true only if we're below running capacity, false if we're at/above capacity
 */
export async function shouldProcessJob(): Promise<boolean> {
  const stats = await fetchQueueStats();
  return stats.running < stats.runningCapacity;
}

/**
 * Fetch real queue statistics from Redis using BullMQ key patterns
 */
export async function fetchQueueStats(): Promise<QueueStats> {
  // Set up Redis connection
  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379");
  const password = process.env.REDIS_PASSWORD;

  const redisClient = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
  });

  try {
    // Initialize counters
    let runningCount = 0;
    let queuedCount = 0;

    // Step 1: Count only ACTIVE jobs (NOT tests - tests bypass parallel execution queue)
    const activeJobs = await redisClient.llen(
      `bull:${JOB_EXECUTION_QUEUE}:active`
    );

    // Active jobs are definitely running
    runningCount = activeJobs;

    // Step 2: Check specific jobs (only) that are being processed
    const jobKeys = await redisClient.keys(`bull:${JOB_EXECUTION_QUEUE}:*`);

    // Process job keys to find in-progress executions
    const processKeys = async (keys: string[], queueName: string) => {
      const processingIds = new Set<string>();

      for (const key of keys) {
        // Get job ID from key
        const match = key.match(new RegExp(`bull:${queueName}:(\\d+)`));
        if (match && match[1]) {
          const jobId = match[1];

          try {
            // Check if job is being processed but not yet completed
            const [processedOn, finishedOn] = await Promise.all([
              redisClient.hget(`bull:${queueName}:${jobId}`, "processedOn"),
              redisClient.hget(`bull:${queueName}:${jobId}`, "finishedOn"),
            ]);

            if (processedOn && !finishedOn) {
              processingIds.add(jobId);
            }
          } catch {
            // Ignore errors for individual jobs
          }
        }
      }

      return processingIds.size;
    };

    // Count in-process jobs only (tests are excluded from parallel execution queue)
    const processingJobs = await processKeys(jobKeys, JOB_EXECUTION_QUEUE);

    // Add processing jobs to running count
    runningCount = Math.max(runningCount, processingJobs);

    // Step 3: Count only WAITING jobs (tests bypass parallel execution queue)
    const waitingJobs = await redisClient.llen(
      `bull:${JOB_EXECUTION_QUEUE}:wait`
    );

    // Get delayed jobs (scheduled for future)
    const delayedJobs = await redisClient.zcard(
      `bull:${JOB_EXECUTION_QUEUE}:delayed`
    );

    // Calculate total waiting jobs (only job executions, not tests)
    const totalWaiting = waitingJobs + delayedJobs;

    // Step 4: Properly handle running and queued counts
    // First determine how many jobs we can still run before hitting capacity
    const availableRunningSlots = Math.max(0, RUNNING_CAPACITY - runningCount);

    // Check if we've reached RUNNING_CAPACITY
    if (availableRunningSlots > 0) {
      // Running capacity not reached yet - all jobs count as "running" until we hit capacity
      // Any jobs that fit within running capacity are not counted as queued
      const immediatelyRunnable = Math.min(availableRunningSlots, totalWaiting);
      runningCount += immediatelyRunnable;
      // Only count truly queued jobs (those that exceed running capacity)
      queuedCount = Math.max(0, totalWaiting - immediatelyRunnable);
    } else {
      // Running capacity is full - all waiting jobs count as queued
      queuedCount = totalWaiting;
    }

    // Enforce limits - running cannot exceed capacity
    runningCount = Math.min(runningCount, RUNNING_CAPACITY);

    return {
      running: runningCount,
      runningCapacity: RUNNING_CAPACITY,
      queued: queuedCount,
      queuedCapacity: QUEUED_CAPACITY,
    };
  } catch (error) {
    console.error(
      "Error fetching queue stats:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  } finally {
    // Always close Redis connection
    await redisClient.quit().catch(() => {
      // Silently ignore Redis quit errors
    });
  }
}

/**
 * Generate mock queue statistics for development or when Redis is unavailable
 */
export function generateMockQueueStats(): QueueStats {
  // Generate semi-realistic mock data
  const timestamp = Date.now();

  // Make running jobs fluctuate over time but with realistic distribution
  const timeOfDay = Math.floor((timestamp % 86400000) / 3600000); // 0-23 based on hour of day

  // More threads during business hours (8-18), fewer at night
  let loadFactor = 0.3;
  if (timeOfDay >= 8 && timeOfDay <= 18) {
    loadFactor = 0.6 + Math.sin(((timeOfDay - 8) / 10) * Math.PI) * 0.3; // Peak at ~1pm
  }

  // Calculate running threads based on load factor
  const runningBase = Math.floor(RUNNING_CAPACITY * loadFactor);
  const runningNoise = Math.floor(Math.random() * 10) - 5; // -5 to +5 noise
  const running = Math.min(
    RUNNING_CAPACITY,
    Math.max(1, runningBase + runningNoise)
  ); // Ensure at least 1

  // Only show queued if we're at capacity
  let queued = 0;
  if (running >= RUNNING_CAPACITY * 0.95) {
    // Near capacity, some queuing
    const queuedBase = Math.floor(Math.random() * 20); // 0-20 range for queued
    queued = queuedBase;
  }

  return {
    running,
    runningCapacity: RUNNING_CAPACITY,
    queued,
    queuedCapacity: QUEUED_CAPACITY,
  };
}

/**
 * Get queue statistics with fallback to zeros
 */
export async function getQueueStats(): Promise<QueueStats> {
  try {
    return await fetchQueueStats();
  } catch (error) {
    console.error(
      "Error fetching real queue stats:",
      error instanceof Error ? error.message : String(error)
    );
    // Return zeros rather than mock data
    return {
      running: 0,
      runningCapacity: RUNNING_CAPACITY,
      queued: 0,
      queuedCapacity: QUEUED_CAPACITY,
    };
  }
}
