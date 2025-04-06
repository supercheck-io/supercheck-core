import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { tests, jobTests } from "@/db/schema";
import { eq, count } from "drizzle-orm";

// DELETE to remove a test
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const testId = url.searchParams.get("id");

    if (!testId) {
      return NextResponse.json(
        { success: false, error: "Test ID is required" },
        { status: 400 }
      );
    }

    const dbInstance = await db();

    // Check if the test is associated with any jobs
    const jobCountResult = await dbInstance
      .select({ count: count() })
      .from(jobTests)
      .where(eq(jobTests.testId, testId));

    const jobCount = jobCountResult[0]?.count ?? 0;

    if (jobCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Test cannot be deleted because it is currently used in one or more jobs. Please remove it from the jobs first.",
        },
        { status: 409 }
      );
    }

    // Delete the test if not associated with any jobs
    const result = await dbInstance.delete(tests).where(eq(tests.id, testId));

    if (result.rowsAffected === 0) {
      return NextResponse.json(
        { success: false, error: "Test not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Test deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting test:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete test",
      },
      { status: 500 }
    );
  }
}
