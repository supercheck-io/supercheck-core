import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq } from "drizzle-orm";

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

    // Extract failure details from request body or query params
    let failureDetails = "";
    let exitCode: number | undefined;

    try {
      const body = await request.text();
      if (body) {
        // Check if body is a number (exit code)
        const numericBody = parseInt(body);
        if (!isNaN(numericBody)) {
          exitCode = numericBody;
          failureDetails = `Process exited with code ${exitCode}`;
        } else {
          failureDetails = body;
        }
      }
    } catch {
      // If body parsing fails, use query params or default message
      const url = new URL(request.url);
      failureDetails = url.searchParams.get("message") || "Explicit failure reported";
      const exitCodeParam = url.searchParams.get("exitCode");
      if (exitCodeParam) {
        exitCode = parseInt(exitCodeParam);
      }
    }

    // Extract source information from headers
    const origin = request.headers.get("origin") || 
                  request.headers.get("referer") || 
                  request.headers.get("user-agent") || 
                  "Unknown";

    const now = new Date();

    // Update monitor status to down
    await dbInstance
      .update(monitors)
      .set({
        status: "down",
        lastCheckAt: now,
        lastStatusChangeAt: heartbeatMonitor.status !== "down" ? now : heartbeatMonitor.lastStatusChangeAt,
      })
      .where(eq(monitors.id, heartbeatMonitor.id));

    // Record the failure
    await dbInstance.insert(monitorResults).values({
      monitorId: heartbeatMonitor.id,
      checkedAt: now,
      status: "error",
      responseTimeMs: 0,
      details: {
        source: origin,
        errorMessage: failureDetails || "Explicit failure reported",
        exitCode: exitCode,
        reportedAt: now.toISOString(),
      },
      isUp: false,
      isStatusChange: heartbeatMonitor.status !== "down",
    });

    return NextResponse.json({
      success: true,
      message: "Failure reported",
      timestamp: now.toISOString(),
      details: failureDetails,
    });

  } catch (error) {
    console.error("Error processing heartbeat failure:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 