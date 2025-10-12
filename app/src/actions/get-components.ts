"use server";

import { db } from "@/utils/db";
import { statusPageComponents, monitors } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { requireProjectContext } from "@/lib/project-context";

export async function getComponents(statusPageId: string) {
  try {
    // Get current project context (includes auth verification)
    await requireProjectContext();

    // Get all components for the status page, including linked monitor data
    const components = await db.query.statusPageComponents.findMany({
      where: eq(statusPageComponents.statusPageId, statusPageId),
      orderBy: (components, { asc }) => [
        asc(components.position),
        asc(components.createdAt),
      ],
      with: {
        // Include monitor data if linked
      },
    });

    // Also fetch monitor names separately since we need them for display
    const componentsWithMonitors = await Promise.all(
      components.map(async (component) => {
        if (component.monitorId) {
          const monitor = await db.query.monitors.findFirst({
            where: eq(monitors.id, component.monitorId),
            columns: {
              id: true,
              name: true,
              type: true,
              status: true,
              target: true,
            },
          });
          return {
            ...component,
            monitor,
          };
        }
        return {
          ...component,
          monitor: null,
        };
      })
    );

    return {
      success: true,
      components: componentsWithMonitors,
    };
  } catch (error) {
    console.error("Error fetching components:", error);
    return {
      success: false,
      message: "Failed to fetch components",
      error,
      components: [],
    };
  }
}
