import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

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
  try {
    const dbInstance = await db();
    
    // Find the monitor by heartbeat URL token
    const monitor = await dbInstance
      .select()
      .from(monitors)
      .where(eq(monitors.target, token))
      .limit(1);

    if (!monitor.length) {
      return NextResponse.json(
        { error: "Heartbeat not found" },
        { status: 404 }
      );
    }

    const heartbeatMonitor = monitor[0];

    // Verify this is actually a heartbeat monitor
    if (heartbeatMonitor.type !== "heartbeat") {
      return NextResponse.json(
        { error: "Invalid heartbeat endpoint" },
        { status: 400 }
      );
    }

    // Extract source information from headers
    const origin = request.headers.get("origin") || 
                  request.headers.get("referer") || 
                  request.headers.get("user-agent") || 
                  "Unknown";

    const now = new Date();

    // Update the monitor's last ping time in config
    const updatedConfig = {
      ...heartbeatMonitor.config,
      lastPingAt: now.toISOString(),
    };

    // Update monitor status and last ping time
    await dbInstance
      .update(monitors)
      .set({
        config: updatedConfig,
        status: "up",
        lastCheckAt: now,
        lastStatusChangeAt: heartbeatMonitor.status !== "up" ? now : heartbeatMonitor.lastStatusChangeAt,
      })
      .where(eq(monitors.id, heartbeatMonitor.id));

    // Record the ping as a successful result
    await dbInstance.insert(monitorResults).values({
      monitorId: heartbeatMonitor.id,
      checkedAt: now,
      status: "up",
      responseTimeMs: 0, // Heartbeat pings don't have response time
      details: {
        source: origin,
        message: "Ping received",
        pingTime: now.toISOString(),
      },
      isUp: true,
      isStatusChange: heartbeatMonitor.status !== "up",
    });

    return NextResponse.json({
      success: true,
      message: "Heartbeat received",
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error("Error processing heartbeat ping:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 