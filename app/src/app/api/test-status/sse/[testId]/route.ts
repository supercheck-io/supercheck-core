import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { reports } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { TEST_EXECUTION_QUEUE } from '@/lib/queue';
import Redis from 'ioredis';

/**
 * Helper function to create SSE message
 */
const createSSEMessage = (data: any) => {
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

export async function GET(
  request: NextRequest,
  { params }: { params: { testId: string } }
) {
  // Explicitly await the params object to fix the "sync dynamic APIs" error
  const resolvedParams = await Promise.resolve(params);
  const testId = resolvedParams.testId;
  let connectionClosed = false;
  
  // Create response with appropriate headers for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check if we already have a result for this test
        const db = await getDb();
        
        // Get the specific report by test ID
        const report = await db.query.reports.findFirst({
          where: and(
            eq(reports.entityType, 'test'),
            eq(reports.entityId, testId)
          ),
        });

        // If report exists and has a terminal status, send result and close
        if (report && ['completed', 'failed'].includes(report.status)) {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: report.status,
            testId: report.entityId,
            reportPath: report.reportPath,
            s3Url: report.s3Url,
            error: report.errorDetails
          })));
          connectionClosed = true;
          controller.close();
          return;
        }

        // Get Redis connection and create the Bull queue
        const connection = await getRedisConnection();
        const testQueue = new Queue(TEST_EXECUTION_QUEUE, { connection });
        
        // Handle disconnection
        const cleanup = async () => {
          if (!connectionClosed) {
            connectionClosed = true;
            controller.close();
            console.log(`[SSE] Client disconnected for test ${testId}`);
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
        
        // Send initial running status if we have an active report
        if (report && report.status === 'running') {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: 'running',
            testId: report.entityId
          })));
        } else {
          controller.enqueue(encoder.encode(createSSEMessage({ status: 'waiting' })));
        }
        
        // Get all Bull jobs for this test ID
        const jobs = await testQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
        const testJob = jobs.find(job => job.data.testId === testId);
        
        if (!testJob) {
          console.log(`[SSE] Test ${testId} not found in Bull queue`);
          // Even if test not found in Bull, keep the connection alive
          // as it might be added later or already completed
          return;
        }
        
        // Set up polling to check test status from Bull queue
        const pollInterval = setInterval(async () => {
          if (connectionClosed) {
            clearInterval(pollInterval);
            return;
          }
          
          try {
            // Get all jobs again to find the latest state
            const updatedJobs = await testQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
            const updatedTestJob = updatedJobs.find(job => job.data.testId === testId);
            
            if (!updatedTestJob) {
              return;
            }
            
            // Get job state
            const state = await updatedTestJob.getState();
            const progress = JSON.stringify(await updatedTestJob.progress);
            
            // Map Bull states to our application states
            let status = state;
            if (state === 'completed') {
              const result = await updatedTestJob.returnvalue;
              status = result?.success === true ? 'completed' : 'failed';
            }
            
            // Get latest report data from DB
            const updatedReport = await db.query.reports.findFirst({
              where: and(
                eq(reports.entityType, 'test'),
                eq(reports.entityId, testId)
              ),
            });
            
            controller.enqueue(encoder.encode(createSSEMessage({ 
              status,
              testId,
              progress,
              reportPath: updatedReport?.reportPath,
              s3Url: updatedReport?.s3Url,
              error: updatedReport?.errorDetails,
              ...(updatedTestJob.returnvalue || {})
            })));
            
            // If terminal state, close connection
            if (['completed', 'failed'].includes(state)) {
              console.log(`[SSE] Test ${testId} reached terminal state ${status}, closing connection`);
              connectionClosed = true;
              clearInterval(pollInterval);
              // Close Redis connection using our cleanup function
              await cleanup();
              controller.close();
            }
          } catch (pollError) {
            console.error(`[SSE] Error polling test ${testId} status:`, pollError);
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