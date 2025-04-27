import { NextRequest, NextResponse } from 'next/server';
// import { createClient, RedisClientType } from 'redis';
import Redis from 'ioredis'; // Import ioredis
import { createDb } from '@/db/client';
import { reports } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// Define types for message data
interface TestStatusMessage {
  status: 'queued' | 'running' | 'completed' | 'failed';
  reportPath?: string;
  s3Url?: string;
  error?: string;
}

// Helper function to create Redis client
async function createRedisClient() {
  // Instantiate ioredis client
  const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    // Add any specific ioredis options here if needed
    // lazyConnect: true // Example option
  });

  client.on('error', (err) => console.error('SSE Redis Client Error', err));
  // No explicit connect() needed for ioredis in basic cases
  // await client.connect(); 
  return client;
}

export async function GET(
  req: NextRequest,
  { params: routeParams }: { params: { testId: string } }
) {
  const params = await Promise.resolve(routeParams);
  const testId = params.testId;
  console.log(`[SSE] Request received for testId: ${testId}`);

  if (!testId) {
    return NextResponse.json({ error: 'Missing testId' }, { status: 400 });
  }

  // let subRedis: RedisClientType | null = null;
  let subRedis: Redis | null = null; // Use ioredis type
  let streamController: ReadableStreamDefaultController<any> | null = null;
  let pingInterval: NodeJS.Timeout | null = null;
  let cleanedUp = false; // Flag to prevent multiple cleanups
  let dbInstance: Awaited<ReturnType<typeof createDb>> | null = null; // Hold DB instance
  const channelName = `test-status:${testId}`; // Define channel name early

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    console.log(`[SSE Cleanup ${testId}] Starting cleanup...`);

    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
      console.log(`[SSE Cleanup ${testId}] Cleared ping interval.`);
    }

    if (subRedis) {
      const redisToClean = subRedis;
      subRedis = null;
      // Remove message listener before unsubscribing/disconnecting
      redisToClean.off('message', messageHandler); 
      try {
        await redisToClean.unsubscribe(channelName);
        console.log(`[SSE Cleanup ${testId}] Unsubscribed from ${channelName}.`);
      } catch (unsubError: any) {
        console.warn(`[SSE Cleanup ${testId}] Error unsubscribing (ignoring): ${unsubError.message}`);
      }
      try {
        // Use disconnect for ioredis
        await redisToClean.disconnect(); 
        console.log(`[SSE Cleanup ${testId}] Redis connection quit.`);
      } catch (quitError: any) {
        console.warn(`[SSE Cleanup ${testId}] Error quitting Redis (ignoring): ${quitError.message}`);
      }
    }

    if (streamController) {
      const controllerToClean = streamController;
      streamController = null;
      try {
        controllerToClean.close();
        console.log(`[SSE Cleanup ${testId}] Stream controller closed.`);
      } catch (closeError: any) {
        console.warn(`[SSE Cleanup ${testId}] Error closing stream controller (ignoring): ${closeError.message}`);
      }
    }
    
    // Close DB connection if open
    if (dbInstance) {
        try {
            await dbInstance.closeConnection(); // Assuming createDb returns an obj with closeConnection
            console.log(`[SSE Cleanup ${testId}] Database connection closed.`);
            dbInstance = null;
        } catch (dbCloseError: any) {
            console.warn(`[SSE Cleanup ${testId}] Error closing database connection (ignoring): ${dbCloseError.message}`);
            dbInstance = null;
        }
    }
    
    console.log(`[SSE Cleanup ${testId}] Cleanup finished.`);
  };

  // Define the message handler function separately for easier removal
  const messageHandler = (channel: string, message: string) => {
      if (cleanedUp || channel !== channelName) return; // Ensure correct channel
      console.log(`[SSE ${testId}] Received message from ${channel}:`, message);
      try {
        const data: TestStatusMessage = JSON.parse(message);
        if (streamController) {
          streamController.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } else {
          console.warn(`[SSE ${testId}] Received message but stream controller is null.`);
          cleanup();
          return;
        }

        if (data.status === 'completed' || data.status === 'failed') {
          console.log(`[SSE ${testId}] Received final status (${data.status}). Scheduling cleanup.`);
          setTimeout(cleanup, 1000); 
        }
      } catch (err: any) {
        console.error(`[SSE ${testId}] Error parsing message or enqueuing: ${err.message}`);
        cleanup();
      }
  };

  try {
    // Create DB instance for this request
    dbInstance = await createDb();
    console.log(`[SSE ${testId}] Attempting database query...`);
    const existingReport = await dbInstance.query.reports.findFirst({
      where: and(eq(reports.entityType, 'test'), eq(reports.entityId, testId)),
      columns: { status: true, reportPath: true, s3Url: true },
    });
    console.log(`[SSE ${testId}] Database query completed.`);

    const stream = new ReadableStream({
      async start(controller) {
        streamController = controller;
        console.log(`[SSE ${testId}] Stream started.`);

        if (existingReport) {
          console.log(`[SSE ${testId}] Found existing report with status: ${existingReport.status}`);
          const initialData: TestStatusMessage = {
            status: existingReport.status as TestStatusMessage['status'],
            reportPath: existingReport.reportPath ?? undefined,
            s3Url: existingReport.s3Url ?? undefined,
          };
          controller.enqueue(`data: ${JSON.stringify(initialData)}\n\n`);
          if (existingReport.status === 'completed' || existingReport.status === 'failed') {
            console.log(`[SSE ${testId}] Test already finished (${existingReport.status}). Closing stream immediately.`);
            await cleanup();
            return;
          }
        } else {
          console.log(`[SSE ${testId}] No existing report found. Sending initial queued/running status.`);
          controller.enqueue(`data: ${JSON.stringify({ status: 'running' })}\n\n`);
        }

        console.log(`[SSE ${testId}] Connecting to Redis for Pub/Sub...`);
        subRedis = await createRedisClient();
        console.log(`[SSE ${testId}] Redis connected. Subscribing...`);
        
        // Register the message listener
        subRedis.on('message', messageHandler);

        // Subscribe to the channel
        await subRedis.subscribe(channelName);
        console.log(`[SSE ${testId}] Subscribed to ${channelName}.`);

        req.signal.onabort = () => {
          console.log(`[SSE ${testId}] Client disconnected (abort signal).`);
          cleanup();
        };

        pingInterval = setInterval(() => {
          if (cleanedUp) return;
          try {
            // Check connection status for ioredis
            if (streamController && subRedis && subRedis.status === 'ready') { 
              streamController.enqueue(': ping\n\n');
            } else {
              console.warn(`[SSE ${testId}] Ping: Stream/Redis unavailable (Status: ${subRedis?.status}). Cleaning up.`);
              cleanup();
            }
          } catch (pingErr: any) {
            console.error(`[SSE ${testId}] Error during ping: ${pingErr.message}. Cleaning up.`);
            cleanup();
          }
        }, 10000); 

      },
      cancel(reason) {
        console.log(`[SSE ${testId}] Stream cancelled. Reason:`, reason);
        cleanup();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error(`[SSE ${testId}] Error setting up SSE stream: ${error.message}`);
    await cleanup(); 
    return NextResponse.json({ error: 'Failed to establish SSE connection', details: error.message }, { status: 500 });
  }
} 