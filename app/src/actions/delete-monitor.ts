"use server";

import { db } from "@/utils/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireProjectContext } from "@/lib/project-context";
import { hasPermission } from "@/lib/rbac/middleware";
import { logAuditEvent } from "@/lib/audit-logger";
import { deleteScheduledMonitor } from "@/lib/monitor-scheduler";
import { createS3CleanupService } from "@/lib/s3-cleanup";

type MonitorDeletionResult = {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
};

export async function deleteMonitor(
  monitorId: string
): Promise<MonitorDeletionResult> {
  if (!monitorId) {
    console.error("[DELETE_MONITOR] Error: Monitor ID is required");
    return {
      success: false,
      error: "Monitor ID is required",
    };
  }

  try {
    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check DELETE_MONITORS permission
    const canDeleteMonitors = await hasPermission("monitor", "delete", {
      organizationId,
      projectId: project.id,
    });

    if (!canDeleteMonitors) {
      console.warn(
        `[DELETE_MONITOR] User ${userId} attempted to delete monitor ${monitorId} without permission`
      );
      return {
        success: false,
        error: "Insufficient permissions to delete monitors",
      };
    }

    // Perform the deletion within a transaction
    const transactionResult = await db.transaction(async (tx) => {
      // Verify monitor belongs to current project before deletion - get details for audit
      const existingMonitor = await tx
        .select({
          id: monitors.id,
          name: monitors.name,
          type: monitors.type,
          target: monitors.target,
        })
        .from(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            eq(monitors.projectId, project.id),
            eq(monitors.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existingMonitor.length === 0) {
        return {
          success: false,
          error: "Monitor not found or access denied",
        };
      }

      const monitorData = existingMonitor[0];

      // Collect all monitor results with S3 reports that need cleanup
      const resultsWithReports = await tx
        .select({
          id: monitorResults.id,
          testExecutionId: monitorResults.testExecutionId,
          testReportS3Url: monitorResults.testReportS3Url,
        })
        .from(monitorResults)
        .where(eq(monitorResults.monitorId, monitorId));

      // Filter results that have S3 reports
      const reportsToDelete = resultsWithReports.filter(
        (result) => result.testReportS3Url || result.testExecutionId
      );

      // Delete monitor results from database
      const deletedResults = await tx
        .delete(monitorResults)
        .where(eq(monitorResults.monitorId, monitorId))
        .returning({ id: monitorResults.id });

      // Delete the monitor (with project scoping for extra safety)
      const deletedMonitors = await tx
        .delete(monitors)
        .where(
          and(
            eq(monitors.id, monitorId),
            eq(monitors.projectId, project.id),
            eq(monitors.organizationId, organizationId)
          )
        )
        .returning({ id: monitors.id });

      if (deletedMonitors.length === 0) {
        throw new Error(
          `Failed to delete monitor ${monitorId} - no rows affected`
        );
      }

      return {
        success: true,
        monitorData,
        reportsToDelete,
        deletedResults: deletedResults.length,
      };
    });

    // Handle cleanup tasks outside the transaction
    if (transactionResult.success && "monitorData" in transactionResult) {
      console.log(
        "[DELETE_MONITOR] Transaction successful, starting cleanup tasks..."
      );

      // Unschedule the monitor from Redis to stop execution
      try {
        console.log("[DELETE_MONITOR] Unscheduling monitor from Redis...");
        await deleteScheduledMonitor(monitorId);
        console.log(
          `[DELETE_MONITOR] Successfully unscheduled monitor ${monitorId}`
        );
      } catch (scheduleError) {
        console.error(
          "[DELETE_MONITOR] Error unscheduling monitor (monitor still deleted):",
          scheduleError
        );
        // Continue with other cleanup even if unscheduling fails
      }

      // S3 cleanup - delete all report files from S3
      if (
        transactionResult.reportsToDelete &&
        transactionResult.reportsToDelete.length > 0
      ) {
        try {
          console.log(
            `[DELETE_MONITOR] Starting S3 cleanup for ${transactionResult.reportsToDelete.length} reports...`
          );
          const s3Service = createS3CleanupService();

          // Delete each report from S3
          const s3DeletionResults = {
            success: true,
            deletedObjects: [] as string[],
            failedObjects: [] as { key: string; error: string }[],
          };

          for (const report of transactionResult.reportsToDelete) {
            try {
              if (report.testReportS3Url) {
                // Extract the directory path from S3 URL
                // URL format: http://localhost:9000/playwright-test-artifacts/TEST_ID-EXECUTION_ID/report/index.html
                // We need to delete the entire TEST_ID-EXECUTION_ID/ directory
                const url = new URL(report.testReportS3Url);
                const pathParts = url.pathname.split("/").filter(Boolean);

                if (pathParts.length > 1) {
                  // pathParts = ['playwright-test-artifacts', 'TEST_ID-EXECUTION_ID', 'report', 'index.html']
                  // We want 'TEST_ID-EXECUTION_ID' which is pathParts[1]
                  const executionDir = pathParts[1]; // e.g., '0919b158-cb47-4421-842d-a880683559d2-59ecd077'
                  console.log(
                    `[DELETE_MONITOR] Deleting S3 directory: ${executionDir}/`
                  );

                  // Delete the entire directory by using reportPath
                  const result = await s3Service.deleteReports([
                    {
                      reportPath: executionDir, // This will trigger directory expansion in S3 service
                      entityId: monitorId,
                      entityType: "monitor", // Synthetic monitors use monitor bucket
                    },
                  ]);

                  if (result.success) {
                    s3DeletionResults.deletedObjects.push(
                      ...result.deletedObjects
                    );
                  } else {
                    s3DeletionResults.failedObjects.push(
                      ...result.failedObjects
                    );
                    s3DeletionResults.success = false;
                  }
                }
              } else if (report.testExecutionId) {
                // If we only have execution ID, try to delete by path pattern
                console.log(
                  `[DELETE_MONITOR] Attempting to delete report for execution ID: ${report.testExecutionId}`
                );
                const result = await s3Service.deleteReports([
                  {
                    reportPath: report.testExecutionId,
                    entityId: monitorId,
                    entityType: "monitor",
                  },
                ]);

                if (result.success) {
                  s3DeletionResults.deletedObjects.push(
                    ...result.deletedObjects
                  );
                } else {
                  s3DeletionResults.failedObjects.push(...result.failedObjects);
                  s3DeletionResults.success = false;
                }
              }
            } catch (reportError) {
              const errorMsg =
                reportError instanceof Error
                  ? reportError.message
                  : String(reportError);
              console.error(
                `[DELETE_MONITOR] Error deleting report ${report.id}:`,
                errorMsg
              );
              s3DeletionResults.failedObjects.push({
                key:
                  report.testReportS3Url || report.testExecutionId || report.id,
                error: errorMsg,
              });
              s3DeletionResults.success = false;
            }
          }

          if (s3DeletionResults.success) {
            console.log(
              `[DELETE_MONITOR] S3 cleanup successful: ${s3DeletionResults.deletedObjects.length} objects deleted`
            );
          } else {
            console.warn(
              `[DELETE_MONITOR] S3 cleanup partially failed: ${s3DeletionResults.deletedObjects.length} succeeded, ${s3DeletionResults.failedObjects.length} failed`
            );
            for (const failed of s3DeletionResults.failedObjects) {
              console.warn(
                `[DELETE_MONITOR] S3 deletion failed for ${failed.key}: ${failed.error}`
              );
            }
          }
        } catch (s3Error) {
          console.error(
            "[DELETE_MONITOR] S3 cleanup failed (monitor still deleted):",
            s3Error
          );
        }
      } else {
        console.log("[DELETE_MONITOR] No S3 reports to clean up");
      }

      // Log the audit event for monitor deletion
      await logAuditEvent({
        userId,
        organizationId,
        action: "monitor_deleted",
        resource: "monitor",
        resourceId: monitorId,
        metadata: {
          monitorName: transactionResult.monitorData?.name,
          monitorType: transactionResult.monitorData?.type,
          target: transactionResult.monitorData?.target,
          projectId: project.id,
          projectName: project.name,
          resultsDeleted: transactionResult.deletedResults,
          reportsDeleted: transactionResult.reportsToDelete?.length || 0,
        },
        success: true,
      }).catch((auditError) => {
        console.error(
          "[DELETE_MONITOR] Error logging audit event (monitor still deleted):",
          auditError
        );
      });

      // Revalidate paths
      try {
        console.log("[DELETE_MONITOR] Revalidating paths...");
        revalidatePath("/monitors");
        revalidatePath("/");
        console.log("[DELETE_MONITOR] Paths revalidated successfully");
      } catch (revalidateError) {
        console.error(
          "[DELETE_MONITOR] Error revalidating paths (monitor still deleted):",
          revalidateError
        );
      }

      console.log(
        `[DELETE_MONITOR] Successfully deleted monitor ${monitorId} with ${
          transactionResult.deletedResults
        } results and ${transactionResult.reportsToDelete?.length || 0} reports`
      );

      return {
        success: true,
        message: `Monitor "${
          transactionResult.monitorData?.name || "Unknown"
        }" has been deleted.`,
      };
    } else if (!transactionResult.success) {
      return {
        success: false,
        error: transactionResult.error,
      };
    }

    return {
      success: false,
      error: "Unexpected transaction result",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DELETE_MONITOR] Unexpected error:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : "No stack available",
    });

    return {
      success: false,
      error: errorMessage,
      details: "Check server logs for more information",
    };
  }
}
