import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { addHeartbeatPingNotificationJob } from "@/lib/queue";

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

    // Update monitor status to 'up'
    await db
      .update(monitors)
      .set({
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
      responseTimeMs: 0,
      details: {
        source,
        sourceHeaders,
        message: "Ping received successfully",
        statusChanged: wasDown,
        triggeredBy: 'explicit_pass_ping',
      },
      isUp: true,
      isStatusChange: wasDown,
    });

    // If status changed from down to up, dispatch a recovery notification job
    if (wasDown && heartbeatMonitor.alertConfig?.enabled) {
      console.log(`[HEARTBEAT] Status changed to UP. Dispatching notification job for monitor ${heartbeatMonitor.name}`);
      
      try {
        await addHeartbeatPingNotificationJob({
            monitorId: heartbeatMonitor.id,
            type: 'recovery',
            reason: 'Heartbeat ping received successfully after being down.',
            metadata: {
                source,
                trigger: 'heartbeat_pass_url',
            }
        });
        console.log(`[HEARTBEAT] Successfully dispatched recovery notification job for ${heartbeatMonitor.name}.`);
      } catch (queueError) {
        console.error(`[HEARTBEAT] Failed to dispatch recovery notification job:`, queueError);
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
    });

  } catch (error) {
    console.error("[HEARTBEAT] Error processing heartbeat ping:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 