import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";

// DELETE to remove a test
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const testId = url.searchParams.get('id');

    if (!testId) {
      return NextResponse.json(
        { success: false, error: "Test ID is required" },
        { status: 400 }
      );
    }

    const dbInstance = await db();

    // Delete the test
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
      { success: false, error: error instanceof Error ? error.message : "Failed to delete test" },
      { status: 500 }
    );
  }
}
