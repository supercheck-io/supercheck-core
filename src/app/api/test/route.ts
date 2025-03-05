import { executeTest, cleanupTestResults } from "@/lib/test-execution";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const code = formData.get("code") as string;

    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    const result = await executeTest(code);

    await cleanupTestResults();

    return NextResponse.json({
      success: result.success,
      error: result.error,
      reportUrl: result.reportUrl,
      testId: result.testId,
    });
  } catch (error) {
    console.error("Error in test API route:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
        reportUrl: null,
        testId: null,
      },
      { status: 500 }
    );
  }
}
