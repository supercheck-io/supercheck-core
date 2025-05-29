import { NextRequest, NextResponse } from "next/server";
import { db as getDbInstance } from "@/lib/db";
import { monitors, monitorsInsertSchema } from "@/db/schema/schema";
import { scheduleMonitorCheck, removeScheduledMonitorCheck } from "@/lib/monitor-scheduler";
import { MonitorJobData } from "@/lib/queue";

export async function GET() {
  try {
    const db = await getDbInstance();
    const allMonitors = await db.query.monitors.findMany({
      orderBy: (monitors, { desc }) => [desc(monitors.createdAt)],
    });

    // Map to a structure that the frontend table likely expects
    const formattedMonitors = allMonitors.map(monitor => ({
      id: monitor.id,
      name: monitor.name,
      description: monitor.description,
      url: monitor.target, // Map target to url
      type: monitor.type, // Keep type as is, frontend can format it
      interval: monitor.frequencyMinutes, // Map frequencyMinutes to interval
      status: monitor.status,
      // config: monitor.config, // Usually not needed for overview table
      lastCheckedAt: monitor.lastCheckAt?.toISOString(),
      // lastStatusChangeAt: monitor.lastStatusChangeAt?.toISOString(),
      // mutedUntil: monitor.mutedUntil?.toISOString(),
      createdAt: monitor.createdAt?.toISOString(),
      // updatedAt: monitor.updatedAt?.toISOString(),
      // Health and detailed response time would typically come from aggregated results or latest result,
      // which might be too heavy for a simple GET all.
      // For now, these will be undefined or handled by client if it fetches individual results.
      health: "loading", // Placeholder, actual health needs aggregation
      responseTime: undefined, // Placeholder
    }));

    return NextResponse.json(formattedMonitors);
  } catch (error) {
    console.error("Error fetching monitors:", error);
    return NextResponse.json(
      { error: "Failed to fetch monitors" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawData = await req.json();
    const validationResult = monitorsInsertSchema.safeParse(rawData);

    if (!validationResult.success) {
      return NextResponse.json({ error: "Invalid input", details: validationResult.error.format() }, { status: 400 });
    }

    const newMonitorData = validationResult.data;
    const db = await getDbInstance();

    // Ensure target is not null or empty if it's required by the schema (it is notNull())
    if (!newMonitorData.target) {
        return NextResponse.json({ error: "Target is required" }, { status: 400 });
    }

    const [insertedMonitor] = await db.insert(monitors).values(newMonitorData).returning();

    if (insertedMonitor && insertedMonitor.frequencyMinutes && insertedMonitor.frequencyMinutes > 0) {
      const jobData: MonitorJobData = {
        monitorId: insertedMonitor.id,
        type: insertedMonitor.type as MonitorJobData['type'], 
        target: insertedMonitor.target, 
        config: insertedMonitor.config as any,
        frequencyMinutes: insertedMonitor.frequencyMinutes,
      };
      try {
        await scheduleMonitorCheck({ 
            monitorId: insertedMonitor.id, 
            frequencyMinutes: insertedMonitor.frequencyMinutes, 
            jobData 
        });
      } catch (scheduleError) {
        console.error(`Failed to schedule initial check for monitor ${insertedMonitor.id}:`, scheduleError);
        // Log error but don't fail the monitor creation itself
      }
    }

    return NextResponse.json(insertedMonitor, { status: 201 });
  } catch (error) {
    console.error("Error creating monitor:", error);
    // Check for unique constraint violation or other DB errors if necessary
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
} 