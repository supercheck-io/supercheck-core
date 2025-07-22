"use server";

import { db } from "../utils/db";
import { jobs, jobTests, runs } from "../db/schema/schema";
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

    // Check if the job exists before attempting deletion
    const existingJob = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (existingJob.length === 0) {
      return {
        success: false,
        error: "Job not found",
      };
    }

    // First delete any test runs associated with this job
    await db.delete(runs).where(eq(runs.jobId, jobId));

    // Then delete the job-test associations
    await db.delete(jobTests).where(eq(jobTests.jobId, jobId));

    // Finally delete the job itself
    await db.delete(jobs).where(eq(jobs.id, jobId));

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
