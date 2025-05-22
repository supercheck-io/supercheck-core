import { Redis } from 'ioredis';
import { TEST_EXECUTION_QUEUE, JOB_EXECUTION_QUEUE, HEALTH_CHECK_QUEUE } from '@/lib/queue';

// Default capacity limits - enforced at both API and worker level
export const RUNNING_CAPACITY = parseInt(process.env.RUNNING_CAPACITY || '5');

/**
 * Maximum number of jobs that can be queued.
 * This is a hard limit enforced at the API layer - new submissions will be rejected
 * with a 429 (Too Many Requests) status code once this limit is reached.
 */
export const QUEUED_CAPACITY = parseInt(process.env.QUEUED_CAPACITY || '50');

/**
 * Maximum number of health checks that can be active at once.
 * This is enforced at the API layer to prevent overloading the system with too many checks.
 */
export const HEALTH_CHECK_CAPACITY = parseInt(process.env.HEALTH_CHECK_CAPACITY || '100');

export interface QueueStats {
  running: number;
  runningCapacity: number;
  queued: number;
  queuedCapacity: number;
}

/**
 * Extended queue stats including health check stats
 */
export interface ExtendedQueueStats extends QueueStats {
  healthChecks: number;
  healthCheckCapacity: number;
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
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
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
    
    // Step 1: Count all ACTIVE jobs and tests (currently executing)
    const [activeJobs, activeTests] = await Promise.all([
      redisClient.llen(`bull:${JOB_EXECUTION_QUEUE}:active`),
      redisClient.llen(`bull:${TEST_EXECUTION_QUEUE}:active`)
    ]);
    
    // Active jobs are definitely running
    runningCount = activeJobs + activeTests;
    
    // Step 2: Check specific jobs that are being processed
    const [jobKeys, testKeys] = await Promise.all([
      redisClient.keys(`bull:${JOB_EXECUTION_QUEUE}:*`),
      redisClient.keys(`bull:${TEST_EXECUTION_QUEUE}:*`)
    ]);
    
    // Process job and test keys to find in-progress executions
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
              redisClient.hget(`bull:${queueName}:${jobId}`, 'processedOn'),
              redisClient.hget(`bull:${queueName}:${jobId}`, 'finishedOn')
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
    
    // Count in-process jobs and tests
    const [processingJobs, processingTests] = await Promise.all([
      processKeys(jobKeys, JOB_EXECUTION_QUEUE),
      processKeys(testKeys, TEST_EXECUTION_QUEUE)
    ]);
    
    // Add processing jobs/tests to running count
    runningCount = Math.max(runningCount, processingJobs + processingTests);
    
    // Step 3: Count all WAITING jobs that should be executed when capacity allows
    const [waitingJobs, waitingTests] = await Promise.all([
      redisClient.llen(`bull:${JOB_EXECUTION_QUEUE}:wait`),
      redisClient.llen(`bull:${TEST_EXECUTION_QUEUE}:wait`)
    ]);
    
    // Get delayed jobs (scheduled for future)
    const [delayedJobs, delayedTests] = await Promise.all([
      redisClient.zcard(`bull:${JOB_EXECUTION_QUEUE}:delayed`),
      redisClient.zcard(`bull:${TEST_EXECUTION_QUEUE}:delayed`)
    ]);
    
    // Calculate total waiting jobs
    const totalWaiting = waitingJobs + waitingTests + delayedJobs + delayedTests;
    
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
    console.error('Error fetching queue stats:', 
      error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    // Always close Redis connection
    await redisClient.quit().catch(() => {
      // Silently ignore Redis quit errors
    });
  }
}

/**
 * Fetch health check statistics from Redis
 */
export async function fetchHealthCheckStats(): Promise<{ healthChecks: number, healthCheckCapacity: number }> {
  // Set up Redis connection
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;
  
  const redisClient = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
  });

  try {
    // Count active, waiting, and delayed health checks
    const [activeHealthChecks, waitingHealthChecks, delayedHealthChecks] = await Promise.all([
      redisClient.llen(`bull:${HEALTH_CHECK_QUEUE}:active`),
      redisClient.llen(`bull:${HEALTH_CHECK_QUEUE}:wait`),
      redisClient.zcard(`bull:${HEALTH_CHECK_QUEUE}:delayed`)
    ]);
    
    // Count health checks waiting to be processed
    const totalHealthChecks = activeHealthChecks + waitingHealthChecks + delayedHealthChecks;
    
    return {
      healthChecks: totalHealthChecks,
      healthCheckCapacity: HEALTH_CHECK_CAPACITY,
    };
  } catch (error) {
    console.error('Error fetching health check stats:', 
      error instanceof Error ? error.message : String(error));
    return {
      healthChecks: 0,
      healthCheckCapacity: HEALTH_CHECK_CAPACITY,
    };
  } finally {
    // Always close Redis connection
    await redisClient.quit().catch(() => {
      // Silently ignore Redis quit errors
    });
  }
}

/**
 * Fetch comprehensive stats including both regular queue and health checks
 */
export async function fetchExtendedQueueStats(): Promise<ExtendedQueueStats> {
  try {
    const [queueStats, healthCheckStats] = await Promise.all([
      fetchQueueStats(),
      fetchHealthCheckStats()
    ]);
    
    return {
      ...queueStats,
      ...healthCheckStats
    };
  } catch (error) {
    console.error('Error fetching extended queue stats:', 
      error instanceof Error ? error.message : String(error));
    
    // Return default/empty stats if there's an error
    return {
      running: 0,
      runningCapacity: RUNNING_CAPACITY,
      queued: 0,
      queuedCapacity: QUEUED_CAPACITY,
      healthChecks: 0,
      healthCheckCapacity: HEALTH_CHECK_CAPACITY
    };
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
    loadFactor = 0.6 + (Math.sin((timeOfDay - 8) / 10 * Math.PI) * 0.3); // Peak at ~1pm
  }
  
  // Calculate running threads based on load factor
  const runningBase = Math.floor(RUNNING_CAPACITY * loadFactor);
  const runningNoise = Math.floor(Math.random() * 10) - 5; // -5 to +5 noise
  const running = Math.min(RUNNING_CAPACITY, Math.max(1, runningBase + runningNoise)); // Ensure at least 1
  
  // Only show queued if we're at capacity
  let queued = 0;
  if (running >= RUNNING_CAPACITY * 0.95) { // Near capacity, some queuing
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
 * Generate mock extended queue statistics including health checks
 */
export function generateMockExtendedQueueStats(): ExtendedQueueStats {
  const baseStats = generateMockQueueStats();
  
  // Generate semi-realistic mock health check data
  const healthChecks = Math.floor(Math.random() * HEALTH_CHECK_CAPACITY * 0.5); // Up to 50% of capacity
  
  return {
    ...baseStats,
    healthChecks,
    healthCheckCapacity: HEALTH_CHECK_CAPACITY
  };
}

/**
 * Get queue statistics with fallback to zeros
 */
export async function getQueueStats(): Promise<QueueStats> {
  try {
    return await fetchQueueStats();
  } catch (error) {
    console.error('Error fetching real queue stats:', 
      error instanceof Error ? error.message : String(error));
    // Return zeros rather than mock data
    return {
      running: 0,
      runningCapacity: RUNNING_CAPACITY,
      queued: 0,
      queuedCapacity: QUEUED_CAPACITY
    };
  }
}

/**
 * Get extended queue statistics with health checks
 */
export async function getExtendedQueueStats(): Promise<ExtendedQueueStats> {
  try {
    return await fetchExtendedQueueStats();
  } catch (error) {
    console.error('Error fetching real extended queue stats:', 
      error instanceof Error ? error.message : String(error));
    // Return zeros rather than mock data
    return {
      running: 0,
      runningCapacity: RUNNING_CAPACITY,
      queued: 0,
      queuedCapacity: QUEUED_CAPACITY,
      healthChecks: 0,
      healthCheckCapacity: HEALTH_CHECK_CAPACITY
    };
  }
} 