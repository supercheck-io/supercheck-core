'use server';

import { safeInitializeJobScheduler } from '@/lib/job-scheduler';

// Server component to initialize the job scheduler
export async function SchedulerInitializer() {
  // Only initialize in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_JOB_SCHEDULER === 'true') {
    try {
      console.log('🔄 Job scheduler initialization started');
      
      // Initialize the job scheduler in the background
      safeInitializeJobScheduler()
        .then(success => {
          if (success) {
            console.log('✅ Job scheduler initialized successfully');
            console.log('🕒 Scheduled jobs will now run automatically');
            console.log('📊 Check the runs page to see job execution results');
          } else {
            console.error('❌ Failed to initialize job scheduler');
            console.error('💡 Run "npm run redis:check" to verify Redis is running properly');
            console.error('🔍 Check your Redis connection settings in your environment variables');
          }
        })
        .catch(error => {
          console.error('❌ Error initializing job scheduler:', error);
          console.error('💡 Run "npm run redis:check" to verify Redis is running properly');
        });
    } catch (error) {
      console.error('❌ Error starting job scheduler initialization:', error);
    }
  } else {
    console.log('⚠️ Job scheduler disabled in development.');
    console.log('💡 Run "npm run dev:jobs" or set ENABLE_JOB_SCHEDULER=true to enable.');
  }
  
  // This component doesn't render anything
  return null;
} 