"use server";

import { db } from "@/utils/db";
import { statusPages } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { requireProjectContext } from "@/lib/project-context";

export async function getStatusPage(id: string) {
  try {
    // Get current project context (includes auth verification)
    await requireProjectContext();

    // Get the status page
    const statusPage = await db.query.statusPages.findFirst({
      where: eq(statusPages.id, id),
    });

    if (!statusPage) {
      return {
        success: false,
        message: "Status page not found",
      };
    }

    return {
      success: true,
      statusPage,
    };
  } catch (error) {
    console.error("Error fetching status page:", error);
    return {
      success: false,
      message: "Failed to fetch status page",
      error,
    };
  }
}
