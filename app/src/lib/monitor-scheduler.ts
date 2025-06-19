import { Queue, Worker, Job } from 'bullmq';
import { db } from "@/lib/db"; // Your DB instance
import { monitors as monitorSchemaDb } from "@/db/schema/schema"; // Monitor schema from your app
import { eq, isNotNull, and } from "drizzle-orm";
import { getRedisConnection } from "./queue";
import { MONITOR_EXECUTION_QUEUE, MonitorJobData, addMonitorExecutionJobToQueue } from "./queue";

// --- Constants ---
export const MONITOR_SCHEDULER_QUEUE = "monitor-scheduler";
const MONITOR_SCHEDULER_JOB_PREFIX = "scheduled-monitor-";

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
    // Optionally, remove any existing schedule if frequency is set to 0 or less
    await removeScheduledMonitorCheck(options.monitorId);
    return options.monitorId;
  }

  const schedulerQueue = await getMonitorSchedulerQueue();
  const jobName = `${MONITOR_SCHEDULER_JOB_PREFIX}${options.monitorId}`;
  const intervalMs = options.frequencyMinutes * 60 * 1000;

  console.log(`[Monitor Scheduler] Scheduling monitor ${options.monitorId} to run every ${options.frequencyMinutes} minutes (${intervalMs}ms). Job name: ${jobName}`);

  // Schedule the repeatable job without immediate execution
  await schedulerQueue.add(jobName, options.jobData, {
    repeat: {
      every: intervalMs,
    },
    jobId: jobName, // Explicitly set BullMQ job ID to our unique name
    removeOnComplete: true, // The trigger job itself can be removed once it fires & dispatches
    removeOnFail: 100,
  });
  
  await ensureMonitorSchedulerWorker();
  console.log(`[Monitor Scheduler] Monitor ${options.monitorId} scheduled with immediate execution and ${options.frequencyMinutes}min interval.`);
  return options.monitorId;
}

export async function removeScheduledMonitorCheck(monitorId: string): Promise<boolean> {
  try {
    const schedulerQueue = await getMonitorSchedulerQueue();
    const jobName = `${MONITOR_SCHEDULER_JOB_PREFIX}${monitorId}`;
    
    // BullMQ's getRepeatableJobs returns jobs with a 'key' property.
    // The key for a job added with a specific jobId and repeat pattern is usually `jobName::${jobId}:::${every|pattern}`
    // However, removing by jobName and repeat pattern directly is safer.
    // Or, more simply, as we use jobName as the jobId for the repeatable job, we can use removeRepeatable.

    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    const jobToRemove = repeatableJobs.find(job => job.id === jobName || job.name === jobName);

    if (jobToRemove) {
        console.log(`[Monitor Scheduler] Removing scheduled check for monitor ${monitorId} (Job key: ${jobToRemove.key})`);
        const removed = await schedulerQueue.removeRepeatableByKey(jobToRemove.key);
        if (removed) {
            console.log(`[Monitor Scheduler] Successfully removed scheduled check for monitor ${monitorId}`);
        } else {
             console.warn(`[Monitor Scheduler] Could not remove scheduled check for monitor ${monitorId} by key ${jobToRemove.key}, though job was found.`);
        }
        return removed;
    } else {
        console.log(`[Monitor Scheduler] No scheduled check found for monitor ${monitorId} with name ${jobName} to remove.`);
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
      .where(and(isNotNull(monitorSchemaDb.frequencyMinutes), eq(monitorSchemaDb.status, 'up'))); // Example: only schedule active, 'up' monitors
      // Or, you might want to schedule 'pending' monitors as well to let them run first time.

    console.log(`[Monitor Scheduler] Found ${activeMonitors.length} active monitors with frequency to schedule.`);

    for (const monitor of activeMonitors) {
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
    console.log(`[Monitor Scheduler] Initialization complete: ${scheduledCount} succeeded, ${failedCount} failed.`);
    return { success: true, scheduled: scheduledCount, failed: failedCount };
  } catch (error) {
    console.error("[Monitor Scheduler] Error during initialization:", error);
    return { success: false, scheduled: 0, failed: 0, error };
  }
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