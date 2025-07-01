import { Job } from 'bullmq';
import { db } from "@/utils/db"; // Your DB instance
import { monitors as monitorSchemaDb } from "@/db/schema/schema"; // Monitor schema from your app
import { eq, isNotNull, and } from "drizzle-orm";
import { getQueues, MonitorJobData, MONITOR_SCHEDULER_QUEUE, HEARTBEAT_CHECKER_QUEUE } from "./queue";
import { HeartbeatService } from "./heartbeat-service";

// --- Constants ---
const MONITOR_SCHEDULER_JOB_PREFIX = "scheduled-monitor-";
const HEARTBEAT_CHECKER_JOB_NAME = "check-missed-heartbeats";

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

  const { monitorSchedulerQueue } = await getQueues();
  const jobName = `${MONITOR_SCHEDULER_JOB_PREFIX}${options.monitorId}`;
  const intervalMs = options.frequencyMinutes * 60 * 1000;

  console.log(`[Monitor Scheduler] Scheduling monitor ${options.monitorId} to run every ${options.frequencyMinutes} minutes (${intervalMs}ms). Job name: ${jobName}`);

  // Remove any existing schedule first to prevent duplicates
  await removeScheduledMonitorCheck(options.monitorId);

  // Schedule the repeatable job
  await monitorSchedulerQueue.add(jobName, options.jobData, {
    repeat: {
      every: intervalMs,
    },
    jobId: jobName, // Explicitly set BullMQ job ID to our unique name
    removeOnComplete: true, // The trigger job itself can be removed once it fires & dispatches
    removeOnFail: 100,
  });
  
  console.log(`[Monitor Scheduler] Monitor ${options.monitorId} scheduled successfully with ${options.frequencyMinutes}min interval.`);
  return options.monitorId;
}

export async function removeScheduledMonitorCheck(monitorId: string): Promise<boolean> {
  try {
    const { monitorSchedulerQueue } = await getQueues();
    const jobName = `${MONITOR_SCHEDULER_JOB_PREFIX}${monitorId}`;
    
    console.log(`[Monitor Scheduler] Attempting to remove scheduled check for monitor ${monitorId} (Job name: ${jobName})`);
    
    const repeatableJobs = await monitorSchedulerQueue.getRepeatableJobs();
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
            const removed = await monitorSchedulerQueue.removeRepeatableByKey(job.key);
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

  let scheduledCount = 0;
  let failedCount = 0;

  try {
    const activeMonitors = await db
      .select()
      .from(monitorSchemaDb)
      .where(and(
        isNotNull(monitorSchemaDb.frequencyMinutes), 
        eq(monitorSchemaDb.enabled, true)
      )); // Schedule all enabled monitors regardless of current status

    console.log(`[Monitor Scheduler] Found ${activeMonitors.length} active monitors with frequency to schedule.`);

    for (const monitor of activeMonitors) {
      if (monitor.frequencyMinutes && monitor.frequencyMinutes > 0) {
        try {
          // Skip heartbeat monitors - they are handled by the separate heartbeat checker
          if (monitor.type === 'heartbeat') {
            console.log(`[Monitor Scheduler] Skipping heartbeat monitor ${monitor.id} - handled by heartbeat checker`);
            continue;
          }

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
    console.error("[Monitor Scheduler] Failed to initialize monitor schedulers:", error);
    return { success: false, scheduled: 0, failed: 0 };
  }
}

// --- Heartbeat Checker Functions ---

export async function initializeHeartbeatChecker(): Promise<void> {
  console.log("[Heartbeat Checker] Initializing heartbeat checker...");
  
  const { heartbeatCheckerQueue } = await getQueues();

  // Schedule heartbeat checker to run every 5 minutes (more scalable and efficient)
  // This interval balances responsiveness with system load
  const checkInterval = 5 * 60 * 1000; // 5 minutes
  await heartbeatCheckerQueue.add(HEARTBEAT_CHECKER_JOB_NAME, { checkIntervalMinutes: 5 }, {
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
  console.log("[Monitor Scheduler] Cleanup complete.");
}