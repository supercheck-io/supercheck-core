import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";

async function triggerNotificationIfNeeded(monitorId: string, wasDown: boolean, isNowUp: boolean) {
  // Only trigger notification if there was a status change
  if (wasDown && isNowUp) {
    console.log(`[HEARTBEAT] Status changed from down to up for monitor ${monitorId}, triggering recovery notification`);
    
    try {
      // Make a call to the notification service or trigger it via queue
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/monitors/${monitorId}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'recovery',
          reason: 'Heartbeat ping received after being down'
        })
      });
      
      if (!response.ok) {
        console.warn(`[HEARTBEAT] Failed to trigger notification for monitor ${monitorId}`);
      }
    } catch (error) {
      console.warn(`[HEARTBEAT] Error triggering notification for monitor ${monitorId}:`, error || 'Unknown error');
    }
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const params = await context.params;
  return handleHeartbeatPing(request, params.token);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const params = await context.params;
  return handleHeartbeatPing(request, params.token);
}

async function handleHeartbeatPing(request: NextRequest, token: string) {
  console.log(`[HEARTBEAT] Received ping for token: ${token}`);
  
  try {
    // Find the monitor by heartbeat URL token
    const monitor = await db
      .select()
      .from(monitors)
      .where(eq(monitors.target, token))
      .limit(1);

    if (!monitor.length) {
      console.log(`[HEARTBEAT] Monitor not found for token: ${token}`);
      return NextResponse.json(
        { error: "Heartbeat not found" },
        { status: 404 }
      );
    }

    const heartbeatMonitor = monitor[0];
    console.log(`[HEARTBEAT] Found monitor: ${heartbeatMonitor.name} (${heartbeatMonitor.id})`);

    // Verify this is actually a heartbeat monitor
    if (heartbeatMonitor.type !== "heartbeat") {
      console.log(`[HEARTBEAT] Invalid monitor type: ${heartbeatMonitor.type}`);
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
    const wasDown = heartbeatMonitor.status === 'down';

    // Check if this is a status change by looking at recent results
    const recentResults = await db
      .select()
      .from(monitorResults)
      .where(eq(monitorResults.monitorId, heartbeatMonitor.id))
      .orderBy(desc(monitorResults.checkedAt))
      .limit(1);

    const isStatusChange = recentResults.length === 0 || !recentResults[0].isUp;

    // Update the monitor's last ping time in config
    const updatedConfig = {
      ...heartbeatMonitor.config,
      lastPingAt: now.toISOString(),
    };

    console.log(`[HEARTBEAT] Updating monitor status to 'up', was: ${heartbeatMonitor.status}, status change: ${isStatusChange}`);

    // Update monitor status and last ping time
    await db
      .update(monitors)
      .set({
        config: updatedConfig,
        status: "up",
        lastCheckAt: now,
        lastStatusChangeAt: wasDown ? now : heartbeatMonitor.lastStatusChangeAt,
      })
      .where(eq(monitors.id, heartbeatMonitor.id));

    // Record the ping as a successful result
    await db.insert(monitorResults).values({
      monitorId: heartbeatMonitor.id,
      checkedAt: now,
      status: "up",
      responseTimeMs: 0, // Heartbeat pings don't have response time
      details: {
        source: source,
        sourceHeaders: sourceHeaders,
        message: "Ping received successfully",
        pingTime: now.toISOString(),
        statusChanged: wasDown,
        triggeredBy: 'manual_ping',
      },
      isUp: true,
      isStatusChange: isStatusChange,
    });

    // Trigger notification if status changed from down to up
    if (wasDown && heartbeatMonitor.alertConfig?.enabled) {
      console.log(`[HEARTBEAT] Monitor ${heartbeatMonitor.name} recovered - triggering notification`);
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const notifyResponse = await fetch(`${baseUrl}/api/monitors/${heartbeatMonitor.id}/notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'recovery',
            reason: 'Heartbeat ping received after being down',
            metadata: {
              source: source,
              recoveredAt: now.toISOString(),
              trigger: 'heartbeat_ping'
            }
          })
        });

        if (notifyResponse.ok) {
          const notifyResult = await notifyResponse.json();
          console.log(`[HEARTBEAT] Recovery notification sent:`, notifyResult);
        } else {
          console.warn(`[HEARTBEAT] Failed to send recovery notification: ${notifyResponse.status}`);
        }
        
      } catch (notificationError) {
        console.error(`[HEARTBEAT] Failed to trigger recovery notification:`, notificationError);
      }
    }

    console.log(`[HEARTBEAT] Successfully processed ping for ${heartbeatMonitor.name}`);

    return NextResponse.json({
      success: true,
      message: "Heartbeat received",
      timestamp: now.toISOString(),
      monitor: heartbeatMonitor.name,
      statusChanged: wasDown,
      isUp: true,
      notificationSent: wasDown && heartbeatMonitor.alertConfig?.enabled,
    });

  } catch (error) {
    console.error("[HEARTBEAT] Error processing heartbeat ping:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 