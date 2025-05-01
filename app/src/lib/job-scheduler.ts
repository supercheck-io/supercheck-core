import { setupJobExecutionWorker, getQueueStats, testQueueConnectivity } from './queue';
import { executeMultipleTests } from './test-execution';
import { db } from '../db/client';
import { jobs as jobsTable, runs as runsTable } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';

// Add a map to track jobs currently being processed
const processingJobs = new Map<string, boolean>();

let initialized = false;

/**
 * Initialize the job scheduler, setting up workers to process jobs
 */
export async function initializeJobScheduler() {
  if (initialized) {
    console.log('Job scheduler already initialized');
    return true;
  }

  try {
    console.log('Initializing job scheduler...');
    
    // Connect to Redis with improved connection handling
    console.log('Testing Redis connectivity...');
    const queueConnected = await testQueueConnectivity(10000); // Increased timeout
    if (!queueConnected) {
      console.error('Failed to connect to Redis. Job scheduler initialization failed.');
      throw new Error('Redis connection failed - check your Redis server');
    }
    
    console.log('Redis connectivity test passed! Initializing job queue...');
    
    // Get queue stats
    try {
      const stats = await getQueueStats();
      console.log('Queue stats:', stats);
    } catch (statsError) {
      console.error('Failed to get queue stats, but continuing:', statsError);
    }
    
    // Set up the job execution worker with increased logging
    await setupJobExecutionWorker(5, async (task) => {
      console.log(`Processing job execution for job ${task.jobId} with ${task.testScripts.length} tests`);
      
      // Check if job is already being processed
      if (processingJobs.has(task.jobId)) {
        console.log(`Job ${task.jobId} is already being processed, skipping duplicate execution`);
        return { 
          success: true, 
          skipped: true,
          message: 'Job already in progress, skipping duplicate execution'
        };
      }
      
      // Set job as being processed
      processingJobs.set(task.jobId, true);
      
      try {
        // Create an initial run entry to track this execution
        const runId = crypto.randomUUID();
        const dbInstance = await db();
        
        // Check if there's already a recent running entry for this job
        const recentRuns = await dbInstance
          .select({ id: runsTable.id, status: runsTable.status, startedAt: runsTable.startedAt })
          .from(runsTable)
          .where(eq(runsTable.jobId, task.jobId))
          .orderBy(desc(runsTable.startedAt))
          .limit(2);
        
        // If there's a recent run that's still running, don't create a new one
        const recentRunning = recentRuns.find(run => run.status === 'running');
        if (recentRunning) {
          const timeDiff = Date.now() - (recentRunning.startedAt?.getTime() || 0);
          if (timeDiff < 60000) { // Less than a minute old
            console.log(`Found recent running entry for job ${task.jobId}, reusing run ID ${recentRunning.id}`);
            processingJobs.delete(task.jobId);
            return {
              success: true,
              runId: recentRunning.id,
              message: 'Reusing existing run'
            };
          }
        }
        
        // Create a new run entry with detailed logging
        await dbInstance
          .insert(runsTable)
          .values({
            id: runId,
            jobId: task.jobId,
            status: 'running',
            startedAt: new Date(),
            logs: `Started execution of job ${task.jobId} with ${task.testScripts.length} tests`
          });
        
        console.log(`Created run entry with ID ${runId} for job ${task.jobId}`);
        
        // Execute multiple tests
        console.log(`Executing tests for job ${task.jobId}...`);
        const result = await executeMultipleTests(task.testScripts, task.jobId);
        console.log(`Test execution completed for job ${task.jobId} with success=${result.success}`);
        
        // Update job status in the database
        await dbInstance
          .update(jobsTable)
          .set({
            status: result.success ? 'completed' : 'failed',
            lastRunAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(jobsTable.id, task.jobId));
        
        // After test execution completion:
        const completionTime = new Date();
        const startTime = new Date(await dbInstance
          .select({ startedAt: runsTable.startedAt })
          .from(runsTable)
          .where(eq(runsTable.id, runId))
          .then(rows => rows[0]?.startedAt?.toISOString() || completionTime.toISOString()));
        
        // Calculate duration in milliseconds
        const durationMs = completionTime.getTime() - new Date(startTime).getTime();
        
        // Update run status with duration and correct status
        await dbInstance
          .update(runsTable)
          .set({
            status: result.success ? 'passed' : 'failed',
            completedAt: completionTime,
            duration: durationMs, // Store the duration in milliseconds
            logs: result.stdout || null,
            errorDetails: result.error || null,
          })
          .where(eq(runsTable.id, runId));
        
        console.log(`Job ${task.jobId} execution completed, success: ${result.success}, runId: ${runId}`);
        
        return {
          ...result,
          runId,
          jobId: task.jobId
        };
      } catch (error) {
        console.error(`Error processing job ${task.jobId}:`, error);
        
        // Update job status to failed in the database
        try {
          const dbInstance = await db();
          
          // Update job status
          await dbInstance
            .update(jobsTable)
            .set({
              status: 'failed',
              lastRunAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(jobsTable.id, task.jobId));
          
          // Also update run status if we have a valid runId
          const existingRun = await dbInstance
            .select({ id: runsTable.id })
            .from(runsTable)
            .where(eq(runsTable.jobId, task.jobId))
            .orderBy(desc(runsTable.startedAt))
            .limit(1);
            
          if (existingRun.length > 0) {
            const failureTime = new Date();
            const startTimeForFailure = new Date(await dbInstance
              .select({ startedAt: runsTable.startedAt })
              .from(runsTable)
              .where(eq(runsTable.id, existingRun[0].id))
              .then(rows => rows[0]?.startedAt?.toISOString() || failureTime.toISOString()));
            
            // Calculate duration for the failed run
            const failureDurationMs = failureTime.getTime() - new Date(startTimeForFailure).getTime();
            
            // Update run with duration
            await dbInstance
              .update(runsTable)
              .set({
                status: 'failed',
                completedAt: failureTime,
                duration: failureDurationMs, // Store the duration in milliseconds
                errorDetails: error instanceof Error ? error.message : String(error),
                logs: error instanceof Error && error.stack ? error.stack : 'Execution failed',
              })
              .where(eq(runsTable.id, existingRun[0].id));
              
            console.log(`Updated run ${existingRun[0].id} status to failed`);
          }
        } catch (dbError) {
          console.error(`Failed to update job/run status in DB:`, dbError);
        }
        
        throw error;
      } finally {
        // Always remove the job from processing map when done
        processingJobs.delete(task.jobId);
      }
    });
    
    console.log('Job scheduler initialized successfully');
    initialized = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize job scheduler:', error);
    return false;
  }
}

/**
 * Safely initialize the job scheduler, with retries if needed
 */
export async function safeInitializeJobScheduler(maxRetries = 3) {
  let retries = 0;
  let initialized = false;
  
  while (!initialized && retries < maxRetries) {
    try {
      const result = await initializeJobScheduler();
      initialized = result !== false;
      
      if (initialized) {
        console.log(`Job scheduler initialized successfully after ${retries} retries`);
      }
    } catch (error) {
      retries++;
      console.error(`Job scheduler initialization attempt ${retries} failed:`, error);
      
      if (retries >= maxRetries) {
        console.error(`Failed to initialize job scheduler after ${maxRetries} attempts`);
        return false;
      }
      
      // Wait before retrying with increasing delay
      const delayMs = 5000 * retries;
      console.log(`Waiting ${delayMs}ms before retry #${retries + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return initialized;
} 