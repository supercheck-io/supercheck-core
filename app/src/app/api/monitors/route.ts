import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorsInsertSchema, monitorResults, monitorNotificationSettings } from "@/db/schema/schema";
import { scheduleMonitorCheck, removeScheduledMonitorCheck } from "@/lib/monitor-scheduler";
import { MonitorJobData } from "@/lib/queue";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
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
        // Otherwise, use the health status derived from the latest result
        const finalStatus = monitorOwnStatus === 'paused' ? 'paused' : healthStatus;
        
        const effectiveLastCheckTime = resultCheckedAt ?? monitor.lastCheckAt;

        return {
          id: monitor.id,
          name: monitor.name ?? 'Unnamed Monitor',
          description: monitor.description,
          target: monitor.target,
          url: monitor.target, // Keep for backward compatibility
          type: monitor.type,
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

    let newMonitorData = validationResult.data;

    // Validate target - all monitor types require a target
    if (!newMonitorData.target) {
      return NextResponse.json({ error: "Target is required for this monitor type" }, { status: 400 });
    }

    // Manually construct the config object to include alert settings
    const finalConfig = {
      ...(newMonitorData.config || {}), // Existing config from the form (e.g., http settings)
      alerts: rawData.alertConfig || {}, // Alert settings from the wizard
    };

    const [insertedMonitor] = await db.insert(monitors).values({
      name: newMonitorData.name!,
      type: newMonitorData.type!,
      target: newMonitorData.target!,
      description: newMonitorData.description,
      frequencyMinutes: newMonitorData.frequencyMinutes,
      enabled: newMonitorData.enabled,
      status: newMonitorData.status,
      config: finalConfig, // Use the merged config object
      organizationId: newMonitorData.organizationId,
      createdByUserId: newMonitorData.createdByUserId,
    }).returning();

    // Link notification providers if alert config is enabled
    if (insertedMonitor && rawData.alertConfig?.enabled && Array.isArray(rawData.alertConfig.notificationProviders)) {
      await Promise.all(
        rawData.alertConfig.notificationProviders.map(providerId =>
          db.insert(monitorNotificationSettings).values({
            monitorId: insertedMonitor.id,
            notificationProviderId: providerId,
          })
        )
      );
    }

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

export async function PUT(req: NextRequest) {
  try {
    const rawData = await req.json();
    const { id, ...updateData } = rawData;
    
    if (!id) {
      return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
    }

    const validationResult = monitorsInsertSchema.safeParse(updateData);

    if (!validationResult.success) {
      return NextResponse.json({ error: "Invalid input", details: validationResult.error.format() }, { status: 400 });
    }

    const monitorData = validationResult.data;

    const [updatedMonitor] = await db
      .update(monitors)
      .set({
        name: monitorData.name!,
        type: monitorData.type!,
        target: monitorData.target!,
        description: monitorData.description,
        frequencyMinutes: monitorData.frequencyMinutes,
        enabled: monitorData.enabled,
        status: monitorData.status,
        config: monitorData.config,
        alertConfig: rawData.alertConfig || null,
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, id))
      .returning();

    // Update notification provider links if alert config is enabled
    if (updatedMonitor && rawData.alertConfig?.enabled && Array.isArray(rawData.alertConfig.notificationProviders)) {
      // First, delete existing links
      await db.delete(monitorNotificationSettings).where(eq(monitorNotificationSettings.monitorId, id));
      
      // Then, create new links
      await Promise.all(
        rawData.alertConfig.notificationProviders.map(providerId =>
          db.insert(monitorNotificationSettings).values({
            monitorId: id,
            notificationProviderId: providerId,
          })
        )
      );
    }

    return NextResponse.json(updatedMonitor);
  } catch (error) {
    console.error("Error updating monitor:", error);
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
} 