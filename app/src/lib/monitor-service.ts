import { db } from '@/utils/db';
import { monitors as monitorTable, monitorsInsertSchema, MonitorConfig, MonitorType as DBMoniotorType, MonitorStatus as DBMonitorStatus } from '@/db/schema/schema';
import { MonitorJobData } from '@/lib/queue';
import { scheduleMonitor, deleteScheduledMonitor } from '@/lib/monitor-scheduler';
import { eq } from 'drizzle-orm';
import { NextApiRequest, NextApiResponse } from 'next'; // For conceptual typing

// This is a conceptual service layer, actual Next.js API routes would call these functions.

interface MonitorApiData {
  name: string;
  description?: string | null;
  type: DBMoniotorType;
  target: string;
  frequencyMinutes: number;
  enabled?: boolean;
  config?: MonitorConfig | null;
  alertConfig?: any; // Alert configuration for notifications
  organizationId?: string; // Optional for now, will be required when organizations are implemented
  createdByUserId?: string; // Assuming this comes from authenticated session
}

export async function createMonitorHandler(data: MonitorApiData) {
  const validation = monitorsInsertSchema.safeParse(data);
  if (!validation.success) {
    throw { statusCode: 400, message: 'Invalid monitor data', errors: validation.error.flatten() };
  }

  const validatedData = validation.data;

  // Explicitly map fields to ensure only valid columns are passed
  const newMonitorData = {
    name: validatedData.name,
    description: validatedData.description,
    type: validatedData.type as DBMoniotorType,
    target: validatedData.target,
    frequencyMinutes: validatedData.frequencyMinutes,
    config: validatedData.config,
    alertConfig: validatedData.alertConfig,
    organizationId: validatedData.organizationId || null,
    createdByUserId: validatedData.createdByUserId,
    status: (validatedData.enabled === false ? 'paused' : 'pending') as DBMonitorStatus,
    // id, createdAt, updatedAt are typically auto-generated or set by DB/Drizzle
  };

  const [newMonitor] = await db
    .insert(monitorTable)
    .values(newMonitorData) // Use the explicitly mapped data
    .returning();

  if (newMonitor && validatedData.enabled !== false && newMonitor.frequencyMinutes > 0) { // Use validatedData.enabled here
    const jobDataPayload: MonitorJobData = {
      monitorId: newMonitor.id,
      type: newMonitor.type as MonitorJobData['type'],
      target: newMonitor.target,
      config: newMonitor.config as any,
      frequencyMinutes: newMonitor.frequencyMinutes,
    };
    try {
      const schedulerId = await scheduleMonitor({
        monitorId: newMonitor.id,
        frequencyMinutes: newMonitor.frequencyMinutes,
        jobData: jobDataPayload,
        retryLimit: 3
      });
      
      // Update monitor with scheduler ID (like jobs do)
      await db
        .update(monitorTable)
        .set({ scheduledJobId: schedulerId })
        .where(eq(monitorTable.id, newMonitor.id));
        
    } catch (scheduleError) {
      console.error(`Failed to schedule monitor ${newMonitor.id} after creation:`, scheduleError);
      // Decide if this should be a hard error or just logged
    }
  }
  return newMonitor;
}

export async function updateMonitorHandler(monitorId: string, data: Partial<MonitorApiData>) {
  // Fetch existing monitor to compare old frequency/enabled status
  const existingMonitor = await db.query.monitors.findFirst({
    where: eq(monitorTable.id, monitorId),
  });

  if (!existingMonitor) {
    throw { statusCode: 404, message: 'Monitor not found' };
  }

  // Create a payload with only the fields present in 'data' that are valid for update
  const updateData: Partial<typeof monitorTable.$inferInsert> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.type !== undefined) updateData.type = data.type as DBMoniotorType;
  if (data.target !== undefined) updateData.target = data.target;
  if (data.frequencyMinutes !== undefined) updateData.frequencyMinutes = data.frequencyMinutes;
  if (data.config !== undefined) updateData.config = data.config;
  if (data.alertConfig !== undefined) updateData.alertConfig = data.alertConfig;
  // Do not include organizationId or createdByUserId in updates usually, unless specifically intended

  updateData.updatedAt = new Date();

  // Handle status based on 'enabled'
  if (data.enabled === false) {
    updateData.status = 'paused' as DBMonitorStatus;
  } else if (data.enabled === true && existingMonitor.status === 'paused') {
    updateData.status = 'pending' as DBMonitorStatus;
  }

  const [updatedMonitor] = await db
    .update(monitorTable)
    .set(updateData) // Use the filtered updateData
    .where(eq(monitorTable.id, monitorId))
    .returning();

  if (!updatedMonitor) {
    throw { statusCode: 404, message: 'Monitor not found after update attempt' };
  }

  // Handle re-scheduling or unscheduling (like jobs do)
  const shouldReschedule = 
    (data.frequencyMinutes !== undefined && data.frequencyMinutes !== existingMonitor.frequencyMinutes) ||
    (data.enabled !== undefined && data.enabled !== existingMonitor.enabled);

  if (shouldReschedule) {
    // Remove existing schedule if any
    if (existingMonitor.scheduledJobId) {
      try {
        await deleteScheduledMonitor(existingMonitor.scheduledJobId);
      } catch (deleteError) {
        console.error(`Error deleting previous scheduler ${existingMonitor.scheduledJobId}:`, deleteError);
      }
    }

    if (updatedMonitor.enabled && updatedMonitor.frequencyMinutes > 0) {
      const jobDataPayload: MonitorJobData = {
        monitorId: updatedMonitor.id,
        type: updatedMonitor.type as MonitorJobData['type'],
        target: updatedMonitor.target,
        config: updatedMonitor.config as any,
        frequencyMinutes: updatedMonitor.frequencyMinutes,
      };
      try {
        const schedulerId = await scheduleMonitor({
          monitorId: updatedMonitor.id,
          frequencyMinutes: updatedMonitor.frequencyMinutes,
          jobData: jobDataPayload,
          retryLimit: 3
        });
        
        // Update monitor with new scheduler ID
        await db
          .update(monitorTable)
          .set({ scheduledJobId: schedulerId })
          .where(eq(monitorTable.id, updatedMonitor.id));
          
      } catch (scheduleError) {
        console.error(`Failed to re-schedule monitor ${updatedMonitor.id} after update:`, scheduleError);
      }
    } else {
      // Clear scheduler ID if disabled or frequency is 0
      await db
        .update(monitorTable)
        .set({ scheduledJobId: null })
        .where(eq(monitorTable.id, updatedMonitor.id));
    }
  }
  return updatedMonitor;
}

export async function deleteMonitorHandler(monitorId: string) {
  // Remove scheduled job first (like jobs do)
  const monitor = await db.query.monitors.findFirst({
    where: eq(monitorTable.id, monitorId),
  });

  if (monitor?.scheduledJobId) {
    try {
      await deleteScheduledMonitor(monitor.scheduledJobId);
    } catch (scheduleError) {
      console.warn(`Could not remove schedule for monitor ${monitorId} during deletion:`, scheduleError);
      // Continue with deletion even if unscheduling fails
    }
  }

  const [deletedMonitor] = await db
    .delete(monitorTable)
    .where(eq(monitorTable.id, monitorId))
    .returning();
  
  if (!deletedMonitor) {
    throw { statusCode: 404, message: 'Monitor not found for deletion' };
  }
  return deletedMonitor;
} 