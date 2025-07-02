import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorsInsertSchema, monitorResults, monitorNotificationSettings } from "@/db/schema/schema";
import { scheduleMonitorCheck } from "@/lib/monitor-scheduler";
import { MonitorJobData } from "@/lib/queue";
import { eq } from "drizzle-orm";

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
        let resultIsUp = null;
        let resultResponseTimeMs = null;
        let resultCheckedAt = null;

        if (latestResult) {
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
    console.log("[MONITOR_CREATE] Incoming data:", JSON.stringify(rawData, null, 2));
    
    const validationResult = monitorsInsertSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error("[MONITOR_CREATE] Validation failed:", validationResult.error.format());
      return NextResponse.json({ error: "Invalid input", details: validationResult.error.format() }, { status: 400 });
    }

    const newMonitorData = validationResult.data;

    // Validate target - all monitor types require a target
    if (!newMonitorData.target) {
      return NextResponse.json({ error: "Target is required for this monitor type" }, { status: 400 });
    }

    // Prepare alert configuration - ensure it's properly structured and saved to alertConfig column
    let alertConfig = null;
    if (rawData.alertConfig) {
      alertConfig = {
        enabled: Boolean(rawData.alertConfig.enabled),
        notificationProviders: Array.isArray(rawData.alertConfig.notificationProviders) 
          ? rawData.alertConfig.notificationProviders 
          : [],
        alertOnFailure: rawData.alertConfig.alertOnFailure !== undefined 
          ? Boolean(rawData.alertConfig.alertOnFailure) 
          : true,
        alertOnRecovery: rawData.alertConfig.alertOnRecovery !== undefined 
          ? Boolean(rawData.alertConfig.alertOnRecovery) 
          : true,
        alertOnSslExpiration: rawData.alertConfig.alertOnSslExpiration !== undefined 
          ? Boolean(rawData.alertConfig.alertOnSslExpiration) 
          : false,
        failureThreshold: typeof rawData.alertConfig.failureThreshold === 'number' 
          ? rawData.alertConfig.failureThreshold 
          : 1,
        recoveryThreshold: typeof rawData.alertConfig.recoveryThreshold === 'number' 
          ? rawData.alertConfig.recoveryThreshold 
          : 1,
        customMessage: typeof rawData.alertConfig.customMessage === 'string' 
          ? rawData.alertConfig.customMessage 
          : "",
      };
      console.log("[MONITOR_CREATE] Processed alert config:", alertConfig);
    }

    // Construct the config object (for monitor-specific settings, not alerts)
    const finalConfig = newMonitorData.config || {};
    console.log("[MONITOR_CREATE] Final config:", finalConfig);

    const [insertedMonitor] = await db.insert(monitors).values({
      name: newMonitorData.name!,
      type: newMonitorData.type!,
      target: newMonitorData.target!,
      description: newMonitorData.description,
      frequencyMinutes: newMonitorData.frequencyMinutes,
      enabled: newMonitorData.enabled,
      status: newMonitorData.status,
      config: finalConfig, // Monitor-specific config (http settings, etc.)
      alertConfig: alertConfig, // Alert settings go into separate alertConfig column
      organizationId: newMonitorData.organizationId,
      createdByUserId: newMonitorData.createdByUserId,
    }).returning();

    console.log("[MONITOR_CREATE] Inserted monitor:", insertedMonitor);

    // Link notification providers if alert config is enabled
    if (insertedMonitor && alertConfig?.enabled && Array.isArray(alertConfig.notificationProviders)) {
      console.log("[MONITOR_CREATE] Linking notification providers:", alertConfig.notificationProviders);
      
      const providerLinks = await Promise.allSettled(
        alertConfig.notificationProviders.map(providerId =>
          db.insert(monitorNotificationSettings).values({
            monitorId: insertedMonitor.id,
            notificationProviderId: providerId,
          })
        )
      );

      const successfulLinks = providerLinks.filter(result => result.status === 'fulfilled').length;
      const failedLinks = providerLinks.filter(result => result.status === 'rejected').length;
      
      console.log(`[MONITOR_CREATE] Notification provider links: ${successfulLinks} successful, ${failedLinks} failed`);
      
      if (failedLinks > 0) {
        console.warn("[MONITOR_CREATE] Some notification provider links failed:", 
          providerLinks.filter(result => result.status === 'rejected')
        );
      }
    }

    // Schedule the monitor for regular checks
    if (insertedMonitor && insertedMonitor.frequencyMinutes && insertedMonitor.frequencyMinutes > 0) {
      const jobData: MonitorJobData = {
        monitorId: insertedMonitor.id,
        type: insertedMonitor.type as MonitorJobData['type'], 
        target: insertedMonitor.target, 
        config: insertedMonitor.config as Record<string, unknown>,
        frequencyMinutes: insertedMonitor.frequencyMinutes,
      };
      try {
        await scheduleMonitorCheck({ 
            monitorId: insertedMonitor.id, 
            frequencyMinutes: insertedMonitor.frequencyMinutes, 
            jobData 
        });
        console.log(`[MONITOR_CREATE] Scheduled monitor ${insertedMonitor.id} for ${insertedMonitor.frequencyMinutes} minute intervals`);
      } catch (scheduleError) {
        console.error(`[MONITOR_CREATE] Failed to schedule initial check for monitor ${insertedMonitor.id}:`, scheduleError);
      }
    }

    console.log("[MONITOR_CREATE] Successfully created monitor:", insertedMonitor.id);
    return NextResponse.json(insertedMonitor, { status: 201 });
  } catch (error) {
    console.error("[MONITOR_CREATE] Error creating monitor:", error);
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

    // Prepare alert configuration - ensure it's properly structured
    let alertConfig = null;
    if (rawData.alertConfig) {
      alertConfig = {
        enabled: Boolean(rawData.alertConfig.enabled),
        notificationProviders: Array.isArray(rawData.alertConfig.notificationProviders) 
          ? rawData.alertConfig.notificationProviders 
          : [],
        alertOnFailure: rawData.alertConfig.alertOnFailure !== undefined 
          ? Boolean(rawData.alertConfig.alertOnFailure) 
          : true,
        alertOnRecovery: rawData.alertConfig.alertOnRecovery !== undefined 
          ? Boolean(rawData.alertConfig.alertOnRecovery) 
          : true,
        alertOnSslExpiration: rawData.alertConfig.alertOnSslExpiration !== undefined 
          ? Boolean(rawData.alertConfig.alertOnSslExpiration) 
          : false,
        failureThreshold: typeof rawData.alertConfig.failureThreshold === 'number' 
          ? rawData.alertConfig.failureThreshold 
          : 1,
        recoveryThreshold: typeof rawData.alertConfig.recoveryThreshold === 'number' 
          ? rawData.alertConfig.recoveryThreshold 
          : 1,
        customMessage: typeof rawData.alertConfig.customMessage === 'string' 
          ? rawData.alertConfig.customMessage 
          : "",
      };
    }

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
        alertConfig: alertConfig,
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, id))
      .returning();

    // Update notification provider links if alert config is enabled
    if (updatedMonitor && alertConfig?.enabled && Array.isArray(alertConfig.notificationProviders)) {
      // First, delete existing links
      await db.delete(monitorNotificationSettings).where(eq(monitorNotificationSettings.monitorId, id));
      
      // Then, create new links
      await Promise.all(
        alertConfig.notificationProviders.map(providerId =>
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