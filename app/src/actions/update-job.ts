"use server";

import { db } from "../db/client";
import { jobs, jobTests } from "../db/schema";
import { eq } from "drizzle-orm";

interface JobData {
  id: string;
  name: string;
  description: string;
  cronSchedule: string;
  tests: { id: string }[];
}

interface UpdateJobResponse {
  success: boolean;
  job?: {
    id: string;
    name: string;
    description: string | null;
    cronSchedule: string | null;
  };
  error?: string;
}

export async function updateJob(
  jobId: string,
  data: JobData
): Promise<UpdateJobResponse> {
  try {
    const dbInstance = await db();

    // Validate required fields
    if (!data.name) {
      return {
        success: false,
        error: "Job name is required",
      };
    }

    if (!data.description) {
      return {
        success: false,
        error: "Job description is required",
      };
    }

    // Update job data
    await dbInstance
      .update(jobs)
      .set({
        name: data.name,
        description: data.description,
        cronSchedule: data.cronSchedule,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // Delete existing job-test associations
    await dbInstance.delete(jobTests).where(eq(jobTests.jobId, jobId));

    // Add new job-test associations
    if (data.tests && data.tests.length > 0) {
      const jobTestValues = data.tests.map((test) => ({
        jobId: jobId,
        testId: test.id,
      }));

      await dbInstance.insert(jobTests).values(jobTestValues);
    }

    return {
      success: true,
      job: {
        id: jobId,
        name: data.name,
        description: data.description,
        cronSchedule: data.cronSchedule,
      },
    };
  } catch (error) {
    console.error("Error updating job:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update job",
    };
  }
}
