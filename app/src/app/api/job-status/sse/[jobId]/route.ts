import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/db/schema/schema';
import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { JOB_EXECUTION_QUEUE } from '@/lib/queue';
import Redis from 'ioredis';

/**
 * Helper function to create SSE message
 */
const createSSEMessage = (data: Record<string, unknown>) => {
  return `data: ${JSON.stringify(data)}\n\n`;
};

/**
 * Helper function to get Redis connection - internal function that doesn't rely on exported getRedisConnection
 */
const getRedisConnection = async (): Promise<Redis> => {
  console.log(`Creating Redis connection for SSE endpoint`);
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,    // Speed up connection
  });
  
  redis.on('error', (err) => console.error('[SSE Redis Client Error]', err));
  redis.on('connect', () => console.log('[SSE Redis Client Connected]'));
  
  return redis;
};

export async function GET(request: Request) {
  // Extract jobId from the URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const jobId = pathParts[pathParts.length - 1]; // Get the last part of the URL

  let connectionClosed = false;
  
  // Create response with appropriate headers for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check if we already have a result for this job's latest run
        const runId = jobId; // In our system, the SSE endpoint is now called with runId
        
        // Get the specific run by ID
        const run = await db.query.runs.findFirst({
          where: eq(runs.id, runId),
        });

        // If run exists and has a terminal status, send result and close
        if (run && ['completed', 'failed', 'passed', 'error'].includes(run.status)) {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: run.status,
            runId: run.id,
            duration: run.duration,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            errorDetails: run.errorDetails,
            artifactPaths: run.artifactPaths
          })));
          connectionClosed = true;
          controller.close();
          return;
        }

        // Get Redis connection and create the Bull queue
        const connection = await getRedisConnection();
        const jobQueue = new Queue(JOB_EXECUTION_QUEUE, { connection });
        
        // Handle disconnection
        const cleanup = async () => {
          if (!connectionClosed) {
            connectionClosed = true;
            controller.close();
            console.log(`[SSE] Client disconnected for job ${jobId}`);
            // Clean up Redis connection
            try {
              await connection.disconnect();
            } catch (err) {
              console.error(`Error disconnecting Redis: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        };
        
        request.signal.addEventListener('abort', () => {
          cleanup().catch(err => console.error("Error in cleanup:", err));
        });
        
        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
          if (!connectionClosed) {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
        
        // Clean up on close
        request.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
        });
        
        // Send initial running status if we have an active run
        if (run && run.status === 'running') {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: 'running',
            runId: run.id,
            startedAt: run.startedAt,
            duration: run.duration
          })));
        } else {
          controller.enqueue(encoder.encode(createSSEMessage({ status: 'waiting' })));
        }
        
        // Get the Bull job to watch for events
        let job = await jobQueue.getJob(runId);
        
        // If job not found by ID, try getting all jobs and finding by other means
        if (!job) {
          console.log(`[SSE] Job ${runId} not found directly by ID, searching for jobs by data.runId...`);
          
          // Get active jobs from the queue
          const activeJobs = await jobQueue.getJobs(['active', 'delayed', 'wait', 'waiting']);
          console.log(`[SSE] Found ${activeJobs.length} active jobs in the queue`);
          
          // Find job matching our runId in the data object
          for (const activeJob of activeJobs) {
            const data = activeJob.data || {};
            if (data.runId === runId || activeJob.name === runId) {
              console.log(`[SSE] Found matching job with ID ${activeJob.id} and name ${activeJob.name} for runId ${runId}`);
              job = activeJob;
              break;
            }
          }
          
          if (!job) {
            console.log(`[SSE] Job ${runId} not found in active Bull queue jobs`);
            // Even if job not found in Bull, keep the connection alive
            // as it might be added later or already completed
          }
        } else {
          console.log(`[SSE] Found job ${runId} directly by ID in Bull queue`);
        }
        
        // Set up polling to check job status from Bull queue and database
        const pollInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(pollInterval);
            return;
          }
          
          try {
            // Get fresh database run status first (more reliable than queue)
            const dbRun = await db.query.runs.findFirst({
              where: eq(runs.id, runId),
            });
            
            // If run shows terminal status in DB, use that status
            if (dbRun && ['completed', 'failed', 'passed', 'error'].includes(dbRun.status)) {
              console.log(`[SSE] Run ${runId} has terminal status ${dbRun.status} in database, sending update`);
              
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status: dbRun.status,
                runId: dbRun.id,
                duration: dbRun.duration,
                startedAt: dbRun.startedAt,
                completedAt: dbRun.completedAt,
                errorDetails: dbRun.errorDetails,
                artifactPaths: dbRun.artifactPaths
              })));
              
              // Close connection for terminal status
              connectionClosed = true;
              clearInterval(pollInterval);
              await cleanup();
              controller.close();
              return;
            }
            
            // Try to get job from queue again if we didn't find it before
            // Jobs might appear later for scheduled tasks
            if (!job) {
              job = await jobQueue.getJob(runId);
              
              if (!job) {
                // Still not found, check active jobs again
                const activeJobs = await jobQueue.getJobs(['active', 'delayed', 'wait', 'waiting']);
                
                for (const activeJob of activeJobs) {
                  const data = activeJob.data || {};
                  if (data.runId === runId || activeJob.name === runId) {
                    job = activeJob;
                    console.log(`[SSE] Found job in later poll with ID ${activeJob.id} and name ${activeJob.name}`);
                    break;
                  }
                }
              }
            }
            
            // If we have a job from the queue, process its state
            if (job) {
              // Get job state
              const state = await job.getState();
              const progress = JSON.stringify(await job.progress);
              
              // Map Bull states to our application states
              let status = state;
              if (state === 'completed') {
                // Check result to determine if passed or failed
                const result = await job.returnvalue;
                status = result?.success === true ? 'passed' : 'failed';
              }
              
              // Send status update based on Bull job state
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status,
                runId,
                progress,
                duration: dbRun?.duration || null,
                ...(job.returnvalue || {})
              })));
              
              // If terminal state, close connection
              if (['completed', 'failed'].includes(state)) {
                console.log(`[SSE] Job ${runId} reached terminal state ${status}, closing connection`);
                connectionClosed = true;
                clearInterval(pollInterval);
                // Close Redis connection using our cleanup function
                await cleanup();
                controller.close();
              }
            } else if (dbRun) {
              // If we have a database run but no job in the queue, send the database status
              controller.enqueue(encoder.encode(createSSEMessage({ 
                status: dbRun.status,
                runId: dbRun.id,
                duration: dbRun.duration,
                startedAt: dbRun.startedAt,
                completedAt: dbRun.completedAt
              })));
            }
          } catch (pollError) {
            console.error(`[SSE] Error polling job ${runId} status:`, pollError);
          }
        }, 1000); // Poll every second
      } catch (err) {
        console.error('[SSE] Error in SSE stream:', err);
        controller.enqueue(encoder.encode(createSSEMessage({ 
          status: 'error', 
          message: 'Failed to establish status stream' 
        })));
        
        // Clean up resources
        connectionClosed = true;
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
} 