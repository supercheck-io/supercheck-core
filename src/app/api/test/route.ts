import { executeTest } from "@/lib/test-execution";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Parse JSON data instead of form data
    const data = await request.json();
    const script = data.script as string;

    if (!script) {
      return NextResponse.json(
        { error: "No script provided" },
        { status: 400 }
      );
    }

    const result = await executeTest(script);

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
