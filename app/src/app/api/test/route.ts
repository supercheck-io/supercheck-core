import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addTestToQueue, TestExecutionTask } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const code = data.script as string;

    if (!code) {
      return NextResponse.json(
        { error: "No script provided" },
        { status: 400 }
      );
    }

    const testId = crypto.randomUUID();

    const task: TestExecutionTask = {
      testId,
      code,
    };

    await addTestToQueue(task);

    // Include the reportUrl in the response using direct UUID path
    const reportUrl = `/api/test-results/${testId}/report/index.html`;

    return NextResponse.json({
      message: "Test execution queued successfully.",
      testId: testId,
      reportUrl: reportUrl
    });
  } catch (error) {
    console.error("Error in test API route:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";

    return NextResponse.json(
      {
        success: false,
        error: `Failed to queue test execution: ${errorMessage}`,
        testId: null,
      },
      { status: 500 }
    );
  }
}
