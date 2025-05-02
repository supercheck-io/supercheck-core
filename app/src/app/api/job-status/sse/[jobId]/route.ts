import { NextRequest, NextResponse } from 'next/server';
import { Redis } from 'ioredis';
import { getDb } from '@/db/client';
import { runs } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Constants for Redis TTL
const REDIS_CHANNEL_TTL = 60 * 60; // 1 hour in seconds

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

// Helper function to create SSE message
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
  let redis: Redis | null = null;
  
  // Track if the connection is already closed to prevent multiple cleanup attempts
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

        // Set up Redis client for subscribing to status updates
        redis = getRedisClient();
        const channelName = `job-status:${runId}`; // Use runId for the channel name
        
        // Handle disconnection
        request.signal.addEventListener('abort', () => {
          if (!connectionClosed) {
            connectionClosed = true;
            if (redis) {
              redis.unsubscribe(channelName).catch(err => 
                console.error(`[SSE] Error unsubscribing from ${channelName}:`, err)
              );
              redis.quit().catch(err => 
                console.error('[SSE] Error closing Redis connection:', err)
              );
            }
            controller.close();
            console.log(`[SSE] Client disconnected for job ${jobId}`);
          }
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
        
        // Set TTL on Redis channel for this job status
        // This ensures Redis keys don't accumulate forever
        if (redis) {
          try {
            await redis.set(`job-status-ttl:${runId}`, "active", "EX", REDIS_CHANNEL_TTL);
            console.log(`[SSE] Set TTL for job status channel ${runId}: ${REDIS_CHANNEL_TTL}s`);
          } catch (ttlError) {
            console.error(`[SSE] Error setting TTL for job status ${runId}:`, ttlError);
          }
        }
        
        // Send initial running status if we have an active run
        if (run && run.status === 'running') {
          controller.enqueue(encoder.encode(createSSEMessage({ 
            status: 'running',
            runId: run.id,
            startedAt: run.startedAt
          })));
        } else {
          controller.enqueue(encoder.encode(createSSEMessage({ status: 'waiting' })));
        }
        
        // Subscribe to Redis channel for updates
        if (redis) {
          await redis.subscribe(channelName);
          
          // Listen for messages on the channel
          redis.on('message', (channel, message) => {
            if (channel === channelName && !connectionClosed) {
              try {
                const data = JSON.parse(message);
                
                // Add runId to the response data if not present
                if (!data.runId) {
                  data.runId = runId;
                }
                
                // Log each message for debugging
                console.log(`[SSE] Message received on channel ${channel}:`, data);
                
                controller.enqueue(encoder.encode(createSSEMessage(data)));
                
                // If status is terminal, close the connection
                if (data.status === 'completed' || data.status === 'failed' || 
                    data.status === 'passed' || data.status === 'error') {
                  console.log(`[SSE] Received terminal status ${data.status} for job ${jobId}, closing connection`);
                  connectionClosed = true;
                  clearInterval(pingInterval);
                  
                  setTimeout(() => {
                    if (redis) {
                      redis.unsubscribe(channelName).catch(err => 
                        console.error(`[SSE] Error unsubscribing from ${channelName}:`, err)
                      );
                      redis.quit().catch(err => 
                        console.error('[SSE] Error closing Redis connection:', err)
                      );
                      redis = null;
                    }
                    
                    // Check if controller is already closed before attempting to close it
                    try {
                      if (controller.desiredSize !== null) {
                        controller.close();
                      }
                    } catch (err: unknown) {
                      console.warn('[SSE] Controller already closed:', err instanceof Error ? err.message : String(err));
                    }
                  }, 1000); // Small delay to ensure client receives the message
                }
              } catch (err: unknown) {
                console.error('[SSE] Error parsing message:', err);
              }
            }
          });
        }
      } catch (err) {
        console.error('[SSE] Error in SSE stream:', err);
        controller.enqueue(encoder.encode(createSSEMessage({ 
          status: 'error', 
          message: 'Failed to establish status stream' 
        })));
        
        // Clean up resources
        connectionClosed = true;
        if (redis) {
          redis.quit().catch(err => 
            console.error('[SSE] Error closing Redis connection during error handling:', err)
          );
          redis = null;
        }
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