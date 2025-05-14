"use server";

import { db } from "../db/client";
import { jobs, tests, jobTests } from "../db/schema";
import { desc, eq, inArray } from "drizzle-orm";

type TestType = "browser" | "api" | "multistep" | "database";

// Remove or update this interface if it conflicts with schema types
// For now, we'll just ensure the type uses the DB types
interface TestFromAction {
  id: string;
  name: string;
  description: string;
  type: TestType; // Use the DB TestType
  status?: "running" | "passed" | "failed" | "error";
  lastRunAt?: string;
  duration?: number;
  script?: string;
}

interface JobFromAction {
  id: string;
  name: string;
  description: string;
  cronSchedule: string;
  status: "running" | "passed" | "failed" | "error";
  createdAt: string;
  updatedAt: string;
  lastRunAt: string;
  nextRunAt: string;
  scheduledJobId?: string;
  tests: TestFromAction[];
}

interface JobsResponse {
  success: boolean;
  jobs: JobFromAction[] | null;
  error?: string;
}

interface JobResponse {
  success: boolean;
  job: JobFromAction | null;
  error?: string;
}

interface JobWithTests {
  id: string;
  name: string;
  description: string;
  cronSchedule: string;
  status: "running" | "passed" | "failed" | "error";
  createdAt: string;
  updatedAt: string;
  lastRunAt: string;
  nextRunAt: string;
  scheduledJobId?: string;
  tests: { testId: string }[];
}

export async function getJobs(): Promise<JobsResponse> {
  try {
    // Get the database instance
    const dbInstance = await db();

    // Fetch all jobs with their associated tests
    const allJobs = await dbInstance
      .select({
        jobs: {
          id: jobs.id,
          name: jobs.name,
          description: jobs.description,
          cronSchedule: jobs.cronSchedule,
          status: jobs.status,
          createdAt: jobs.createdAt,
          updatedAt: jobs.updatedAt,
          lastRunAt: jobs.lastRunAt,
          nextRunAt: jobs.nextRunAt,
          scheduledJobId: jobs.scheduledJobId,
        },
        jobTests: {
          testId: jobTests.testId,
        },
      })
      .from(jobs)
      .leftJoin(jobTests, eq(jobs.id, jobTests.jobId))
      .orderBy(desc(jobs.createdAt));

    // Group jobs by ID and collect test IDs
    const jobMap = new Map<string, JobWithTests>();
    for (const row of allJobs) {
      const job = row.jobs;
      const testId = row.jobTests?.testId;

      if (!jobMap.has(job.id)) {
        jobMap.set(job.id, {
          id: job.id,
          name: job.name,
          description: job.description || "",
          cronSchedule: job.cronSchedule || "",
          status: job.status as JobFromAction["status"],
          createdAt: job.createdAt
            ? new Date(job.createdAt).toISOString()
            : new Date().toISOString(),
          updatedAt: job.updatedAt
            ? new Date(job.updatedAt).toISOString()
            : new Date().toISOString(),
          lastRunAt: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : "",
          nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : "",
          scheduledJobId: job.scheduledJobId || undefined,
          tests: testId ? [{ testId }] : [],
        });
      } else if (testId) {
        const existingJob = jobMap.get(job.id)!;
        existingJob.tests.push({ testId });
      }
    }

    // Convert map to array
    const jobsArray = Array.from(jobMap.values());

    // For each job, collect test IDs
    const allTestIds = new Set<string>();
    jobsArray.forEach((job) => {
      job.tests.forEach((test) => {
        allTestIds.add(test.testId);
      });
    });

    // Fetch all tests at once instead of in a loop
    let testDetailsMap: Record<string, TestFromAction> = {};
    if (allTestIds.size > 0) {
      const testResults = await dbInstance
        .select()
        .from(tests)
        .where(inArray(tests.id, Array.from(allTestIds)));

      // Create a map of test ID to test details
      testDetailsMap = testResults.reduce((map, dbTest) => {
        map[dbTest.id] = {
          id: dbTest.id,
          name: dbTest.title,
          description: dbTest.description || "",
          type: dbTest.type as TestType,
          status: undefined,
          lastRunAt: undefined,
          duration: undefined,
          script: dbTest.script || "",
        };
        return map;
      }, {} as Record<string, TestFromAction>);
    }

    // Map the jobs to include test information using the map
    const jobsWithTests = jobsArray.map((job) => {
      const testDetails = job.tests
        .map((test) => testDetailsMap[test.testId])
        .filter(Boolean);

      // Return a serializable job object
      return {
        id: job.id,
        name: job.name,
        description: job.description,
        cronSchedule: job.cronSchedule,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        lastRunAt: job.lastRunAt,
        nextRunAt: job.nextRunAt,
        scheduledJobId: job.scheduledJobId,
        tests: testDetails,
      };
    });

    return { success: true, jobs: jobsWithTests };
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return { success: false, jobs: null, error: "Failed to fetch jobs" };
  }
}

export async function getJob(id: string): Promise<JobResponse> {
  try {
    const dbInstance = await db();

    // First get the job details
    const [jobRow] = await dbInstance
      .select({
        id: jobs.id,
        name: jobs.name,
        description: jobs.description,
        cronSchedule: jobs.cronSchedule,
        status: jobs.status,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        lastRunAt: jobs.lastRunAt,
        nextRunAt: jobs.nextRunAt,
        scheduledJobId: jobs.scheduledJobId,
      })
      .from(jobs)
      .where(eq(jobs.id, id));

    if (!jobRow) {
      return { success: false, job: null, error: "Job not found" };
    }

    // Get all test IDs associated with this job
    const jobTestsRow = await dbInstance
      .select()
      .from(jobTests)
      .where(eq(jobTests.jobId, id));

    // Get all tests at once
    const testIds = jobTestsRow.map((row) => row.testId);
    const testsRow = await dbInstance
      .select()
      .from(tests)
      .where(inArray(tests.id, testIds));

    // Map tests to UI format
    const uiTests = testsRow.map((test) => ({
      id: test.id,
      name: test.title,
      description: test.description || "",
      type: test.type as TestType,
      status: undefined,
      lastRunAt: undefined,
      duration: undefined,
      script: test.script || "",
    }));

    // Create the job object
    const jobData: JobFromAction = {
      id: jobRow.id,
      name: jobRow.name,
      description: jobRow.description || "",
      cronSchedule: jobRow.cronSchedule || "",
      status: jobRow.status as
        | "running"
        | "passed"
        | "failed"
        | "error",
      createdAt: jobRow.createdAt
        ? new Date(jobRow.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: jobRow.updatedAt
        ? new Date(jobRow.updatedAt).toISOString()
        : new Date().toISOString(),
      lastRunAt: jobRow.lastRunAt
        ? new Date(jobRow.lastRunAt).toISOString()
        : "",
      nextRunAt: jobRow.nextRunAt
        ? new Date(jobRow.nextRunAt).toISOString()
        : "",
      scheduledJobId: jobRow.scheduledJobId || undefined,
      tests: uiTests,
    };

    return { success: true, job: jobData as JobFromAction, error: undefined };
  } catch (error) {
    console.error("Error fetching job:", error);
    return { success: false, job: null, error: "Failed to fetch job details" };
  }
}
