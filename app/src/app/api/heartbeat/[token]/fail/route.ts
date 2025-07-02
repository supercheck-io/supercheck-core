import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";

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
    let failureData = {};
    try {
      const contentType = request.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        failureData = await request.json();
      }
    } catch (error) {
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
    const wasUp = heartbeatMonitor.status === 'up';

    // Check if this is a status change by looking at recent results
    const recentResults = await db
      .select()
      .from(monitorResults)
      .where(eq(monitorResults.monitorId, heartbeatMonitor.id))
      .orderBy(desc(monitorResults.checkedAt))
      .limit(1);

    const isStatusChange = recentResults.length === 0 || recentResults[0].isUp;

    console.log(`[HEARTBEAT-FAIL] Updating monitor status to 'down', was: ${heartbeatMonitor.status}, status change: ${isStatusChange}`);

    // Update monitor status
    await db
      .update(monitors)
      .set({
        status: "down",
        lastCheckAt: now,
        lastStatusChangeAt: wasUp ? now : heartbeatMonitor.lastStatusChangeAt,
      })
      .where(eq(monitors.id, heartbeatMonitor.id));

    // Create failure details
    const errorMessage = (failureData as any)?.message || 
                        (failureData as any)?.error || 
                        "Explicit failure reported";
    
    const exitCode = (failureData as any)?.exitCode;
    const output = (failureData as any)?.output;

    // Record the failure result
    await db.insert(monitorResults).values({
      monitorId: heartbeatMonitor.id,
      checkedAt: now,
      status: "down",
      responseTimeMs: 0, // Heartbeat pings don't have response time
      details: {
        source: source,
        sourceHeaders: sourceHeaders,
        errorMessage: errorMessage,
        failureTime: now.toISOString(),
        statusChanged: wasUp,
        triggeredBy: 'manual_failure',
        ...(exitCode !== undefined && { exitCode }),
        ...(output && { output }),
        ...failureData, // Include any additional failure data
      },
      isUp: false,
      isStatusChange: isStatusChange,
    });

    // Trigger failure notification if status changed from up to down
    if (wasUp && heartbeatMonitor.alertConfig?.enabled) {
      console.log(`[HEARTBEAT-FAIL] Monitor ${heartbeatMonitor.name} failed - triggering notification`);
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const notifyResponse = await fetch(`${baseUrl}/api/monitors/${heartbeatMonitor.id}/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'failure',
            reason: errorMessage,
            metadata: {
              source: source,
              failedAt: now.toISOString(),
              trigger: 'heartbeat_failure',
              errorMessage: errorMessage,
              ...(exitCode !== undefined && { exitCode }),
              ...(output && { output })
            }
          })
        });

        if (notifyResponse.ok) {
          const notifyResult = await notifyResponse.json();
          console.log(`[HEARTBEAT-FAIL] Failure notification sent:`, notifyResult);
        } else {
          console.warn(`[HEARTBEAT-FAIL] Failed to send failure notification: ${notifyResponse.status}`);
        }
        
      } catch (notificationError) {
        console.error(`[HEARTBEAT-FAIL] Failed to trigger failure notification:`, notificationError);
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
      notificationSent: wasUp && heartbeatMonitor.alertConfig?.enabled,
    });

  } catch (error) {
    console.error("[HEARTBEAT-FAIL] Error processing heartbeat failure:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 