import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { runs } from '@/db/schema';
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
        const db = await getDb();
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
        const job = await jobQueue.getJob(runId);
        if (!job) {
          console.log(`[SSE] Job ${runId} not found in Bull queue`);
          // Even if job not found in Bull, keep the connection alive
          // as it might be added later or already completed
          return;
        }
        
        // Set up polling to check job status from Bull queue
        const pollInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(pollInterval);
            return;
          }
          
          try {
            // Get fresh job data
            const updatedJob = await jobQueue.getJob(runId);
            if (!updatedJob) {
              return;
            }
            
            // Get job state
            const state = await updatedJob.getState();
            const progress = JSON.stringify(await updatedJob.progress);
            
            // Map Bull states to our application states
            let status = state;
            if (state === 'completed') {
              // Check result to determine if passed or failed
              const result = await updatedJob.returnvalue;
              status = result?.success === true ? 'passed' : 'failed';
            }
            
            // Send status update
            const dbRun = await db.query.runs.findFirst({
              where: eq(runs.id, runId),
            });
            
            controller.enqueue(encoder.encode(createSSEMessage({ 
              status,
              runId,
              progress,
              duration: dbRun?.duration || null,
              ...(updatedJob.returnvalue || {})
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