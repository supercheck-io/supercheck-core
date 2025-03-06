import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { getTestStatus } from "@/lib/test-execution";

const { join, normalize } = path;

/**
 * Determines if the report is complete based on its contents
 * This checks for the absence of "Test Execution in Progress" text and loading indicators
 */
function isReportComplete(content: string): boolean {
  // Check if the content is empty
  if (!content || content.trim().length < 100) {
    return false;
  }

  // If the content contains these loading indicators, it's not complete
  if (
    content.includes("Test Execution in Progress") ||
    content.includes("animation: spin") ||
    content.includes("Loading...") ||
    content.includes('class="spinner"')
  ) {
    return false;
  }

  // Check for presence of expected test report content
  if (
    content.includes("Test Results") ||
    content.includes("Tests passed") ||
    content.includes("Tests failed") ||
    content.includes("Test Failed") ||
    content.includes("test report")
  ) {
    return true;
  }

  // If the report has substantial content but no clear indicators, consider it complete
  return content.length > 1000;
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

    // Check if we have a report file
    const reportPath = normalize(
      join(process.cwd(), "public", "test-results", testId, "report", "index.html")
    );

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

    // Return the status with the report URL
    return NextResponse.json({
      ...status,
      status: isComplete ? "completed" : "running",
      reportUrl: `/api/test-results/${testId}/report/index.html`,
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
