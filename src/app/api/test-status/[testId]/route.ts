import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getTestStatus } from "@/lib/test-execution";

const { join, normalize } = path;

/**
 * Determines if the report is complete based on its contents
 * This is simpler now because we don't create loading reports anymore
 */
function isReportComplete(content: string): boolean {
  // Check if the content is empty or too small
  if (!content || content.trim().length < 100) {
    return false;
  }

  // If the file exists and has content, consider it complete
  return true;
}

/**
 * Helper function to determine the correct path type (test or job)
 * For simplicity, we'll check both paths and use the one that exists
 */
function determineReportPath(testId: string): { path: string, type: "tests" | "jobs" } {
  const testsPath = normalize(
    join(process.cwd(), "public", "test-results", "tests", testId, "report", "index.html")
  );
  
  const jobsPath = normalize(
    join(process.cwd(), "public", "test-results", "jobs", testId, "report", "index.html")
  );
  
  // Check which path exists
  if (existsSync(testsPath)) {
    return { path: testsPath, type: "tests" };
  } else if (existsSync(jobsPath)) {
    return { path: jobsPath, type: "jobs" };
  } else {
    // Default to tests if neither exists yet
    return { path: testsPath, type: "tests" };
  }
}

/**
 * API route handler to get the status of a test
 */
export async function GET(request: NextRequest) {
  const testId = request.nextUrl.pathname.split('/').pop();
  
  try {
    if (!testId) {
      return NextResponse.json(
        { error: "Test ID is required" },
        { status: 400 }
      );
    }

    // Get the test status from the test execution system
    const status = getTestStatus(testId);

    // If we don't have a status, return a 404
    if (!status) {
      return NextResponse.json(
        { error: "Test not found" },
        { status: 404 }
      );
    }

    // Determine the correct report path and type
    const { path: reportPath, type } = determineReportPath(testId);

    // Determine if the test is complete by checking the report content
    let isComplete = status.status === "completed";

    // If we have a report file, check its content to determine if it's complete
    if (existsSync(reportPath)) {
      try {
        const reportContent = readFileSync(reportPath, "utf-8");
        isComplete = isReportComplete(reportContent);
      } catch (error) {
        console.error(`Error reading report file for test ${testId}:`, error);
      }
    }

    // Return the status with the report URL using the determined type
    return NextResponse.json({
      ...status,
      status: isComplete ? "completed" : "running",
      reportUrl: `/api/test-results/${type}/${testId}/report/index.html`,
    });
  } catch (error) {
    console.error("Error in test status API route:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}
