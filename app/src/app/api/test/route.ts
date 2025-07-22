import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addTestToQueue, TestExecutionTask } from "@/lib/queue";
import { validationService } from "@/lib/validation-service";

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

    // Validate the script first - only queue if validation passes
    console.log("Validating script before queuing...");
    try {
      const validationResult = validationService.validateCode(code);
      
      if (!validationResult.valid) {
        console.warn("Script validation failed:", validationResult.error);
        return NextResponse.json({
          error: "Script validation failed",
          validationError: validationResult.error,
          line: validationResult.line,
          column: validationResult.column,
          errorType: validationResult.errorType,
          isValidationError: true,
        }, { status: 400 });
      }
      
      console.log("Script validation passed, proceeding to queue test...");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      console.error("Validation service error:", errorMessage);
      return NextResponse.json({
        error: "Script validation failed",
        validationError: `Validation service error: ${errorMessage}`,
        isValidationError: true,
      }, { status: 500 });
    }

    const testId = crypto.randomUUID();

    const task: TestExecutionTask = {
      testId,
      code,
    };

    try {
      await addTestToQueue(task);
    } catch (error) {
      // Check if this is a queue capacity error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('capacity limit') || errorMessage.includes('Unable to verify queue capacity')) {
        console.log(`[Test API] Capacity limit reached: ${errorMessage}`);
        
        // Return a 429 status code (Too Many Requests) with the error message
        return NextResponse.json(
          { error: "Queue capacity limit reached", message: errorMessage },
          { status: 429 }
        );
      }
      
      // For other errors, log and return a 500 status code
      console.error("Error adding test to queue:", error);
      return NextResponse.json(
        { error: "Failed to queue test for execution", details: errorMessage },
        { status: 500 }
      );
    }

    // Include the reportUrl in the response using direct UUID path
    const reportUrl = `/api/test-results/${testId}/report/index.html`;

    return NextResponse.json({
      message: "Test execution queued successfully.",
      testId: testId,
      reportUrl: reportUrl
    });
  } catch (error) {
    console.error("Error processing test request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
