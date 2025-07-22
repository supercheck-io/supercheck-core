import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";
import { addHeartbeatPingNotificationJob } from "@/lib/queue";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const params = await context.params;
  return handleHeartbeatFailure(request, params.token);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const params = await context.params;
  return handleHeartbeatFailure(request, params.token);
}

async function handleHeartbeatFailure(request: NextRequest, token: string) {
  console.log(`[HEARTBEAT-FAIL] Received failure ping for token: ${token}`);
  
  try {
    // Parse request body for additional failure data
    let failureData: Record<string, unknown> = {};
    try {
      const contentType = request.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        failureData = await request.json();
      }
    } catch {
      // Ignore JSON parsing errors - failure data is optional
      console.log(`[HEARTBEAT-FAIL] No valid JSON body provided, continuing with empty failure data`);
    }

    // Find the monitor by heartbeat URL token
    const monitor = await db
      .select()
      .from(monitors)
      .where(eq(monitors.target, token))
      .limit(1);

    if (!monitor.length) {
      console.log(`[HEARTBEAT-FAIL] Monitor not found for token: ${token}`);
      return NextResponse.json(
        { error: "Heartbeat not found" },
        { status: 404 }
      );
    }

    const heartbeatMonitor = monitor[0];
    console.log(`[HEARTBEAT-FAIL] Found monitor: ${heartbeatMonitor.name} (${heartbeatMonitor.id})`);

    // Verify this is actually a heartbeat monitor
    if (heartbeatMonitor.type !== "heartbeat") {
      console.log(`[HEARTBEAT-FAIL] Invalid monitor type: ${heartbeatMonitor.type}`);
      return NextResponse.json(
        { error: "Invalid heartbeat endpoint" },
        { status: 400 }
      );
    }

    // Extract source information from headers
    const sourceHeaders = {
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
      xForwardedFor: request.headers.get("x-forwarded-for"),
      xRealIp: request.headers.get("x-real-ip"),
    };

    const source = sourceHeaders.origin || 
                  sourceHeaders.referer || 
                  sourceHeaders.userAgent || 
                  "Unknown";

    const now = new Date();
    const wasUp = heartbeatMonitor.status === 'up' || heartbeatMonitor.status === 'pending'; // Treat pending as up for first failure

    // Check if this is a status change by looking at recent results
    const recentResults = await db
      .select()
      .from(monitorResults)
      .where(eq(monitorResults.monitorId, heartbeatMonitor.id))
      .orderBy(desc(monitorResults.checkedAt))
      .limit(1);

    const isStatusChange = recentResults.length === 0 || recentResults[0].isUp;

    console.log(`[HEARTBEAT-FAIL] Updating monitor status to 'down', was: ${heartbeatMonitor.status}, status change: ${isStatusChange}`);

    // Update monitor status to 'down' regardless of previous state
    await db
      .update(monitors)
      .set({
        status: "down",
        lastCheckAt: now,
        lastStatusChangeAt: wasUp ? now : heartbeatMonitor.lastStatusChangeAt,
      })
      .where(eq(monitors.id, heartbeatMonitor.id));
    
    // Create failure details
    const errorMessage = (failureData as Record<string, unknown>)?.message as string || 
                        (failureData as Record<string, unknown>)?.error as string || 
                        "Explicit failure reported by a ping to the /fail URL.";
    
    // Record the failure result
    await db.insert(monitorResults).values({
      monitorId: heartbeatMonitor.id,
      checkedAt: now,
      status: "down",
      responseTimeMs: 0, // Heartbeat pings don't have response time
      details: {
        source,
        sourceHeaders,
        errorMessage,
        statusChanged: wasUp,
        triggeredBy: 'explicit_fail_ping',
        ...failureData,
      },
      isUp: false,
      isStatusChange: wasUp,
    });

    // If status changed from up/pending to down, dispatch a notification job
    if (wasUp && heartbeatMonitor.alertConfig?.enabled) {
      console.log(`[HEARTBEAT-FAIL] Status changed to DOWN. Dispatching notification job for monitor ${heartbeatMonitor.name}`);
      
      try {
        await addHeartbeatPingNotificationJob({
            monitorId: heartbeatMonitor.id,
            type: 'failure',
            reason: errorMessage,
            metadata: {
                source,
                trigger: 'heartbeat_fail_url',
                ...failureData
            }
        });
        console.log(`[HEARTBEAT-FAIL] Successfully dispatched notification job for ${heartbeatMonitor.name}.`);
      } catch (queueError) {
        console.error(`[HEARTBEAT-FAIL] Failed to dispatch notification job:`, queueError);
      }
    }

    console.log(`[HEARTBEAT-FAIL] Successfully processed failure ping for ${heartbeatMonitor.name}`);

    return NextResponse.json({
      success: true,
      message: "Heartbeat failure recorded",
      timestamp: now.toISOString(),
      monitor: heartbeatMonitor.name,
      statusChanged: wasUp,
      isUp: false,
      errorMessage: errorMessage,
    });

  } catch (error) {
    console.error("[HEARTBEAT-FAIL] Error processing heartbeat failure:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 