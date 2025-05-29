'use server';

import { initializeJobSchedulers, cleanupJobScheduler } from '@/lib/job-scheduler';
import { initializeMonitorSchedulers, cleanupMonitorScheduler } from '@/lib/monitor-scheduler';

/**
 * Server component to initialize the job and monitor schedulers.
 * 
 * Uses BullMQ's Job Schedulers feature (available in v5.16.0+) which is a more robust
 * replacement for repeatable jobs. Job Schedulers act as job factories, producing jobs
 * based on specified cron schedules. The scheduled jobs are persisted in Postgres db
 * to survive restarts.
 */
export async function SchedulerInitializer() {
  // Enable by default in all environments unless explicitly disabled
  const isJobSchedulerEnabled = process.env.DISABLE_JOB_SCHEDULER !== 'true';
  const isMonitorSchedulerEnabled = process.env.DISABLE_MONITOR_SCHEDULER !== 'true';
  
  if (isJobSchedulerEnabled) {
    try {
      console.log('🔄 Job scheduler initialization started');
      
      // Initialize the job scheduler in the background
      cleanupJobScheduler()
        .then(() => initializeJobSchedulers())
        .then((result) => {
          if (result.success) {
            console.log('✅ Job scheduler initialized successfully');
            if (result.initialized && result.failed) {
              console.log(`Initialized ${result.initialized} jobs, ${result.failed} failed`);
            }
          } else {
            console.error('❌ Job scheduler initialization failed', result.error);
          }
        })
        .catch((error: unknown) => {
          console.error('❌ Job scheduler initialization error:', error);
        });
    } catch (error) {
      console.error('❌ Error starting job scheduler initialization:', error);
    }
  } else {
    console.log('⏸️ Job scheduler disabled by environment variable');
  }
  
  if (isMonitorSchedulerEnabled) {
    try {
      console.log('🔄 Monitor scheduler initialization started');
      cleanupMonitorScheduler()
        .then(() => initializeMonitorSchedulers())
        .then((result) => {
          if (result.success) {
            console.log('✅ Monitor scheduler initialized successfully');
            if (result.scheduled !== undefined && result.failed !== undefined) {
              console.log(`Initialized ${result.scheduled} monitors, ${result.failed} failed`);
            }
          } else {
            console.error('❌ Monitor scheduler initialization failed', result.error);
          }
        })
        .catch((error: unknown) => {
          console.error('❌ Monitor scheduler initialization error:', error);
        });
    } catch (error) {
      console.error('❌ Error starting monitor scheduler initialization:', error);
    }
  } else {
    console.log('⏸️ Monitor scheduler disabled by environment variable');
  }

  // This is a server component, so it doesn't render anything
  return null;
}

// Optional: Add a cleanup function for graceful shutdown if the app supports it
// This might be called from a global server shutdown hook
export async function cleanupBackgroundTasks() {
  console.log('🧹 Cleaning up background tasks...');
  const jobCleanupPromise = cleanupJobScheduler().catch(e => console.error('Error cleaning job scheduler:', e));
  const monitorSchedulerCleanupPromise = cleanupMonitorScheduler().catch(e => console.error('Error cleaning monitor scheduler:', e));
  
  await Promise.allSettled([
    jobCleanupPromise, 
    monitorSchedulerCleanupPromise
  ]);
  console.log('✅ Background tasks cleanup finished.');
} 