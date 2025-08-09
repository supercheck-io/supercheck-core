import { db } from "@/utils/db";
import { monitors as monitorSchemaDb, MonitorConfig } from "@/db/schema/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { getQueues, MonitorJobData } from "./queue";

interface ScheduleMonitorOptions {
  monitorId: string;
  frequencyMinutes: number;
  jobData: MonitorJobData;
  retryLimit?: number;
}

/**
 * Creates or updates a monitor scheduler using BullMQ
 */
export async function scheduleMonitor(options: ScheduleMonitorOptions): Promise<string> {
  try {
    console.log(`Setting up scheduled monitor "${options.monitorId}" with frequency ${options.frequencyMinutes} minutes`);

    const { monitorSchedulerQueue } = await getQueues();
    const schedulerJobName = `scheduled-monitor-${options.monitorId}`;

    // Clean up any existing repeatable jobs for this monitor ID
    const repeatableJobs = await monitorSchedulerQueue.getRepeatableJobs();
    const existingJob = repeatableJobs.find(job => 
      job.id === options.monitorId || 
      job.key.includes(options.monitorId) || 
      job.name === schedulerJobName
    );
    
    if (existingJob) {
      console.log(`Removing existing repeatable job: ${existingJob.key}`);
      await monitorSchedulerQueue.removeRepeatableByKey(existingJob.key);
    }

    // Create a repeatable job that follows the frequency schedule
    await monitorSchedulerQueue.add(
      schedulerJobName,
      {
        monitorId: options.monitorId,
        jobData: options.jobData,
        frequencyMinutes: options.frequencyMinutes,
        retryLimit: options.retryLimit || 3,
      },
      {
        repeat: {
          every: options.frequencyMinutes * 60 * 1000, // Convert to milliseconds
        },
        removeOnComplete: true,
        removeOnFail: 100,
        jobId: schedulerJobName,
      }
    );

    console.log(`Created monitor scheduler ${options.monitorId} with frequency ${options.frequencyMinutes} minutes`);
    return options.monitorId;
  } catch (error) {
    console.error(`Failed to schedule monitor:`, error);
    throw error;
  }
}

/**
 * Deletes a monitor scheduler
 */
export async function deleteScheduledMonitor(schedulerId: string): Promise<boolean> {
  try {
    console.log(`Removing monitor scheduler ${schedulerId}`);
    
    const { monitorSchedulerQueue } = await getQueues();
    const repeatableJobs = await monitorSchedulerQueue.getRepeatableJobs();
    const schedulerJobName = `scheduled-monitor-${schedulerId}`;

    const jobsToRemove = repeatableJobs.filter(job => 
      job.id === schedulerId || 
      job.key.includes(schedulerId) ||
      job.name === schedulerJobName ||
      job.key.includes(schedulerJobName)
    );
    
    if (jobsToRemove.length > 0) {
      const removePromises = jobsToRemove.map(async (job) => {
        console.log(`Removing repeatable job with key ${job.key}`);
        return monitorSchedulerQueue.removeRepeatableByKey(job.key);
      });
      
      await Promise.all(removePromises);
      console.log(`Removed ${jobsToRemove.length} repeatable jobs for scheduler ${schedulerId}`);
      return true;
    } else {
      console.log(`No repeatable jobs found for scheduler ${schedulerId}`);
      return false;
    }
  } catch (error) {
    console.error(`Failed to delete scheduled monitor:`, error);
    return false;
  }
}

/**
 * Initializes monitor schedulers for all monitors with frequency
 * Called on application startup
 */
export async function initializeMonitorSchedulers(): Promise<{ success: boolean; scheduled: number; failed: number }> {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Initializing monitor schedulers (attempt ${attempt}/${maxRetries})...`);
      
      // Test Redis connection first
      const { monitorSchedulerQueue } = await getQueues();
      const redisClient = await monitorSchedulerQueue.client;
      await redisClient.ping();
      console.log('✅ Redis connection verified for monitor scheduler');
      
      const activeMonitors = await db
        .select()
        .from(monitorSchemaDb)
        .where(and(
          isNotNull(monitorSchemaDb.frequencyMinutes), 
          eq(monitorSchemaDb.enabled, true)
        ));
        
      console.log(`Found ${activeMonitors.length} active monitors to initialize`);
      
      if (activeMonitors.length === 0) {
        console.log('No monitors found to schedule - initialization complete');
        return { success: true, scheduled: 0, failed: 0 };
      }
      
      let scheduledCount = 0;
      let failedCount = 0;
      
      for (const monitor of activeMonitors) {
        if (monitor.frequencyMinutes && monitor.frequencyMinutes > 0) {
          try {
            console.log(`Scheduling monitor ${monitor.id} (${monitor.name}) with ${monitor.frequencyMinutes}min frequency`);
            
            const jobDataPayload: MonitorJobData = {
              monitorId: monitor.id,
              type: monitor.type as MonitorJobData['type'],
              target: monitor.target,
              config: monitor.config as MonitorConfig,
              frequencyMinutes: monitor.frequencyMinutes,
            };

            const schedulerId = await scheduleMonitor({
              monitorId: monitor.id,
              frequencyMinutes: monitor.frequencyMinutes,
              jobData: jobDataPayload,
              retryLimit: 3
            });
            
            // Update the monitor with the scheduler ID (like jobs do)
            await db
              .update(monitorSchemaDb)
              .set({ scheduledJobId: schedulerId })
              .where(eq(monitorSchemaDb.id, monitor.id));
              
            console.log(`✅ Initialized monitor scheduler ${schedulerId} for monitor ${monitor.id} (${monitor.name})`);
            scheduledCount++;
          } catch (error) {
            console.error(`❌ Failed to initialize scheduler for monitor ${monitor.id} (${monitor.name}):`, error);
            failedCount++;
          }
        } else {
          console.warn(`⚠️ Monitor ${monitor.id} has invalid frequency: ${monitor.frequencyMinutes}`);
          failedCount++;
        }
      }
      
      console.log(`Monitor scheduler initialization complete: ${scheduledCount} succeeded, ${failedCount} failed`);
      
      // Consider initialization successful if at least some monitors were scheduled
      // or if there were no monitors to schedule
      const success = scheduledCount > 0 || (scheduledCount === 0 && failedCount === 0);
      return { success, scheduled: scheduledCount, failed: failedCount };
      
    } catch (error) {
      console.error(`Failed to initialize monitor schedulers (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        console.error('❌ All retry attempts exhausted for monitor scheduler initialization');
        return { success: false, scheduled: 0, failed: 0 };
      }
      
      // Wait before retrying
      console.log(`⏳ Retrying monitor scheduler initialization in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  // This should never be reached, but just in case
  return { success: false, scheduled: 0, failed: 0 };
}

/**
 * Cleanup function to close all monitor scheduler queues and workers.
 * Should be called when shutting down the application
 */
export async function cleanupMonitorScheduler(): Promise<boolean> {
  try {
    console.log("Cleaning up monitor scheduler...");
    
    const { monitorSchedulerQueue } = await getQueues();
    const repeatableJobs = await monitorSchedulerQueue.getRepeatableJobs();
    console.log(`Found ${repeatableJobs.length} repeatable jobs in Redis`);
    
    // Get all monitors with schedules from the database
    const monitorsWithSchedules = await db
      .select({ id: monitorSchemaDb.id, scheduledJobId: monitorSchemaDb.scheduledJobId })
      .from(monitorSchemaDb)
      .where(isNotNull(monitorSchemaDb.scheduledJobId));
    
    const validMonitorIds = new Set(monitorsWithSchedules.map(m => m.id));
    const validSchedulerIds = new Set(monitorsWithSchedules.map(m => m.scheduledJobId).filter(Boolean));
    
    // Find orphaned jobs
    const orphanedJobs = repeatableJobs.filter(job => {
      const monitorIdMatch = job.name?.match(/scheduled-monitor-([0-9a-f-]+)/);
      const monitorId = monitorIdMatch ? monitorIdMatch[1] : null;
      
      return (!monitorId || !validMonitorIds.has(monitorId)) && 
             (!job.id || !validSchedulerIds.has(job.id as string));
    });
    
    if (orphanedJobs.length > 0) {
      console.log(`Found ${orphanedJobs.length} orphaned repeatable jobs to clean up`);
      
      const removePromises = orphanedJobs.map(async (job) => {
        console.log(`Removing orphaned repeatable job: ${job.key}`);
        return monitorSchedulerQueue.removeRepeatableByKey(job.key);
      });
      
      await Promise.all(removePromises);
      console.log(`Removed ${orphanedJobs.length} orphaned repeatable jobs`);
    } else {
      console.log("No orphaned repeatable jobs found");
    }
    
    console.log("Monitor scheduler cleanup complete");
    return true;
  } catch (error) {
    console.error("Failed to cleanup monitor scheduler:", error);
    return false;
  }
}