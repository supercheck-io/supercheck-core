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
      
      // Initialize job scheduler synchronously to ensure it completes during startup
      const initializeAsync = async () => {
        try {
          console.log('🧹 Cleaning up job scheduler...');
          await cleanupJobScheduler();
          
          console.log('🚀 Starting job schedulers...');
          const result = await initializeJobSchedulers();
          
          if (result.success) {
            console.log('✅ Job scheduler initialized successfully');
            if (result.initialized && result.failed) {
              console.log(`Initialized ${result.initialized} jobs, ${result.failed} failed`);
            }
            
            if (result.failed && result.failed > 0) {
              console.warn(`⚠️ ${result.failed} job(s) failed to initialize - this may cause scheduling gaps`);
            }
          } else {
            console.error('❌ Job scheduler initialization failed', result.error);
          }
        } catch (error: unknown) {
          console.error('❌ Job scheduler initialization error:', error);
          // Re-throw to ensure the error is visible in server logs
          throw error;
        }
      };
      
      // Start initialization but don't block server component return
      // However, make sure errors are properly caught and logged
      initializeAsync().catch((error) => {
        console.error('❌ Critical: Job scheduler failed to initialize during startup:', error);
        // Could potentially set up a retry mechanism here
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
      
      // Initialize monitor scheduler synchronously to ensure it completes during startup
      const initializeAsync = async () => {
        try {
          console.log('🧹 Cleaning up monitor scheduler...');
          await cleanupMonitorScheduler();
          
          console.log('🚀 Starting monitor schedulers...');
          const result = await initializeMonitorSchedulers();
          
          if (result.success) {
            console.log('✅ Monitor scheduler initialized successfully');
            console.log(`Initialized ${result.scheduled} monitors, ${result.failed} failed`);
            
            if (result.failed > 0) {
              console.warn(`⚠️ ${result.failed} monitor(s) failed to initialize - this may cause monitoring gaps`);
            }
          } else {
            console.error('❌ Monitor scheduler initialization failed completely');
          }
        } catch (error: unknown) {
          console.error('❌ Monitor scheduler initialization error:', error);
          // Re-throw to ensure the error is visible in server logs
          throw error;
        }
      };
      
      // Start initialization but don't block server component return
      // However, make sure errors are properly caught and logged
      initializeAsync().catch((error) => {
        console.error('❌ Critical: Monitor scheduler failed to initialize during startup:', error);
        // Could potentially set up a retry mechanism here
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