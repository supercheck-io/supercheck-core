"use server";

import { db } from "@/utils/db";
import { statusPageComponents } from "@/db/schema/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProjectContext } from "@/lib/project-context";
import { requireBetterAuthPermission } from "@/lib/rbac/middleware";
import { logAuditEvent } from "@/lib/audit-logger";

const createComponentSchema = z.object({
  statusPageId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  componentGroupId: z.string().uuid().optional().nullable(),
  monitorId: z.string().uuid().optional().nullable(),
  status: z.enum(["operational", "degraded_performance", "partial_outage", "major_outage", "under_maintenance"]).default("operational"),
  showcase: z.boolean().default(true),
  onlyShowIfDegraded: z.boolean().default(false),
  position: z.number().int().default(0),
});

export type CreateComponentData = z.infer<typeof createComponentSchema>;

export async function createComponent(data: CreateComponentData) {
  console.log(`Creating component with data:`, JSON.stringify(data, null, 2));

  try {
    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check status page management permission
    try {
      await requireBetterAuthPermission({
        status_page: ["update"],
      });
    } catch (error) {
      console.warn(
        `User ${userId} attempted to create component without permission:`,
        error
      );
      return {
        success: false,
        message: "Insufficient permissions to create components",
      };
    }

    // Validate the data
    const validatedData = createComponentSchema.parse(data);

    try {
      // Create the component
      const [component] = await db.insert(statusPageComponents).values({
        statusPageId: validatedData.statusPageId,
        name: validatedData.name,
        description: validatedData.description || null,
        componentGroupId: validatedData.componentGroupId || null,
        monitorId: validatedData.monitorId || null,
        status: validatedData.status,
        showcase: validatedData.showcase,
        onlyShowIfDegraded: validatedData.onlyShowIfDegraded,
        position: validatedData.position,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      console.log(
        `Component ${component.id} created successfully by user ${userId} in status page ${validatedData.statusPageId}`
      );

      // Log the audit event
      await logAuditEvent({
        userId,
        action: "component_created",
        resource: "status_page_component",
        resourceId: component.id,
        metadata: {
          organizationId,
          componentName: validatedData.name,
          statusPageId: validatedData.statusPageId,
          projectId: project.id,
          projectName: project.name,
          monitorId: validatedData.monitorId,
        },
        success: true,
      });

      // Revalidate the status page
      revalidatePath(`/status-pages/${validatedData.statusPageId}`);
      revalidatePath(`/status-pages/${validatedData.statusPageId}/public`);

      return {
        success: true,
        message: "Component created successfully",
        component,
      };
    } catch (dbError) {
      console.error("Database error:", dbError);
      return {
        success: false,
        message: `Failed to create component: ${
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
