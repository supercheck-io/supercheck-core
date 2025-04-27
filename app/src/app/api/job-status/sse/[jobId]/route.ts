import { NextRequest, NextResponse } from 'next/server';
import { Redis } from 'ioredis';
import { getDb } from '@/db/client';
import { runs } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Create a Redis client for pub/sub
const getRedisClient = () => {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;

  const redis = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
  });

  redis.on('error', (err) => console.error('[SSE] Redis Error:', err));
  
  return redis;
};

// Helper to create SSE message
const createSSEMessage = (data: any) => {
  return `data: ${JSON.stringify(data)}\n\n`;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  // Explicitly await the params object to fix the "sync dynamic APIs" error
  const resolvedParams = await Promise.resolve(params);
  const jobId = resolvedParams.jobId;
  
  // Create response with appropriate headers for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check if we already have a result for this job's latest run
        const db = await getDb();
        const latestRun = await db.query.runs.findFirst({
          where: eq(runs.jobId, jobId),
          orderBy: [desc(runs.createdAt)],
        });

        // If job run already completed or failed, send result and close
        if (latestRun && ['completed', 'failed'].includes(latestRun.status)) {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: latestRun.status,
            runId: latestRun.id,
            artifactPaths: latestRun.artifactPaths,
            duration: latestRun.duration,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            errorDetails: latestRun.errorDetails
          })));
          controller.close();
          return;
        }

        // Set up Redis client for subscribing to status updates
        const redis = getRedisClient();
        const channelName = `job-status:${jobId}`;
        
        // Handle disconnection
        request.signal.addEventListener('abort', () => {
          redis.unsubscribe(channelName);
          redis.quit();
          controller.close();
        });
        
        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
          controller.enqueue(encoder.encode(': ping\n\n'));
        }, 30000);
        
        // Clean up on close
        request.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
        });
        
        // Send initial running status if we have an active run
        if (latestRun && latestRun.status === 'running') {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: 'running',
            runId: latestRun.id,
            startedAt: latestRun.startedAt
          })));
        } else {
          controller.enqueue(encoder.encode(createSSEMessage({ status: 'waiting' })));
        }
        
        // Subscribe to Redis channel for updates
        await redis.subscribe(channelName);
        
        // Listen for messages on the channel
        redis.on('message', (channel, message) => {
          if (channel === channelName) {
            try {
              const data = JSON.parse(message);
              controller.enqueue(encoder.encode(createSSEMessage(data)));
              
              // If status is terminal, close the connection
              if (data.status === 'completed' || data.status === 'failed') {
                setTimeout(() => {
                  redis.unsubscribe(channelName);
                  redis.quit();
                  clearInterval(pingInterval);
                  controller.close();
                }, 1000); // Small delay to ensure client receives the message
              }
            } catch (err) {
              console.error('[SSE] Error parsing message:', err);
            }
          }
        });
      } catch (err) {
        console.error('[SSE] Error in SSE stream:', err);
        controller.enqueue(encoder.encode(createSSEMessage({ 
          status: 'error', 
          message: 'Failed to establish status stream' 
        })));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
} 