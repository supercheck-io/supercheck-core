import { NextRequest, NextResponse } from "next/server";
import { db as getDbInstance } from "@/lib/db";
import { monitors, monitorsInsertSchema, monitorResults, Monitor } from "@/db/schema/schema";
import { scheduleMonitorCheck, removeScheduledMonitorCheck } from "@/lib/monitor-scheduler";
import { MonitorJobData } from "@/lib/queue";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const db = await getDbInstance();

    // 1. Fetch all monitors
    const allMonitors: Array<typeof monitors.$inferSelect> = await db.query.monitors.findMany({
      orderBy: (monitors, { desc }) => [desc(monitors.createdAt)],
    });

    // 2. For each monitor, fetch its latest result (N+1 queries approach)
    const formattedMonitors = await Promise.all(
      allMonitors.map(async (monitor) => {
        if (!monitor) {
          console.warn("Encountered a null/undefined monitor object during mapping");
          return null; 
        }

        // Find the latest result for this specific monitor
        const latestResult = await db.query.monitorResults.findFirst({
          where: eq(monitorResults.monitorId, monitor.id),
          orderBy: (monitorResults, { desc }) => [desc(monitorResults.checkedAt)],
        });

        const monitorOwnStatus = monitor.status;
        let healthStatus = monitorOwnStatus === 'paused' ? 'paused' : 'pending';
        let resultStatus = null;
        let resultIsUp = null;
        let resultResponseTimeMs = null;
        let resultCheckedAt = null;

        if (latestResult) {
          resultStatus = latestResult.status;
          resultIsUp = latestResult.isUp;
          resultResponseTimeMs = latestResult.responseTimeMs;
          resultCheckedAt = latestResult.checkedAt;
          if (resultIsUp === true) {
            healthStatus = 'up';
          } else if (resultIsUp === false) {
            healthStatus = 'down';
          }
        }
        
        // If monitor is paused, always show paused status regardless of latest result
        const finalStatus = monitorOwnStatus === 'paused' ? 'paused' : (resultStatus ?? monitorOwnStatus);
        
        const effectiveLastCheckTime = resultCheckedAt ?? monitor.lastCheckAt;

        return {
          id: monitor.id,
          name: monitor.name ?? 'Unnamed Monitor',
          description: monitor.description,
          url: monitor.target,
          method: monitor.type,
          frequencyMinutes: monitor.frequencyMinutes,
          status: finalStatus, 
          lastCheckedAt: effectiveLastCheckTime ? new Date(effectiveLastCheckTime).toISOString() : null,
          createdAt: monitor.createdAt ? new Date(monitor.createdAt).toISOString() : null,
          health: healthStatus,
          responseTime: resultResponseTimeMs ?? null,
        };
      })
    );

    return NextResponse.json(formattedMonitors.filter(Boolean)); // Filter out any nulls from failed mappings

  } catch (error) {
    console.error("Error fetching monitors (N+1 approach):", error);
    // Log the specific error if it's the same TypeError, though it shouldn't be with this approach
    if (error instanceof TypeError && error.message.includes("Cannot convert undefined or null to object")) {
        console.error("TypeError details (N+1 approach):", error.stack);
    }
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
      }
    }

    return NextResponse.json(insertedMonitor, { status: 201 });
  } catch (error) {
    console.error("Error creating monitor:", error);
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 });
  }
} 