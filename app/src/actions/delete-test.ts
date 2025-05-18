"use server";

import { db } from "../lib/db";
import { tests, jobTests } from "../db/schema/schema";
import { eq, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteTest(testId: string) {
  try {
    console.log("Deleting test with ID:", testId);

    if (!testId) {
      return {
        success: false,
        error: "Test ID is required",
      };
    }

    const dbInstance = await db();

    // Check if the test is associated with any jobs
    const jobCountResult = await dbInstance
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

    // Delete the test if not associated with any jobs
    const result = await dbInstance.delete(tests).where(eq(tests.id, testId)).returning();

    if (result.length === 0) {
      return {
        success: false,
        error: "Test not found",
        errorCode: 404,
      };
    }

    // Revalidate the tests path to ensure UI is updated
    revalidatePath("/tests");
    // Also revalidate the jobs path as it might show test information
    revalidatePath("/jobs");

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
