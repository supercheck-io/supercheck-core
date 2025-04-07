import { getTestStatus } from "@/lib/test-execution";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ testId: string }> }
) {
  const { testId } = await params;

  // Check for test ID validity
  if (!testId) {
    return new Response(JSON.stringify({ error: "Test ID is required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // Prepare SSE response headers
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // For Nginx specifically
  };

  // Create a readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Send an initial event
      const initialStatus = getTestStatus(testId);
      const initialEvent = `data: ${JSON.stringify(
        initialStatus || { testId, status: "not_found" }
      )}\n\n`;
      controller.enqueue(new TextEncoder().encode(initialEvent));

      // Set up interval to check for status updates
      const intervalId = setInterval(() => {
        const status = getTestStatus(testId);
        if (status) {
          const event = `data: ${JSON.stringify(status)}\n\n`;
          controller.enqueue(new TextEncoder().encode(event));

          // Close the stream if test is completed
          if (status.status === "completed") {
            clearInterval(intervalId);
            controller.close();
          }
        } else {
          // If test not found, send a not_found status and close
          const notFoundEvent = `data: ${JSON.stringify({
            testId,
            status: "not_found",
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(notFoundEvent));
          clearInterval(intervalId);
          controller.close();
        }
      }, 1000);

      // Clean up on abort
      request.signal.onabort = () => {
        clearInterval(intervalId);
      };
    },
  });

  // Return the stream as the response
  return new Response(stream, { headers });
}
