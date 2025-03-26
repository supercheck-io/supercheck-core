"use server";

import { db } from "../db/client";
import { jobs, jobTests } from "../db/schema";
import crypto from "crypto";

export async function createJob(data: {
  name: string;
  description: string | null;
  cronSchedule: string | null;
  timeoutSeconds?: number;
  retryCount?: number;
  config?: Record<string, unknown>;
  tests?: { id: string }[];
}) {
  try {
    // Validate required fields
    if (!data.name) {
      return {
        success: false,
        error: "Job name is required",
      };
    }

    // Generate a unique ID for the job
    const jobId = crypto.randomUUID();

    // Get the database instance
    const dbInstance = await db();

    // Insert the job into the database
    await dbInstance.insert(jobs).values({
      id: jobId,
      name: data.name,
      description: data.description || "",
      cronSchedule: data.cronSchedule || "",
      status: "pending",
      timeoutSeconds: data.timeoutSeconds || 30,
      retryCount: data.retryCount || 0,
      config: data.config || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunAt: null,
      nextRunAt: null,
    });

    // If tests are provided, associate them with the job
    if (data.tests && data.tests.length > 0) {
      const jobTestValues = data.tests.map((test, index) => ({
        jobId,
        testId: test.id,
        orderPosition: index,
      }));

      await dbInstance.insert(jobTests).values(jobTestValues);
    }

    // Return a plain serializable object
    return {
      success: true,
      job: {
        id: jobId,
        name: data.name,
        description: data.description || "",
        cronSchedule: data.cronSchedule || "",
        status: "pending",
        timeoutSeconds: data.timeoutSeconds || 30,
        retryCount: data.retryCount || 0,
        config: JSON.parse(JSON.stringify(data.config || {})),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRunAt: null,
        nextRunAt: null,
        tests: data.tests ? data.tests.map((test) => ({ id: test.id })) : [],
      },
    };
  } catch (error) {
    console.error("Error creating job:", error);
    return { success: false, error: "Failed to create job" };
  }
}
