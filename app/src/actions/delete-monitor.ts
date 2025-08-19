"use server";

import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireProjectContext } from "@/lib/project-context";
import { hasPermission } from "@/lib/rbac/middleware";
import { logAuditEvent } from "@/lib/audit-logger";

export async function deleteMonitor(monitorId: string) {
  try {
    console.log("Deleting monitor with ID:", monitorId);

    if (!monitorId) {
      return {
        success: false,
        error: "Monitor ID is required",
      };
    }

    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check DELETE_MONITORS permission
    const canDeleteMonitors = await hasPermission('monitor', 'delete', { organizationId, projectId: project.id });
    
    if (!canDeleteMonitors) {
      console.warn(`User ${userId} attempted to delete monitor ${monitorId} without DELETE_MONITORS permission`);
      return {
        success: false,
        error: "Insufficient permissions to delete monitors",
      };
    }

    const dbInstance = db;

    // Verify monitor belongs to current project before deletion - get details for audit
    const monitorExists = await dbInstance
      .select({ 
        id: monitors.id, 
        name: monitors.name,
        type: monitors.type,
        target: monitors.target 
      })
      .from(monitors)
      .where(and(
        eq(monitors.id, monitorId),
        eq(monitors.projectId, project.id),
        eq(monitors.organizationId, organizationId)
      ))
      .limit(1);

    if (monitorExists.length === 0) {
      return {
        success: false,
        error: "Monitor not found or access denied",
      };
    }

    // Delete related monitor results first (due to foreign key constraint)
    await dbInstance.delete(monitorResults).where(eq(monitorResults.monitorId, monitorId));
    
    // Delete the monitor (with project scoping for extra safety)
    await dbInstance.delete(monitors).where(and(
      eq(monitors.id, monitorId),
      eq(monitors.projectId, project.id),
      eq(monitors.organizationId, organizationId)
    ));
    
    // Log the audit event for monitor deletion
    await logAuditEvent({
      userId,
      organizationId,
      action: 'monitor_deleted',
      resource: 'monitor',
      resourceId: monitorId,
      metadata: {
        monitorName: monitorExists[0].name,
        monitorType: monitorExists[0].type,
        target: monitorExists[0].target,
        projectId: project.id,
        projectName: project.name
      },
      success: true
    });
    
    console.log(`Successfully deleted monitor ${monitorId} from project ${project.name} by user ${userId}`);
    
    // Revalidate the monitors page
    revalidatePath("/monitors");
    
    return {
      success: true,
    };
    
  } catch (error) {
    console.error("Error deleting monitor:", error);
    return {
      success: false,
      error: "Failed to delete monitor",
    };
  }
} 