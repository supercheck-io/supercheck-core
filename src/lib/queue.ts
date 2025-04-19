import PgBoss from 'pg-boss';
import { Job, JobWithMetadata } from 'pg-boss';

// Type for test execution task
export interface TestExecutionTask {
  testId: string;
  testPath: string;
}

// Type for job execution task (multiple tests)
export interface JobExecutionTask {
  jobId: string;
  testScripts: Array<{
    id: string;
    script: string;
    name?: string;
  }>;
}

// Type for scheduled job
export interface ScheduledJobOptions {
  name: string;        // Human-readable name for the job
  cron: string;        // Cron expression (e.g., "0 0 * * *" for daily at midnight)
  timezone?: string;   // Optional timezone (e.g., "America/New_York")
  data: JobExecutionTask | TestExecutionTask;  // Job data
  queue: string;       // Which queue to use
  retryLimit?: number; // Number of retries
  expireInMinutes?: number; // Job expiration time
}

// Type for status updates - this will be imported by other modules
export interface TestStatusUpdateMap {
  get(key: string): any;
  set(key: string, value: any): any;
  has(key: string): boolean;
}

// Store job results for tracking completion
// Include a special property to differentiate between in-progress, completed, and error states
interface StoredJobResult<T = any> {
  pending?: boolean;   // Job is in progress 
  timestamp?: number;  // When the entry was created
  result?: T;          // Successful result
  completedAt?: number; // When job completed
  error?: string;      // Error if job failed
  success?: boolean;   // Explicit success state
}

const jobResults = new Map<string, StoredJobResult>();

// We'll need to declare this but defer actual initialization to avoid circular dependencies
let testStatusMapRef: TestStatusUpdateMap | null = null;

// Function to set the status map reference from test-execution.ts
export function setTestStatusMap(statusMap: TestStatusUpdateMap): void {
  testStatusMapRef = statusMap;
}

// The pg-boss queue instance
let bossInstance: PgBoss | null = null;

// Track if the worker has been initialized
let workerInitialized = {
  test: false,
  job: false
};

// Queue names for different task types
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';
// Define completed job queue name pattern
export const COMPLETED_JOB_PREFIX = '__state__completed__';
// Scheduled jobs prefix
export const SCHEDULED_JOB_PREFIX = 'scheduled-';

// Default timeout for jobs (15 minutes)
export const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Get the pg-boss queue instance (singleton pattern)
 */
export async function getQueueInstance(): Promise<PgBoss> {
  if (!bossInstance) {
    try {
      const connectionString = process.env.DATABASE_URL || 
        `postgres://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || "postgres"}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "supertest"}`;
      
      console.log('Initializing pg-boss queue...');
      
      // Create a new boss instance with options
      bossInstance = new PgBoss({
        connectionString,
        // Additional configuration options
        retentionDays: 7,
        monitorStateIntervalSeconds: 30,
        // Set an application name for easier database query identification
        application_name: 'supertest-queue'
      });

      // Actively listen for errors
      bossInstance.on('error', error => {
        console.error('PgBoss error:', error);
        // Attempt to reconnect if connection issues
        if (error.message?.includes('connection') && bossInstance) {
          console.log('Attempting to restart PgBoss after connection error...');
          bossInstance.stop().catch(e => console.error('Error stopping PgBoss:', e));
          bossInstance = null;
          // Try to reconnect after a delay
          setTimeout(() => {
            getQueueInstance().catch(e => console.error('Failed to reconnect to PgBoss:', e));
          }, 5000);
        }
      });

      // Start the queue
      await bossInstance.start();
      console.log('PgBoss queue started successfully');

      // Setup the completion worker for all jobs
      setupCompletionWorkers().catch(err => console.error('Failed to setup completion workers:', err));
    } catch (error) {
      console.error('Failed to initialize pg-boss:', error);
      throw error;
    }
  }
  
  return bossInstance;
}

/**
 * Add a test execution task to the queue
 */
export async function addTestToQueue(task: TestExecutionTask, expiryMinutes: number = 15): Promise<string> {
  const boss = await getQueueInstance();
  
  console.log(`Adding test to queue ${TEST_EXECUTION_QUEUE}:`, task);
  
  try {
    // Use the testId as the job ID for correlation
    const jobOptions = {
      retryLimit: 2,
      expireInMinutes: expiryMinutes,
      id: task.testId
    };
    
    // Send a job to the queue
    const jobId = await boss.send(TEST_EXECUTION_QUEUE, task, jobOptions);
    
    if (!jobId) {
      console.error(`Failed to get job ID after sending test ${task.testId}`);
      throw new Error('Failed to create test execution job');
    }
    
    // Store an initial entry in the results map
    jobResults.set(task.testId, { pending: true, timestamp: Date.now() });
    
    console.log(`Successfully added test ${task.testId} to queue, received ID: ${jobId}`);
    
    // Return the job ID (same as test ID)
    return task.testId;
  } catch (error) {
    console.error(`Error adding test ${task.testId} to queue:`, error);
    throw new Error(`Failed to create test execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add a job execution task (multiple tests) to the queue
 */
export async function addJobToQueue(task: JobExecutionTask, expiryMinutes: number = 30): Promise<string> {
  const boss = await getQueueInstance();
  
  console.log(`Adding job to queue ${JOB_EXECUTION_QUEUE}:`, {
    jobId: task.jobId,
    testCount: task.testScripts.length
  });
  
  try {
    // Use the jobId as the job ID for correlation
    const jobOptions = {
      retryLimit: 1, // Jobs are more complex, limited retries
      expireInMinutes: expiryMinutes,
      id: task.jobId
    };
    
    // Send a job to the queue
    const jobId = await boss.send(JOB_EXECUTION_QUEUE, task, jobOptions);
    
    if (!jobId) {
      console.error(`Failed to get job ID after sending job ${task.jobId}`);
      throw new Error('Failed to create job execution job');
    }
    
    // Store an initial entry in the results map
    jobResults.set(task.jobId, { pending: true, timestamp: Date.now() });
    
    console.log(`Successfully added job ${task.jobId} to queue, received ID: ${jobId}`);
    
    // Return the job ID (same as provided job ID)
    return task.jobId;
  } catch (error) {
    console.error(`Error adding job ${task.jobId} to queue:`, error);
    throw new Error(`Failed to create job execution job: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Schedule a recurring job using cron expression
 * @param options The job scheduling options
 * @returns The name of the scheduled job
 */
export async function scheduleJob(options: ScheduledJobOptions): Promise<string> {
  const boss = await getQueueInstance();
  
  const { name, cron, timezone, data, queue, retryLimit = 1, expireInMinutes = 30 } = options;
  
  // Generate a unique name for the schedule if none provided
  const scheduleName = `${SCHEDULED_JOB_PREFIX}${name}-${Date.now()}`;
  
  console.log(`Scheduling job ${scheduleName} with cron: ${cron}${timezone ? `, timezone: ${timezone}` : ''}`);
  
  try {
    // Create the schedule that will send jobs to our target queue
    await boss.schedule(
      queue,     // The queue to send jobs to
      cron,      // Cron expression
      {          // Data for the job
        ...data,
        _scheduled: true,
        _scheduleName: scheduleName
      },
      {          // Job options
        retryLimit,
        expireInMinutes,
        ...(timezone && { timezone })
      }
    );
    
    console.log(`Successfully scheduled job: ${scheduleName}`);
    return scheduleName;
  } catch (error) {
    console.error(`Failed to schedule job ${scheduleName}:`, error);
    throw error;
  }
}

/**
 * Get a list of all scheduled jobs
 */
export async function getScheduledJobs(): Promise<any[]> {
  const boss = await getQueueInstance();
  
  try {
    // First try the getSchedules API
    try {
      const schedules = await boss.getSchedules();
      return schedules.filter(schedule => 
        schedule && typeof schedule.name === 'string' && 
        schedule.name.startsWith(SCHEDULED_JOB_PREFIX)
      );
    } catch (e) {
      // If getSchedules isn't available or fails, fallback to a more generic approach
      console.warn('getSchedules API failed, using fallback method:', e);
      
      // This is a simplified fallback that may not work in all pg-boss versions
      return [];
    }
  } catch (error) {
    console.error('Error getting scheduled jobs:', error);
    return [];
  }
}

/**
 * Delete a scheduled job
 * @param scheduleName The name of the schedule to delete
 */
export async function deleteScheduledJob(scheduleName: string): Promise<boolean> {
  const boss = await getQueueInstance();
  
  try {
    console.log(`Deleting scheduled job: ${scheduleName}`);
    
    // Try to unschedule the job
    await boss.unschedule(scheduleName);
    return true;
  } catch (error) {
    console.error(`Error deleting scheduled job ${scheduleName}:`, error);
    return false;
  }
}

/**
 * Setup workers for job completion queues
 */
async function setupCompletionWorkers(): Promise<void> {
  const boss = await getQueueInstance();
  
  // Jobs can be completed successfully or failed with error
  const completedQueues = [
    `${COMPLETED_JOB_PREFIX}${TEST_EXECUTION_QUEUE}`,
    `${COMPLETED_JOB_PREFIX}${JOB_EXECUTION_QUEUE}`
  ];
  
  // Setup workers for each completion queue
  for (const queueName of completedQueues) {
    await boss.work(queueName, { batchSize: 20 }, async (jobs) => {
      if (!Array.isArray(jobs) || jobs.length === 0) return;
      
      console.log(`Processing ${jobs.length} completed jobs from ${queueName}`);
      
      for (const job of jobs) {
        try {
          // Store the result with the original job ID
          // In completed jobs, the data structure includes the original request
          // in a request property with id that matches the original job ID
          if (job.data && typeof job.data === 'object') {
            // Access request property safely with type assertion
            const jobData = job.data as Record<string, any>;
            const originalJobId = jobData.request?.id;
            
            if (originalJobId) {
              // Log detailed information
              const success = !jobData.failed && !jobData.error;
              console.log(`Job ${originalJobId} completed with ${success ? 'success' : 'failure'}, storing result`);
              
              // Store with meaningful fields
              const result = {
                result: jobData.data,
                output: jobData.output || null,
                completedAt: Date.now(),
                success: success,
                error: jobData.error || null
              };
              
              jobResults.set(originalJobId, result);
              
              // Log success message with job type
              const isTest = queueName.includes(TEST_EXECUTION_QUEUE);
              console.log(`${isTest ? 'Test' : 'Job'} ${originalJobId} result stored successfully`);
            } else {
              console.warn(`Completed job without original ID in queue ${queueName}:`, job.id);
            }
          } else {
            console.warn(`Invalid job data format in completed queue ${queueName}:`, job.id);
          }
        } catch (err) {
          console.error(`Error processing completed job ${job.id} from ${queueName}:`, err);
        }
      }
      
      return true;
    });
    
    console.log(`Completion worker set up for queue: ${queueName}`);
  }
}

/**
 * Setup a worker function to process test execution tasks
 * @param maxConcurrency Maximum number of concurrent test executions
 * @param handler Function to handle each test execution
 */
export async function setupTestExecutionWorker(
  maxConcurrency: number,
  handler: (task: TestExecutionTask) => Promise<any>
): Promise<void> {
  // If worker is already set up, don't do it again
  if (workerInitialized.test) {
    console.log('Test execution worker already initialized, skipping setup');
    return;
  }
  
  const boss = await getQueueInstance();
  
  // Clear any previous workers for this queue
  try {
    await boss.offWork(TEST_EXECUTION_QUEUE);
    console.log(`Removed any existing workers for ${TEST_EXECUTION_QUEUE}`);
  } catch (error) {
    console.warn(`Error clearing existing test workers: ${error}`);
  }
  
  // Set up the worker to process jobs
  try {
    // Explicitly type the job parameter to match pg-boss's work method
    await boss.work<TestExecutionTask>(
      TEST_EXECUTION_QUEUE, 
      { batchSize: maxConcurrency }, 
      async (jobs) => {
        if (!Array.isArray(jobs) || jobs.length === 0) return;
        
        const results = [];
        
        for (const job of jobs) {
          console.log(`Processing test job: ${job.id}`);
          
          if (!job.data) {
            console.error('Invalid job data:', job);
            throw new Error('Invalid job data');
          }
          
          try {
            // Execute the handler with the job data
            const result = await handler(job.data);
            console.log(`Test job ${job.id} completed successfully`);
            
            // IMPORTANT: Store the result in the global map for retrieval
            // Ensure the stored result has all required fields
            const completeResult = result && typeof result === 'object' ? 
              {
                ...result,
                // If test ID is missing, use job ID
                testId: result.testId || job.id,
                // Ensure stdout/stderr exist
                stdout: result.stdout || '',
                stderr: result.stderr || ''
              } : result;
            
            jobResults.set(job.id, { 
              result: completeResult,
              completedAt: Date.now(),
              success: true
            });
            
            // Add to results array
            results.push(completeResult);
          } catch (error) {
            console.error(`Error processing test job ${job.id}:`, error);
            
            // Store the error in the global map
            jobResults.set(job.id, { 
              error: error instanceof Error ? error.message : String(error),
              timestamp: Date.now()
            });
            
            // Throw so pg-boss can handle retries if needed
            throw error;
          }
        }
        
        // Return all results
        return results.length === 1 ? results[0] : results;
      }
    );
    
    // Setup an additional worker to listen for job completions
    await boss.work(`${COMPLETED_JOB_PREFIX}${TEST_EXECUTION_QUEUE}`, async (jobs) => {
      if (!Array.isArray(jobs) || jobs.length === 0) return;
      
      for (const job of jobs) {
        try {
          if (job.data && typeof job.data === 'object') {
            // Extract the original job ID from the completion data
            const originalJobId = (job.data as any).request?.id;
            
            if (originalJobId) {
              console.log(`Completion worker: Job ${originalJobId} completed`);
              
              // Only update if we don't already have a result
              if (!jobResults.has(originalJobId)) {
                console.log(`Storing completion result for ${originalJobId}`);
                jobResults.set(originalJobId, {
                  result: (job.data as any).data || job.data, 
                  completedAt: Date.now()
                });
              }
            }
          }
        } catch (error) {
          console.error('Error in completed job worker:', error);
        }
      }
      
      return true;
    });
    
    workerInitialized.test = true;
    console.log(`Test worker initialized for queue: ${TEST_EXECUTION_QUEUE}`);
  } catch (error) {
    console.error(`Failed to set up test worker: ${error}`);
    throw error;
  }
}

/**
 * Setup a worker function to process job execution tasks (multiple tests)
 * @param maxConcurrency Maximum number of concurrent job executions
 * @param handler Function to handle each job execution
 */
export async function setupJobExecutionWorker(
  maxConcurrency: number,
  handler: (task: JobExecutionTask) => Promise<any>
): Promise<void> {
  // If worker is already set up, don't do it again
  if (workerInitialized.job) {
    console.log('Job execution worker already initialized, skipping setup');
    return;
  }
  
  const boss = await getQueueInstance();
  
  // Clear any previous workers for this queue
  try {
    await boss.offWork(JOB_EXECUTION_QUEUE);
    console.log(`Removed any existing workers for ${JOB_EXECUTION_QUEUE}`);
  } catch (error) {
    console.warn(`Error clearing existing job workers: ${error}`);
  }
  
  // Set up the worker to process jobs
  try {
    // Explicitly type the job parameter to match pg-boss's work method
    await boss.work<JobExecutionTask>(
      JOB_EXECUTION_QUEUE, 
      { batchSize: maxConcurrency }, 
      async (jobs) => {
        if (!Array.isArray(jobs) || jobs.length === 0) return;
        
        for (const job of jobs) {
          console.log(`Processing job execution: ${job.id}`);
          
          if (!job.data) {
            console.error('Invalid job data:', job);
            throw new Error('Invalid job data');
          }
          
          try {
            // Execute the handler with the job data
            const result = await handler(job.data);
            console.log(`Job execution ${job.id} completed successfully`);
            
            // Store the result in case waitForJobCompletion is called before completion job is processed
            jobResults.set(job.id, { result });
            
            return result;
          } catch (error) {
            console.error(`Error processing job execution ${job.id}:`, error);
            
            // Store the error in case waitForJobCompletion is called before completion job is processed
            jobResults.set(job.id, { error: error instanceof Error ? error.message : String(error) });
            
            throw error; // Rethrow to let pg-boss handle retries
          }
        }
      }
    );
    
    workerInitialized.job = true;
    console.log(`Job worker initialized for queue: ${JOB_EXECUTION_QUEUE}`);
  } catch (error) {
    console.error(`Failed to set up job worker: ${error}`);
    throw error;
  }
}

/**
 * Wait for a specific job to complete using a polling mechanism
 * This function uses pg-boss's job state to check for completion status
 */
export async function waitForJobCompletion<T>(jobId: string, timeoutMs: number = DEFAULT_JOB_TIMEOUT_MS): Promise<T> {
  console.log(`Waiting for job ${jobId} to complete (timeout: ${timeoutMs}ms)`);
  
  const boss = await getQueueInstance();
  
  return new Promise<T>((resolve, reject) => {
    const startTime = Date.now();
    let pollAttempts = 0;
    
    // Set a timeout to reject the promise if it takes too long
    const timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // This creates a polling interval to check for job completion
    const checkInterval = setInterval(async () => {
      pollAttempts++;
      
      try {
        // First, check our in-memory results
        if (jobResults.has(jobId)) {
          const result = jobResults.get(jobId);
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          
          // If the result contains an error, reject
          if (result && result.error) {
            reject(new Error(`Job ${jobId} failed: ${result.error}`));
            return;
          }
          
          console.log(`Job ${jobId} completed (result from in-memory store)`);
          if (result) {
            resolve(result.result || result as unknown as T);
          } else {
            reject(new Error(`Job ${jobId} result is undefined`));
          }
          return;
        }
        
        // Next, check the job state using different methods
        try {
          // Determine which queue this job belongs to based on the job ID format
          const queueName = jobId.startsWith('test-') ? TEST_EXECUTION_QUEUE : JOB_EXECUTION_QUEUE;
          
          // Try first with getJobById - this returns a JobWithMetadata
          let job = await boss.getJobById(queueName, jobId);
          
          // If not found directly, try to find using other methods
          if (!job) {
            try {
              // For pg-boss v7+, use fetch with metadata to get job state
              const fetchOptions = { includeMetadata: true };
              const fetchedJobs = await boss.fetch(queueName, fetchOptions);
              
              if (Array.isArray(fetchedJobs) && fetchedJobs.length > 0) {
                // This will be a JobWithMetadata because we used includeMetadata: true
                const matchingJob = fetchedJobs.find(j => j.id === jobId);
                
                if (matchingJob) {
                  job = matchingJob as JobWithMetadata<unknown>;
                  console.log(`Found job ${jobId} in active queue`);
                }
              }
            } catch (fetchErr) {
              console.warn(`Error fetching active jobs for ${queueName}:`, fetchErr);
            }
            
            // If still not found, check in completed queue
            if (!job) {
              try {
                const completedQueueName = `${COMPLETED_JOB_PREFIX}${queueName}`;
                
                // Use fetch with includeMetadata to get complete job details
                const fetchOptions = { includeMetadata: true };
                const completedJobs = await boss.fetch(completedQueueName, fetchOptions);
                
                if (Array.isArray(completedJobs) && completedJobs.length > 0) {
                  // Find the job in completed jobs that matches our job ID
                  const completedJob = completedJobs.find(j => {
                    // Safely check data property
                    if (j.data && typeof j.data === 'object') {
                      const data = j.data as Record<string, any>;
                      // Check if request.id matches our job ID
                      return data.request && data.request.id === jobId;
                    }
                    return false;
                  });
                  
                  // If found in completed jobs, extract the result and resolve
                  if (completedJob && completedJob.data) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    
                    // For completed jobs, the output is in the data field - safely access properties
                    const outputData = completedJob.data as Record<string, any>;
                    
                    // Safely check for error indicators
                    const hasError = 
                      'error' in outputData || 
                      (outputData.state === 'failed') || 
                      (outputData.request && outputData.request.status === 'failed');
                    
                    if (hasError) {
                      const errorMsg = 'error' in outputData ? outputData.error : 'Job failed with unknown error';
                      reject(new Error(`Job ${jobId} failed: ${errorMsg}`));
                    } else {
                      console.log(`Job ${jobId} completed (found in completed queue)`);
                      // Extract the data or use the whole object
                      const result = 'data' in outputData ? outputData.data : outputData;
                      resolve(result as unknown as T);
                    }
                    return;
                  }
                }
              } catch (completeErr) {
                console.warn(`Error checking completed queue for ${jobId}:`, completeErr);
              }
              
              // Try getting archived job directly with includeArchive option
              try {
                const archivedJob = await boss.getJobById(queueName, jobId, { includeArchive: true });
                if (archivedJob) {
                  job = archivedJob;
                  console.log(`Found job ${jobId} in archived jobs`);
                }
              } catch (archiveErr) {
                console.warn(`Error checking archive for ${jobId}:`, archiveErr);
                
                // As a last resort, check for test results directly from the status map
                if (queueName === TEST_EXECUTION_QUEUE && testStatusMapRef) {
                  // For test jobs, we can check if the test completed in the status map
                  const status = testStatusMapRef.get(jobId);
                  if (status && status.status === 'completed') {
                    console.log(`Job ${jobId} found in test status map as completed`);
                    const testResult = {
                      success: !!status.success,
                      error: status.error || null,
                      reportUrl: status.reportUrl || null,
                      testId: jobId,
                      stdout: "",
                      stderr: status.error || ""
                    };
                    resolve(testResult as unknown as T);
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    return;
                  }
                }
              }
            }
          }
          
          if (job) {
            // Check the state of the job
            if (job.state === 'completed') {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              
              console.log(`Job ${jobId} completed (found via job state)`);
              // The result is in the data or output property
              resolve((job.output || job.data) as unknown as T);
              return;
            } else if (job.state === 'failed') {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              
              console.error(`Job ${jobId} failed (found via job state)`);
              reject(new Error(`Job ${jobId} failed: ${JSON.stringify(job.output || 'Unknown error')}`));
              return;
            }
            // If job is still in 'created' or 'active' state, continue polling
            console.log(`Job ${jobId} is in state: ${job.state}, continuing to wait...`);
          } else {
            console.log(`Job ${jobId} not found in any queue, continuing to wait...`);
          }
        } catch (error) {
          console.warn(`Error checking job state for ${jobId}:`, error);
          // Continue polling on error
        }
        
        // Log a warning if the job has been running for a long time
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs * 0.8 && pollAttempts % 5 === 0) {
          console.warn(`Job ${jobId} has been running for ${elapsed}ms (80% of timeout)`);
        }
      } catch (error) {
        console.error(`Error in poll check for ${jobId}:`, error);
      }
    }, 2000); // Check every 2 seconds
  });
}

/**
 * Close the pg-boss queue connection
 */
export async function closeQueue(): Promise<void> {
  if (bossInstance) {
    try {
      await bossInstance.stop();
      bossInstance = null;
      workerInitialized = { test: false, job: false };
      console.log('PgBoss queue stopped');
    } catch (error) {
      console.error('Error stopping PgBoss queue:', error);
      throw error;
    }
  }
}

/**
 * Get statistics about the queue
 */
export async function getQueueStats(): Promise<any> {
  if (!bossInstance) {
    return { status: 'not_initialized' };
  }
  
  try {
    const stats = {
      status: 'running',
      testQueueStats: await bossInstance.getQueueSize(TEST_EXECUTION_QUEUE),
      jobQueueStats: await bossInstance.getQueueSize(JOB_EXECUTION_QUEUE),
      workerStatus: workerInitialized,
      // Add scheduled jobs count
      scheduledJobs: (await getScheduledJobs()).length
    };
    
    return stats;
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}