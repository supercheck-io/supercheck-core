"use server";

import { db } from "../db/client";
import { jobs, jobTests, testRuns } from "../db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteJob(jobId: string) {
  try {
    console.log("Deleting job with ID:", jobId);

    if (!jobId) {
      return {
        success: false,
        error: "Job ID is required",
      };
    }

    const dbInstance = await db();

    // First delete any test runs associated with this job
    await dbInstance.delete(testRuns).where(eq(testRuns.jobId, jobId));

    // Then delete the job-test associations
    await dbInstance.delete(jobTests).where(eq(jobTests.jobId, jobId));

    // Finally delete the job itself
    const result = await dbInstance.delete(jobs).where(eq(jobs.id, jobId));

    if (result.rowsAffected === 0) {
      return {
        success: false,
        error: "Job not found",
      };
    }

    // Revalidate the jobs path to ensure UI is updated
    revalidatePath("/jobs");

    return {
      success: true,
      message: "Job deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting job:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete job",
    };
  }
}
