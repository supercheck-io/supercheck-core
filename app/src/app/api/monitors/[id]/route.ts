import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults, monitorsUpdateSchema, monitorNotificationSettings } from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";
import { scheduleMonitor, deleteScheduledMonitor } from "@/lib/monitor-scheduler";
import { MonitorJobData } from "@/lib/queue";

const RECENT_RESULTS_LIMIT = 1000; // Number of recent results to fetch

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const monitor = await db.query.monitors.findFirst({
      where: eq(monitors.id, id),
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    const recentResults = await db
      .select()
      .from(monitorResults)
      .where(eq(monitorResults.monitorId, id))
      .orderBy(desc(monitorResults.checkedAt))
      .limit(RECENT_RESULTS_LIMIT);

    // Ensure alertConfig has proper defaults if it's null or undefined
    const responseMonitor = {
      ...monitor,
      recentResults,
      alertConfig: monitor.alertConfig || {
        enabled: false,
        notificationProviders: [],
        alertOnFailure: true,
        alertOnRecovery: true,
        alertOnSslExpiration: false,
        failureThreshold: 1,
        recoveryThreshold: 1,
        customMessage: "",
      },
    };

    return NextResponse.json(responseMonitor);
  } catch (error) {
    console.error(`Error fetching monitor ${id}:`, error);
    return NextResponse.json({ error: "Failed to fetch monitor data" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const rawData = await request.json();
    const validationResult = monitorsUpdateSchema.safeParse(rawData);

    if (!validationResult.success) {
      return NextResponse.json({ error: "Invalid input", details: validationResult.error.format() }, { status: 400 });
    }

    const updateData = validationResult.data;

    const currentMonitor = await db.query.monitors.findFirst({ where: eq(monitors.id, id) });
    if (!currentMonitor) {
        return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    const [updatedMonitor] = await db
      .update(monitors)
      .set({
        ...updateData,
        alertConfig: rawData.alertConfig ? {
          enabled: Boolean(rawData.alertConfig.enabled),
          notificationProviders: Array.isArray(rawData.alertConfig.notificationProviders) ? rawData.alertConfig.notificationProviders : [],
          alertOnFailure: rawData.alertConfig.alertOnFailure !== undefined ? Boolean(rawData.alertConfig.alertOnFailure) : true,
          alertOnRecovery: Boolean(rawData.alertConfig.alertOnRecovery),
          alertOnSslExpiration: Boolean(rawData.alertConfig.alertOnSslExpiration),
          failureThreshold: typeof rawData.alertConfig.failureThreshold === 'number' ? rawData.alertConfig.failureThreshold : 1,
          recoveryThreshold: typeof rawData.alertConfig.recoveryThreshold === 'number' ? rawData.alertConfig.recoveryThreshold : 1,
          customMessage: typeof rawData.alertConfig.customMessage === 'string' ? rawData.alertConfig.customMessage : "",
        } : null,
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, id))
      .returning();

    if (!updatedMonitor) {
      // Should not happen if currentMonitor was found, but as a safeguard
      return NextResponse.json({ error: "Failed to update monitor, monitor not found after update." }, { status: 404 });
    }

    // Update notification provider links if alert config is enabled
    if (rawData.alertConfig?.enabled && Array.isArray(rawData.alertConfig.notificationProviders)) {
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

    // Handle scheduling changes for frequency updates
    const oldFrequency = currentMonitor.frequencyMinutes;
    const newFrequency = updatedMonitor.frequencyMinutes;
    const oldStatus = currentMonitor.status;
    const newStatus = updatedMonitor.status;

    const jobData: MonitorJobData = {
        monitorId: updatedMonitor.id,
        type: updatedMonitor.type as MonitorJobData['type'],
        target: updatedMonitor.target,
        config: updatedMonitor.config as Record<string, unknown>,
        frequencyMinutes: newFrequency ?? undefined,
    };

    // Handle status changes (pause/resume)
    if (oldStatus !== newStatus) {
      console.log(`Monitor ${id} status changed from ${oldStatus} to ${newStatus}`);
      
      if (newStatus === 'paused') {
        // Pause monitor - remove from scheduler
        console.log(`Pausing monitor ${id} - removing from scheduler`);
        await deleteScheduledMonitor(id);
      } else if (oldStatus === 'paused' && (newStatus === 'up' || newStatus === 'down')) {
        // Resume monitor - add to scheduler if it has valid frequency
        if (newFrequency && newFrequency > 0) {
          console.log(`Resuming monitor ${id} - adding to scheduler with ${newFrequency} minute frequency`);
          await scheduleMonitor({ monitorId: id, frequencyMinutes: newFrequency, jobData, retryLimit: 3 });
        }
      }
    }

    // Handle frequency changes for non-paused monitors OR config changes
    const configChanged = JSON.stringify(currentMonitor.config) !== JSON.stringify(updatedMonitor.config);
    const targetChanged = currentMonitor.target !== updatedMonitor.target;
    const typeChanged = currentMonitor.type !== updatedMonitor.type;
    
    if ((oldFrequency !== newFrequency || configChanged || targetChanged || typeChanged) && newStatus !== 'paused') {
        // Always remove the old schedule first
        console.log(`Rescheduling monitor ${id} due to changes - frequency: ${oldFrequency} -> ${newFrequency}, config: ${configChanged}, target: ${targetChanged}, type: ${typeChanged}`);
        await deleteScheduledMonitor(id);
        
        if (newFrequency && newFrequency > 0) {
            console.log(`Scheduling monitor ${id} with updated configuration`);
            await scheduleMonitor({ monitorId: id, frequencyMinutes: newFrequency, jobData, retryLimit: 3 });
        } else {
            console.log(`Monitor ${id} frequency set to ${newFrequency}, not scheduling.`);
        }
    }

    return NextResponse.json(updatedMonitor);
  } catch (error) {
    console.error(`Error updating monitor ${id}:`, error);
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    // First, unschedule the monitor
    try {
        await deleteScheduledMonitor(id);
        console.log(`Unscheduled monitor ${id} before deletion.`);
    } catch (scheduleError) {
        console.error(`Error unscheduling monitor ${id} during deletion:`, scheduleError);
        // Continue with deletion even if unscheduling fails, but log it.
    }

    // Then, delete monitor results associated with the monitor (due to onDelete: "cascade" this might be automatic)
    // Explicitly deleting them first can be safer depending on DB config / Drizzle behavior interpretation.
    await db.delete(monitorResults).where(eq(monitorResults.monitorId, id));
    
    const [deletedMonitor] = await db.delete(monitors).where(eq(monitors.id, id)).returning();

    if (!deletedMonitor) {
      return NextResponse.json({ error: "Monitor not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: deletedMonitor.id });
  } catch (error) {
    console.error(`Error deleting monitor ${id}:`, error);
    return NextResponse.json({ error: "Failed to delete monitor" }, { status: 500 });
  }
}

function isObject(item: any): item is Record<string, any> {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge<T extends object, U extends object>(target: T, source: U): T & U {
  const output = { ...target } as T & U;

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          (output as any)[key] = deepMerge(target[key as keyof T] as any, source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const rawData = await request.json();

    // Fetch the current monitor to merge the config
    const currentMonitor = await db.query.monitors.findFirst({ where: eq(monitors.id, id) });
    if (!currentMonitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }
    
    const updatePayload: Partial<{
      config: typeof currentMonitor.config;
      alertConfig: typeof currentMonitor.alertConfig;
      status: typeof currentMonitor.status;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    // Handle partial update for 'config'
    if (rawData.config) {
      const newConfig = deepMerge(currentMonitor.config ?? {}, rawData.config);
      updatePayload.config = newConfig;
    }

    // Handle partial update for 'alertConfig'
    if (rawData.alertConfig) {
      const newAlertConfig = deepMerge(currentMonitor.alertConfig ?? {}, rawData.alertConfig);
      updatePayload.alertConfig = newAlertConfig;
    }

    if (rawData.status) {
      updatePayload.status = rawData.status;
    }

    const [updatedMonitor] = await db
      .update(monitors)
      .set(updatePayload)
      .where(eq(monitors.id, id))
      .returning();

    if (!updatedMonitor) {
      return NextResponse.json({ error: "Failed to update monitor" }, { status: 404 });
    }

    return NextResponse.json(updatedMonitor);
  } catch (error) {
    console.error(`Error partially updating monitor ${id}:`, error);
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
} 