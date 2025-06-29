"use server";

import { db } from "@/lib/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteMonitor(monitorId: string) {
  try {
    console.log("Deleting monitor with ID:", monitorId);

    if (!monitorId) {
      return {
        success: false,
        error: "Monitor ID is required",
      };
    }

    const dbInstance = db;

    // Delete related monitor results first (due to foreign key constraint)
    await dbInstance.delete(monitorResults).where(eq(monitorResults.monitorId, monitorId));
    
    // Delete the monitor
    const result = await dbInstance.delete(monitors).where(eq(monitors.id, monitorId));
    
    console.log(`Successfully deleted monitor ${monitorId}`);
    
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