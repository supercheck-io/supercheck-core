"use server";

import { db } from "@/utils/db";
import { statusPageComponentGroups } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectContext } from "@/lib/project-context";
import { requirePermissions } from "@/lib/rbac/middleware";
import { logAuditEvent } from "@/lib/audit-logger";

const updateComponentGroupSchema = z.object({
  id: z.string().uuid(),
  statusPageId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(255).optional(),
  description: z.string().optional().nullable(),
  position: z.number().int().optional(),
});

export type UpdateComponentGroupData = z.infer<
  typeof updateComponentGroupSchema
>;

export async function updateComponentGroup(data: UpdateComponentGroupData) {
  console.log(
    `Updating component group ${data.id} with data:`,
    JSON.stringify(data, null, 2)
  );

  try {
    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check status page management permission
    try {
      await requirePermissions(
        {
          status_page: ["update"],
        },
        {
          organizationId,
          projectId: project.id,
        }
      );
    } catch (error) {
      console.warn(
        `User ${userId} attempted to update component group without permission:`,
        error
      );
      return {
        success: false,
        message: "Insufficient permissions to update component groups",
      };
    }

    // Validate the data
    const validatedData = updateComponentGroupSchema.parse(data);

    try {
      // Build update object with only provided fields
      const updateData: Partial<typeof statusPageComponentGroups.$inferInsert> =
        {
          updatedAt: new Date(),
        };

      if (validatedData.name !== undefined)
        updateData.name = validatedData.name;
      if (validatedData.description !== undefined)
        updateData.description = validatedData.description;
      if (validatedData.position !== undefined)
        updateData.position = validatedData.position;

      // Update the component group
      const [componentGroup] = await db
        .update(statusPageComponentGroups)
        .set(updateData)
        .where(eq(statusPageComponentGroups.id, validatedData.id))
        .returning();

      console.log(
        `Component group ${componentGroup.id} updated successfully by user ${userId}`
      );

      // Log the audit event
      await logAuditEvent({
        userId,
        action: "component_group_updated",
        resource: "status_page_component_group",
        resourceId: componentGroup.id,
        metadata: {
          organizationId,
          componentGroupName: componentGroup.name,
          statusPageId: validatedData.statusPageId,
          projectId: project.id,
          projectName: project.name,
        },
        success: true,
      });

      // Revalidate the status page
      revalidatePath(`/status-pages/${validatedData.statusPageId}`);

      return {
        success: true,
        message: "Component group updated successfully",
        componentGroup,
      };
    } catch (dbError) {
      console.error("Database error:", dbError);
      return {
        success: false,
        message: `Failed to update component group: ${
          dbError instanceof Error ? dbError.message : String(dbError)
        }`,
        error: dbError,
      };
    }
  } catch (validationError) {
    console.error("Validation error:", validationError);
    return {
      success: false,
      message: "Invalid data provided",
      error: validationError,
    };
  }
}
