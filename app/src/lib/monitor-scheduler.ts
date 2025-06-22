import { Queue, Worker, Job } from 'bullmq';
import { db } from "@/lib/db"; // Your DB instance
import { monitors as monitorSchemaDb } from "@/db/schema/schema"; // Monitor schema from your app
import { eq, isNotNull, and } from "drizzle-orm";
import { getRedisConnection } from "./queue";
import { MONITOR_EXECUTION_QUEUE, MonitorJobData, addMonitorExecutionJobToQueue } from "./queue";
import { HeartbeatService } from "./heartbeat-service";

// --- Constants ---
export const MONITOR_SCHEDULER_QUEUE = "monitor-scheduler";
export const HEARTBEAT_CHECKER_QUEUE = "heartbeat-checker";
const MONITOR_SCHEDULER_JOB_PREFIX = "scheduled-monitor-";
const HEARTBEAT_CHECKER_JOB_NAME = "check-missed-heartbeats";

// --- Queue and Worker Management (similar to job-scheduler.ts) ---
const schedulerQueueMap = new Map<string, Queue>();
const schedulerWorkerMap = new Map<string, Worker>();

async function getMonitorSchedulerQueue(): Promise<Queue> {
  if (!schedulerQueueMap.has(MONITOR_SCHEDULER_QUEUE)) {
    const connection = await getRedisConnection();
    const queue = new Queue(MONITOR_SCHEDULER_QUEUE, { 
      connection,
      defaultJobOptions: {
        removeOnComplete: true, // Scheduler jobs are just triggers
        removeOnFail: 100, // Keep a few failed scheduler jobs for inspection
      }
    });
    schedulerQueueMap.set(MONITOR_SCHEDULER_QUEUE, queue);
  }
  return schedulerQueueMap.get(MONITOR_SCHEDULER_QUEUE)!;
}

async function ensureMonitorSchedulerWorker(): Promise<void> {
  if (!schedulerWorkerMap.has(MONITOR_SCHEDULER_QUEUE)) {
    console.log(`[Monitor Scheduler] Creating worker for ${MONITOR_SCHEDULER_QUEUE}`);
    const connection = await getRedisConnection();
    const worker = new Worker(
      MONITOR_SCHEDULER_QUEUE,
      async (job: Job<MonitorJobData, void, string>) => {
        console.log(`[Monitor Scheduler] Triggered monitor: ${job.name} (Monitor ID: ${job.data.monitorId})`);
        // Data from the repeatable job is the MonitorJobData needed for execution
        await addMonitorExecutionJobToQueue(job.data);
      },
      { connection, concurrency: 10 } // Adjust concurrency as needed
    );

    worker.on('completed', (job) => {
      console.log(`[Monitor Scheduler] Scheduler job for monitor ${job.data.monitorId} completed, execution job dispatched.`);
    });
    worker.on('failed', (job, error) => {
      console.error(`[Monitor Scheduler] Scheduler job for monitor ${job?.data?.monitorId} failed:`, error);
    });
    schedulerWorkerMap.set(MONITOR_SCHEDULER_QUEUE, worker);
  }
}

// --- Scheduling Functions ---

interface ScheduleMonitorOptions {
  monitorId: string;
  frequencyMinutes: number;
  jobData: MonitorJobData; // This will be the payload for the EXECUTION queue
}

export async function scheduleMonitorCheck(options: ScheduleMonitorOptions): Promise<string> {
  if (options.frequencyMinutes <= 0) {
    console.warn(`[Monitor Scheduler] Invalid frequencyMinutes (${options.frequencyMinutes}) for monitor ${options.monitorId}. Skipping scheduling.`);
    // Remove any existing schedule if frequency is set to 0 or less
    await removeScheduledMonitorCheck(options.monitorId);
    return options.monitorId;
  }

  const schedulerQueue = await getMonitorSchedulerQueue();
  const jobName = `${MONITOR_SCHEDULER_JOB_PREFIX}${options.monitorId}`;
  const intervalMs = options.frequencyMinutes * 60 * 1000;

  console.log(`[Monitor Scheduler] Scheduling monitor ${options.monitorId} to run every ${options.frequencyMinutes} minutes (${intervalMs}ms). Job name: ${jobName}`);

  // Remove any existing schedule first to prevent duplicates
  await removeScheduledMonitorCheck(options.monitorId);

  // Schedule the repeatable job
  await schedulerQueue.add(jobName, options.jobData, {
    repeat: {
      every: intervalMs,
    },
    jobId: jobName, // Explicitly set BullMQ job ID to our unique name
    removeOnComplete: true, // The trigger job itself can be removed once it fires & dispatches
    removeOnFail: 100,
  });
  
  await ensureMonitorSchedulerWorker();
  console.log(`[Monitor Scheduler] Monitor ${options.monitorId} scheduled successfully with ${options.frequencyMinutes}min interval.`);
  return options.monitorId;
}

export async function removeScheduledMonitorCheck(monitorId: string): Promise<boolean> {
  try {
    const schedulerQueue = await getMonitorSchedulerQueue();
    const jobName = `${MONITOR_SCHEDULER_JOB_PREFIX}${monitorId}`;
    
    console.log(`[Monitor Scheduler] Attempting to remove scheduled check for monitor ${monitorId} (Job name: ${jobName})`);
    
    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    console.log(`[Monitor Scheduler] Found ${repeatableJobs.length} repeatable jobs`);
    
    // Log all repeatable jobs for debugging
    repeatableJobs.forEach(job => {
      console.log(`[Monitor Scheduler] Repeatable job - ID: ${job.id}, Name: ${job.name}, Key: ${job.key}`);
    });
    
    // Find jobs that match our monitor ID (more flexible matching)
    const jobsToRemove = repeatableJobs.filter(job => 
      job.id === jobName || 
      job.name === jobName ||
      job.key.includes(monitorId) ||
      job.key.includes(jobName)
    );

    if (jobsToRemove.length > 0) {
        console.log(`[Monitor Scheduler] Found ${jobsToRemove.length} jobs to remove for monitor ${monitorId}`);
        let removedCount = 0;
        
        for (const job of jobsToRemove) {
            console.log(`[Monitor Scheduler] Removing job with key: ${job.key}`);
            const removed = await schedulerQueue.removeRepeatableByKey(job.key);
            if (removed) {
                removedCount++;
                console.log(`[Monitor Scheduler] Successfully removed job with key: ${job.key}`);
            } else {
                console.warn(`[Monitor Scheduler] Failed to remove job with key: ${job.key}`);
            }
        }
        
        return removedCount > 0;
    } else {
        console.log(`[Monitor Scheduler] No scheduled check found for monitor ${monitorId} to remove.`);
        return false;
    }
  } catch (error) {
    console.error(`[Monitor Scheduler] Failed to remove scheduled check for monitor ${monitorId}:`, error);
    return false;
  }
}

export async function initializeMonitorSchedulers(): Promise<{ success: boolean; scheduled: number; failed: number }> {
  console.log("[Monitor Scheduler] Initializing monitor schedulers...");
  await ensureMonitorSchedulerWorker(); // Ensure worker is ready before scheduling

  let scheduledCount = 0;
  let failedCount = 0;

  try {
    const dbInstance = await db();
    const activeMonitors = await dbInstance
      .select()
      .from(monitorSchemaDb)
      .where(and(
        isNotNull(monitorSchemaDb.frequencyMinutes), 
        eq(monitorSchemaDb.enabled, true)
      )); // Schedule all enabled monitors regardless of current status

    console.log(`[Monitor Scheduler] Found ${activeMonitors.length} active monitors with frequency to schedule.`);

    for (const monitor of activeMonitors) {
      // Skip heartbeat monitors for regular scheduling (they don't need active monitoring)
      if (monitor.type === "heartbeat") {
        console.log(`[Monitor Scheduler] Skipping heartbeat monitor ${monitor.id} - uses passive monitoring`);
        continue;
      }

      if (monitor.frequencyMinutes && monitor.frequencyMinutes > 0) {
        try {
          // Prepare the MonitorJobData payload
          const jobDataPayload: MonitorJobData = {
            monitorId: monitor.id,
            type: monitor.type as MonitorJobData['type'], // Ensure type compatibility
            target: monitor.target,
            config: monitor.config as any, // Cast config, ensure it matches runner's DTO expectations
            frequencyMinutes: monitor.frequencyMinutes,
          };

          await scheduleMonitorCheck({
            monitorId: monitor.id,
            frequencyMinutes: monitor.frequencyMinutes,
            jobData: jobDataPayload,
          });
          scheduledCount++;
        } catch (error) {
          console.error(`[Monitor Scheduler] Failed to schedule monitor ${monitor.id}:`, error);
          failedCount++;
        }
      }
    }

    // Initialize heartbeat checker for passive monitoring
    await initializeHeartbeatChecker();

    console.log(`[Monitor Scheduler] Initialization complete: ${scheduledCount} succeeded, ${failedCount} failed.`);
    return { success: true, scheduled: scheduledCount, failed: failedCount };
  } catch (error) {
    console.error("[Monitor Scheduler] Error during initialization:", error);
    return { success: false, scheduled: 0, failed: 0, error };
  }
}

// --- Heartbeat Checker Functions ---

async function getHeartbeatCheckerQueue(): Promise<Queue> {
  if (!schedulerQueueMap.has(HEARTBEAT_CHECKER_QUEUE)) {
    const connection = await getRedisConnection();
    const queue = new Queue(HEARTBEAT_CHECKER_QUEUE, { 
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
      }
    });
    schedulerQueueMap.set(HEARTBEAT_CHECKER_QUEUE, queue);
  }
  return schedulerQueueMap.get(HEARTBEAT_CHECKER_QUEUE)!;
}

async function ensureHeartbeatCheckerWorker(): Promise<void> {
  if (!schedulerWorkerMap.has(HEARTBEAT_CHECKER_QUEUE)) {
    console.log(`[Heartbeat Checker] Creating worker for ${HEARTBEAT_CHECKER_QUEUE}`);
    const connection = await getRedisConnection();
    const worker = new Worker(
      HEARTBEAT_CHECKER_QUEUE,
      async (job: Job) => {
        console.log(`[Heartbeat Checker] Running heartbeat check: ${job.name}`);
        const checkIntervalMinutes = job.data?.checkIntervalMinutes || 5;
        const result = await HeartbeatService.checkMissedHeartbeats(checkIntervalMinutes);
        console.log(`[Heartbeat Checker] Check completed: ${result.checked} checked, ${result.missedCount} missed, ${result.skipped} skipped, ${result.errors.length} errors`);
        if (result.errors.length > 0) {
          console.error(`[Heartbeat Checker] Errors:`, result.errors);
        }
        return result;
      },
      { connection, concurrency: 1 } // Only one heartbeat checker should run at a time
    );

    worker.on('completed', (job, result) => {
      console.log(`[Heartbeat Checker] Heartbeat check completed: ${result.checked} checked, ${result.missedCount} missed, ${result.skipped} skipped`);
    });
    worker.on('failed', (job, error) => {
      console.error(`[Heartbeat Checker] Heartbeat check failed:`, error);
    });
    schedulerWorkerMap.set(HEARTBEAT_CHECKER_QUEUE, worker);
  }
}

export async function initializeHeartbeatChecker(): Promise<void> {
  console.log("[Heartbeat Checker] Initializing heartbeat checker...");
  
  const heartbeatQueue = await getHeartbeatCheckerQueue();
  await ensureHeartbeatCheckerWorker();

  // Schedule heartbeat checker to run every 5 minutes (more scalable and efficient)
  // This interval balances responsiveness with system load
  const checkInterval = 5 * 60 * 1000; // 5 minutes
  await heartbeatQueue.add(HEARTBEAT_CHECKER_JOB_NAME, { checkIntervalMinutes: 5 }, {
    repeat: {
      every: checkInterval,
    },
    jobId: HEARTBEAT_CHECKER_JOB_NAME,
    removeOnComplete: true,
    removeOnFail: 100,
  });

  console.log("[Heartbeat Checker] Heartbeat checker scheduled to run every 5 minutes");
}

/**
 * Cleanup function to close all monitor scheduler queues and workers.
 */
export async function cleanupMonitorScheduler(): Promise<void> {
  console.log("[Monitor Scheduler] Cleaning up...");
  for (const [name, worker] of schedulerWorkerMap.entries()) {
    console.log(`[Monitor Scheduler] Closing worker: ${name}`);
    await worker.close();
  }
  schedulerWorkerMap.clear();

  for (const [name, queue] of schedulerQueueMap.entries()) {
    console.log(`[Monitor Scheduler] Closing queue: ${name}`);
    await queue.close();
  }
  schedulerQueueMap.clear();
  console.log("[Monitor Scheduler] Cleanup complete.");
} 