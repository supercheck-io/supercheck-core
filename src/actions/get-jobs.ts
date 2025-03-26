"use server";

import { db } from "../db/client";
import { jobs, tests, jobTests } from "../db/schema";
import { desc, eq, inArray } from "drizzle-orm";

type TestType = "browser" | "api" | "multistep" | "database";

// UI Test interface that matches what the components expect
interface Test {
  id: string;
  name: string;
  description: string | null;
  type: "api" | "ui" | "integration" | "performance" | "security";
  status?: "pending" | "pass" | "fail" | "skipped";
  lastRunAt?: string | null;
  duration?: number | null;
}

interface Job {
  id: string;
  name: string;
  description: string | null;
  cronSchedule: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  timeoutSeconds: number;
  retryCount: number;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  tests: Test[];
}

interface JobsResponse {
  success: boolean;
  jobs: Job[] | null;
  error?: string;
}

interface JobResponse {
  success: boolean;
  job: Job | null;
  error?: string;
}

interface JobWithTests {
  id: string;
  name: string;
  description: string | null;
  cronSchedule: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  timeoutSeconds: number;
  retryCount: number;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  tests: { testId: string }[];
}

// Map database test type to UI test type
function mapTestType(dbType: TestType): "api" | "ui" | "integration" | "performance" | "security" {
  switch (dbType) {
    case "api":
      return "api";
    case "browser":
      return "ui";
    case "multistep":
      return "integration";
    case "database":
      return "performance";
    default:
      return "api";
  }
}

export async function getJobs(): Promise<JobsResponse> {
  try {
    // Get the database instance
    const dbInstance = await db();
    
    // Fetch all jobs with their associated tests
    const allJobs = await dbInstance.select().from(jobs)
      .leftJoin(jobTests, eq(jobs.id, jobTests.jobId))
      .orderBy(desc(jobs.createdAt));
    
    // Group jobs by ID and collect test IDs
    const jobMap = new Map<string, JobWithTests>();
    for (const row of allJobs) {
      const job = row.jobs;
      const testId = row.job_tests?.testId;
      
      if (!jobMap.has(job.id)) {
        jobMap.set(job.id, {
          id: job.id,
          name: job.name,
          description: job.description,
          cronSchedule: job.cronSchedule,
          status: job.status as "pending" | "running" | "completed" | "failed" | "cancelled",
          timeoutSeconds: job.timeoutSeconds || 0,
          retryCount: job.retryCount || 0,
          config: job.config ? JSON.parse(JSON.stringify(job.config)) : null,
          createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : new Date().toISOString(),
          lastRunAt: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : null,
          nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : null,
          tests: testId ? [{ testId }] : []
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
    jobsArray.forEach(job => {
      job.tests.forEach(test => {
        allTestIds.add(test.testId);
      });
    });

    // Fetch all tests at once instead of in a loop
    let testDetailsMap: Record<string, Test> = {};
    if (allTestIds.size > 0) {
      const testResults = await dbInstance.select().from(tests)
        .where(inArray(tests.id, Array.from(allTestIds)));
      
      // Create a map of test ID to test details
      testDetailsMap = testResults.reduce((map, dbTest) => {
        map[dbTest.id] = {
          id: dbTest.id,
          name: dbTest.title,
          description: dbTest.description,
          type: mapTestType(dbTest.type as TestType),
          status: "pending",
          lastRunAt: dbTest.updatedAt ? new Date(dbTest.updatedAt).toISOString() : null,
          duration: null
        };
        return map;
      }, {} as Record<string, Test>);
    }

    // Map the jobs to include test information using the map
    const jobsWithTests = jobsArray.map(job => {
      // Get the test details for each test ID
      const testDetails = job.tests
        .map(test => testDetailsMap[test.testId])
        .filter(Boolean);
      
      // Return a serializable job object
      return {
        id: job.id,
        name: job.name,
        description: job.description,
        cronSchedule: job.cronSchedule,
        status: job.status,
        timeoutSeconds: job.timeoutSeconds,
        retryCount: job.retryCount,
        config: job.config || {},
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        lastRunAt: job.lastRunAt,
        nextRunAt: job.nextRunAt,
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
    // Get the database instance
    const dbInstance = await db();
    
    // Fetch the job by ID
    const jobResult = await dbInstance.select().from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    
    if (jobResult.length === 0) {
      return { success: false, job: null, error: "Job not found" };
    }
    
    const job = jobResult[0];
    
    // Fetch the tests associated with this job
    const jobTestResults = await dbInstance.select().from(jobTests)
      .where(eq(jobTests.jobId, id));
    
    const testIds = jobTestResults.map(jt => jt.testId);
    
    // Fetch the test details
    let testDetails: Test[] = [];
    if (testIds.length > 0) {
      const testResults = await dbInstance.select().from(tests)
        .where(inArray(tests.id, testIds));
      
      testDetails = testResults.map(dbTest => ({
        id: dbTest.id,
        name: dbTest.title,
        description: dbTest.description,
        type: mapTestType(dbTest.type as TestType),
        status: "pending",
        lastRunAt: dbTest.updatedAt ? new Date(dbTest.updatedAt).toISOString() : null,
        duration: null
      }));
    }
    
    // Return the job with its associated tests
    return {
      success: true,
      job: {
        id: job.id,
        name: job.name,
        description: job.description,
        cronSchedule: job.cronSchedule,
        status: job.status as "pending" | "running" | "completed" | "failed" | "cancelled",
        timeoutSeconds: job.timeoutSeconds || 0,
        retryCount: job.retryCount || 0,
        config: job.config ? JSON.parse(JSON.stringify(job.config)) : {},
        createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : new Date().toISOString(),
        lastRunAt: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : null,
        nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : null,
        tests: testDetails
      }
    };
  } catch (error) {
    console.error("Error fetching job:", error);
    return { success: false, job: null, error: "Failed to fetch job" };
  }
}
