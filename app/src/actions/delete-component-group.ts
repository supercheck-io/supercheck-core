"use server";

import { db } from "@/utils/db";
import { statusPageComponentGroups } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireProjectContext } from "@/lib/project-context";
import { requireBetterAuthPermission } from "@/lib/rbac/middleware";
import { logAuditEvent } from "@/lib/audit-logger";

export async function deleteComponentGroup(id: string, statusPageId: string) {
  console.log(`Deleting component group ${id}`);

  try {
    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check status page management permission
    try {
      await requireBetterAuthPermission({
        status_page: ["delete"],
      });
    } catch (error) {
      console.warn(
        `User ${userId} attempted to delete component group without permission:`,
        error
      );
      return {
        success: false,
        message: "Insufficient permissions to delete component groups",
      };
    }

    try {
      // Get component group details before deletion for audit log
      const componentGroup = await db.query.statusPageComponentGroups.findFirst({
        where: eq(statusPageComponentGroups.id, id),
      });

      if (!componentGroup) {
        return {
          success: false,
          message: "Component group not found",
        };
      }

      // Delete the component group (components will have componentGroupId set to null due to ON DELETE SET NULL)
      await db.delete(statusPageComponentGroups).where(eq(statusPageComponentGroups.id, id));

      console.log(
        `Component group ${id} deleted successfully by user ${userId}`
      );

      // Log the audit event
      await logAuditEvent({
        userId,
        action: "component_group_deleted",
        resource: "status_page_component_group",
        resourceId: id,
        metadata: {
          organizationId,
          componentGroupName: componentGroup.name,
          statusPageId,
          projectId: project.id,
          projectName: project.name,
        },
        success: true,
      });

      // Revalidate the status page
      revalidatePath(`/status-pages/${statusPageId}`);

      return {
        success: true,
        message: "Component group deleted successfully",
      };
    } catch (dbError) {
      console.error("Database error:", dbError);
      return {
        success: false,
        message: `Failed to delete component group: ${
          dbError instanceof Error ? dbError.message : String(dbError)
        }`,
        error: dbError,
      };
    }
  } catch (error) {
    console.error("Error:", error);
    return {
      success: false,
      message: "An error occurred",
      error,
    };
  }
}
