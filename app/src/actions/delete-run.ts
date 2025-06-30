"use server";

import { db } from "../utils/db";
import { runs, reports } from "../db/schema/schema";
import { eq, or, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type DeleteRunResult = {
  success: boolean;
  message: string;
  error?: string;
  details?: string;
};

export async function deleteRun(runId: string): Promise<DeleteRunResult> {
  console.log("[DELETE_RUN] Starting deletion for run:", runId);
  
  if (!runId) {
    console.error("[DELETE_RUN] Error: Run ID is required");
    return {
      success: false,
      message: "Failed to delete run",
      error: "Run ID is required",
    };
  }

  try {
    const dbInstance = await db();
    
    // Perform the deletion within a transaction
    return await dbInstance.transaction(async (tx) => {
      // Check if the run exists
      console.log(`[DELETE_RUN] Checking if run ${runId} exists`);
      const existingRun = await tx
        .select({ id: runs.id })
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);

      if (existingRun.length === 0) {
        console.log(`[DELETE_RUN] Run with ID ${runId} not found`);
        return {
          success: false,
          message: "Failed to delete run",
          error: "Run not found",
        };
      }

      console.log(`[DELETE_RUN] Found run ${runId}, proceeding with deletion`);

      // First check for associated reports
      console.log(`[DELETE_RUN] Checking for associated reports for run ${runId}`);
      const associatedReports = await tx
        .select({ id: reports.id, entityType: reports.entityType })
        .from(reports)
        .where(
          or(
            and(eq(reports.entityId, runId), eq(reports.entityType, "job")),
            and(eq(reports.entityId, runId), eq(reports.entityType, "test"))
          )
        );

      console.log(`[DELETE_RUN] Found ${associatedReports.length} associated reports with types: ${associatedReports.map(r => r.entityType).join(', ')}`);
      
      if (associatedReports.length > 0) {
        // Delete the reports first
        console.log(`[DELETE_RUN] Deleting ${associatedReports.length} reports for run ${runId}`);
        try {
          const deletedReports = await tx
            .delete(reports)
            .where(
              or(
                and(eq(reports.entityId, runId), eq(reports.entityType, "job")),
                and(eq(reports.entityId, runId), eq(reports.entityType, "test"))
              )
            )
            .returning({ id: reports.id });

          console.log(`[DELETE_RUN] Successfully deleted ${deletedReports.length} reports`);
        } catch (reportError) {
          console.error("[DELETE_RUN] Error deleting reports:", reportError);
          throw new Error(`Failed to delete reports: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
        }
      }

      // Now delete the run
      console.log(`[DELETE_RUN] Now deleting run with ID: ${runId}`);
      try {
        const deletedRuns = await tx
          .delete(runs)
          .where(eq(runs.id, runId))
          .returning({ id: runs.id });

        console.log(`[DELETE_RUN] Successfully deleted run with ID: ${runId}, count: ${deletedRuns.length}`);

        if (deletedRuns.length === 0) {
          throw new Error(`Failed to delete run ${runId} - no rows affected`);
        }
        
        // Revalidate paths to ensure UI is updated
        revalidatePath("/runs");
        revalidatePath("/");
        revalidatePath("/jobs");

        return {
          success: true,
          message: `Run deleted successfully (including ${associatedReports.length} reports)`,
        };
      } catch (runError) {
        console.error("[DELETE_RUN] Error deleting run:", runError);
        throw new Error(`Failed to delete run: ${runError instanceof Error ? runError.message : String(runError)}`);
      }
    });
  } catch (error) {
    console.error("[DELETE_RUN] Transaction error:", error);
    
    // More detailed error message for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("[DELETE_RUN] Error details:", {
      message: errorMessage,
      stack: errorStack
    });
    
    return {
      success: false,
      message: "Failed to delete run",
      error: errorMessage,
      details: "Check server logs for more information",
    };
  }
} 