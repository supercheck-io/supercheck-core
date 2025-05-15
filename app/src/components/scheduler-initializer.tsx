'use server';

import { initializeJobSchedulers, cleanupJobScheduler } from '@/lib/job-scheduler';

/**
 * Server component to initialize the job scheduler
 * 
 * Uses BullMQ's Job Schedulers feature (available in v5.16.0+) which is a more robust
 * replacement for repeatable jobs. Job Schedulers act as job factories, producing jobs
 * based on specified cron schedules. The scheduled jobs are persisted in Postgres db
 * to survive restarts.
 */
export async function SchedulerInitializer() {
  // Enable by default in all environments unless explicitly disabled
  const isEnabled = process.env.DISABLE_JOB_SCHEDULER !== 'true';
  
  if (isEnabled) {
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
  
  // This is a server component, so it doesn't render anything
  return null;
} 