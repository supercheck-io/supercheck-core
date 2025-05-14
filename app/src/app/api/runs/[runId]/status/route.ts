import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { runs, reports, ReportType } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  // Extract runId from the URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const runId = pathParts[pathParts.length - 2]; // Get the second-to-last segment (before "status")

  if (!runId) {
    return NextResponse.json({ error: "Run ID is required" }, { status: 400 });
  }

  try {
    const dbInstance = await db();
    const runResult = await dbInstance.query.runs.findFirst({
      where: eq(runs.id, runId),
    });

    if (!runResult) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Fetch report details for this run
    const reportResult = await dbInstance.query.reports.findFirst({
      where: and(
        eq(reports.entityId, runId),
        eq(reports.entityType, 'job' as ReportType)
      ),
      columns: {
        s3Url: true
      }
    });

    // Return the relevant fields including the report URL
    return NextResponse.json({
      runId: runResult.id,
      jobId: runResult.jobId,
      status: runResult.status,
      startedAt: runResult.startedAt,
      completedAt: runResult.completedAt,
      duration: runResult.duration,
      errorDetails: runResult.errorDetails,
      // Use s3Url from reportResult if found, otherwise null
      reportUrl: reportResult?.s3Url || null,
    });

  } catch (error) {
    console.error(`Error fetching status for run ${runId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: `Failed to fetch run status: ${errorMessage}` },
      { status: 500 }
    );
  }
} 