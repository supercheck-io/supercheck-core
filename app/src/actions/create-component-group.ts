"use server";

import { db } from "@/utils/db";
import { statusPageComponentGroups } from "@/db/schema/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectContext } from "@/lib/project-context";
import { requirePermissions } from "@/lib/rbac/middleware";
import { logAuditEvent } from "@/lib/audit-logger";

const createComponentGroupSchema = z.object({
  statusPageId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  position: z.number().int().default(0),
});

export type CreateComponentGroupData = z.infer<
  typeof createComponentGroupSchema
>;

export async function createComponentGroup(data: CreateComponentGroupData) {
  console.log(
    `Creating component group with data:`,
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
        `User ${userId} attempted to create component group without permission:`,
        error
      );
      return {
        success: false,
        message: "Insufficient permissions to create component groups",
      };
    }

    // Validate the data
    const validatedData = createComponentGroupSchema.parse(data);

    try {
      // Create the component group
      const [componentGroup] = await db
        .insert(statusPageComponentGroups)
        .values({
          statusPageId: validatedData.statusPageId,
          name: validatedData.name,
          description: validatedData.description || null,
          position: validatedData.position,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      console.log(
        `Component group ${componentGroup.id} created successfully by user ${userId}`
      );

      // Log the audit event
      await logAuditEvent({
        userId,
        action: "component_group_created",
        resource: "status_page_component_group",
        resourceId: componentGroup.id,
        metadata: {
          organizationId,
          componentGroupName: validatedData.name,
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
        message: "Component group created successfully",
        componentGroup,
      };
    } catch (dbError) {
      console.error("Database error:", dbError);
      return {
        success: false,
        message: `Failed to create component group: ${
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
