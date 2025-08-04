"use server";

import { db } from "../utils/db";
import { tests, jobTests } from "../db/schema/schema";
import { eq, count, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireProjectContext } from "@/lib/project-context";
import { buildPermissionContext, hasPermission } from "@/lib/rbac/middleware";
import { ProjectPermission } from "@/lib/rbac/permissions";
import { logAuditEvent } from "@/lib/audit-logger";

export async function deleteTest(testId: string) {
  try {
    console.log("Deleting test with ID:", testId);

    if (!testId) {
      return {
        success: false,
        error: "Test ID is required",
      };
    }

    // Get current project context (includes auth verification)
    const { userId, project, organizationId } = await requireProjectContext();

    // Check DELETE_TESTS permission
    const permissionContext = await buildPermissionContext(
      userId,
      'project',
      organizationId,
      project.id
    );
    
    const canDeleteTests = await hasPermission(permissionContext, ProjectPermission.DELETE_TESTS);
    
    if (!canDeleteTests) {
      console.warn(`User ${userId} attempted to delete test ${testId} without DELETE_TESTS permission`);
      return {
        success: false,
        error: "Insufficient permissions to delete tests",
      };
    }

    // First verify the test exists and belongs to current project - get details for audit
    const existingTest = await db
      .select({ 
        id: tests.id, 
        title: tests.title,
        type: tests.type,
        priority: tests.priority
      })
      .from(tests)
      .where(and(
        eq(tests.id, testId),
        eq(tests.projectId, project.id),
        eq(tests.organizationId, organizationId)
      ))
      .limit(1);

    if (existingTest.length === 0) {
      return {
        success: false,
        error: "Test not found or access denied",
        errorCode: 404,
      };
    }

    // Check if the test is associated with any jobs
    const jobCountResult = await db
      .select({ count: count() })
      .from(jobTests)
      .where(eq(jobTests.testId, testId));

    const jobCount = jobCountResult[0]?.count ?? 0;

    if (jobCount > 0) {
      return {
        success: false,
        error:
          "Test cannot be deleted because it is currently used in one or more jobs. Please remove it from the jobs first.",
        errorCode: 409,
      };
    }

    // Delete the test if not associated with any jobs (with project scoping for extra safety)
    const result = await db.delete(tests).where(and(
      eq(tests.id, testId),
      eq(tests.projectId, project.id),
      eq(tests.organizationId, organizationId)
    )).returning();

    if (result.length === 0) {
      return {
        success: false,
        error: "Test not found",
        errorCode: 404,
      };
    }

    // Log the audit event for test deletion
    await logAuditEvent({
      userId,
      organizationId,
      action: 'test_deleted',
      resource: 'test',
      resourceId: testId,
      metadata: {
        testTitle: existingTest[0].title,
        testType: existingTest[0].type,
        testPriority: existingTest[0].priority,
        projectId: project.id,
        projectName: project.name
      },
      success: true
    });

    // Revalidate the tests path to ensure UI is updated
    revalidatePath("/tests");
    // Also revalidate the jobs path as it might show test information
    revalidatePath("/jobs");

    console.log(`Successfully deleted test ${testId} from project ${project.name} by user ${userId}`);

    return {
      success: true,
      message: "Test deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting test:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete test",
    };
  }
}
