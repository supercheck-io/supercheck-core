import { NextRequest, NextResponse } from "next/server";
import { db as getDbInstance } from "@/lib/db";
import { monitors, monitorResults, monitorsUpdateSchema } from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";
import { scheduleMonitorCheck, removeScheduledMonitorCheck } from "@/lib/monitor-scheduler";
import { MonitorJobData } from "@/lib/queue";

const RECENT_RESULTS_LIMIT = 20; // Number of recent results to fetch

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const db = await getDbInstance();
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

    return NextResponse.json({ ...monitor, recentResults });
  } catch (error) {
    console.error(`Error fetching monitor ${id}:`, error);
    return NextResponse.json({ error: "Failed to fetch monitor data" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const db = await getDbInstance();

    const currentMonitor = await db.query.monitors.findFirst({ where: eq(monitors.id, id) });
    if (!currentMonitor) {
        return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    const [updatedMonitor] = await db
      .update(monitors)
      .set({...updateData, updatedAt: new Date()})
      .where(eq(monitors.id, id))
      .returning();

    if (!updatedMonitor) {
      // Should not happen if currentMonitor was found, but as a safeguard
      return NextResponse.json({ error: "Failed to update monitor, monitor not found after update." }, { status: 404 });
    }

    // Handle rescheduling if frequencyMinutes changed
    const oldFrequency = currentMonitor.frequencyMinutes;
    const newFrequency = updatedMonitor.frequencyMinutes;

    if (oldFrequency !== newFrequency) {
        const jobData: MonitorJobData = {
            monitorId: updatedMonitor.id,
            type: updatedMonitor.type as MonitorJobData['type'],
            target: updatedMonitor.target,
            config: updatedMonitor.config as any,
            frequencyMinutes: newFrequency ?? undefined, // Use undefined if null
        };

        if (newFrequency && newFrequency > 0) {
            console.log(`Rescheduling monitor ${id} from ${oldFrequency} to ${newFrequency} minutes.`);
            await scheduleMonitorCheck({ monitorId: id, frequencyMinutes: newFrequency, jobData });
        } else if (oldFrequency && oldFrequency > 0) { // Was scheduled, now needs to be unscheduled
            console.log(`Unscheduling monitor ${id} as frequency changed to ${newFrequency}.`);
            await removeScheduledMonitorCheck(id);
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
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const db = await getDbInstance();
    
    // First, unschedule the monitor
    try {
        await removeScheduledMonitorCheck(id);
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

// PATCH handler can be removed if PUT handles all updates, or implement specific partial updates.
// For now, removing the mock PATCH. 