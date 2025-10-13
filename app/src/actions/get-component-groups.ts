"use server";

import { db } from "@/utils/db";
import { statusPageComponentGroups } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { requireProjectContext } from "@/lib/project-context";

export async function getComponentGroups(statusPageId: string) {
  try {
    // Get current project context (includes auth verification)
    await requireProjectContext();

    // Get all component groups for the status page
    const componentGroups = await db.query.statusPageComponentGroups.findMany({
      where: eq(statusPageComponentGroups.statusPageId, statusPageId),
      orderBy: (groups, { asc }) => [asc(groups.position), asc(groups.createdAt)],
    });

    return {
      success: true,
      componentGroups,
    };
  } catch (error) {
    console.error("Error fetching component groups:", error);
    return {
      success: false,
      message: "Failed to fetch component groups",
      error,
      componentGroups: [],
    };
  }
}
