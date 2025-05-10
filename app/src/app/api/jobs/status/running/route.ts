import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobs, runs } from "@/db/schema";

/**
 * API endpoint to return all currently running jobs
 * Used by the JobContext to maintain state across page refreshes
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getDb();
    
    // Find all jobs with "running" status
    const runningJobs = await db.query.jobs.findMany({
      where: eq(jobs.status, "running"),
      columns: {
        id: true,
        name: true,
        status: true
      }
    });
    
    // Find all active runs
    const activeRuns = await db.query.runs.findMany({
      where: eq(runs.status, "running"),
      columns: {
        id: true,
        jobId: true
      }
    });
    
    // Combine job and run data
    const runningJobsData = runningJobs.map(job => {
      // Find matching run for this job
      const run = activeRuns.find(run => run.jobId === job.id);
      
      return {
        jobId: job.id, 
        name: job.name,
        runId: run?.id || null
      };
    }).filter(job => job.runId !== null); // Only include jobs with active runs
    
    return NextResponse.json({ 
      runningJobs: runningJobsData 
    });
  } catch (error) {
    console.error("Error fetching running jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch running jobs" },
      { status: 500 }
    );
  }
} 