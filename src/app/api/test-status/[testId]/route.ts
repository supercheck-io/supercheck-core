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
export async function GET(
  req: NextRequest,
  { params }: { params: { testId: string } }
) {
  try {
    // In Next.js App Router, params needs to be awaited if it's a Promise
    const paramData = params as unknown as Promise<{ testId: string }>;
    const { testId } = await Promise.resolve(paramData);

    if (!testId) {
      return NextResponse.json(
        { error: "Test ID is required" },
        { status: 400 }
      );
    }

    // Normalize the test ID and create paths
    const normalizedTestId = testId.replace(/\\/g, "/");
    const publicDir = normalize(join(process.cwd(), "public"));
    const reportPath = normalize(
      join(publicDir, "test-results", normalizedTestId, "report", "index.html")
    );

    // Check test status from in-memory map
    const testStatus = getTestStatus(normalizedTestId);

    // If no test status found
    if (!testStatus) {
      return NextResponse.json(
        { testId: normalizedTestId, status: "unknown" },
        { status: 200 }
      );
    }

    // Look for the report file to determine if it exists and if it's complete
    let reportUrl = null;
    let reportComplete = false;

    if (existsSync(reportPath)) {
      try {
        // Read the HTML report to check its content
        const reportContent = readFileSync(reportPath, "utf8");
        reportComplete = isReportComplete(reportContent);

        // Create a URL path to the report
        reportUrl = `/api/test-results/${normalizedTestId}/report/index.html`;
      } catch (error) {
        console.error(`Error reading report for ${normalizedTestId}:`, error);
      }
    }

    // Handle "running" status with report information
    if (testStatus.status === "running") {
      return NextResponse.json({
        ...testStatus,
        reportUrl,
        reportComplete,
      });
    }

    // For "completed" tests, include the report status
    if (testStatus.status === "completed") {
      return NextResponse.json({
        ...testStatus,
        reportUrl,
        reportComplete,
      });
    }

    // For "unknown" or other status tests, at least say if we have a report
    return NextResponse.json({
      ...testStatus,
      reportUrl,
      reportComplete,
    });
  } catch (error) {
    console.error("Error in test status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
