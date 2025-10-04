import { NextResponse } from "next/server";
import { db } from "@/utils/db";
import { reports } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/rbac/middleware";

// Get S3 credentials from environment variables
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "minioadmin";
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "minioadmin";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // Required for MinIO
});

// Helper to get AWS v4 signature headers
async function getSignedHeaders(): Promise<HeadersInit> {
  try {
    // Simple implementation - in production, you'd want to use the aws4fetch library or similar
    // This is a placeholder that returns the basic auth headers for now
    // In a real implementation, we would calculate the AWS v4 signature
    return {
      Authorization: `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${AWS_REGION}/s3/aws4_request`,
      "X-Amz-Date": new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""),
    };
  } catch (error) {
    console.error("Error generating AWS v4 signature:", error);
    return {};
  }
}

// Helper function to handle various stream types from S3
async function streamToUint8Array(
  stream:
    | ReadableStream
    | NodeJS.ReadableStream
    | ArrayBuffer
    | ArrayBufferView
    | Blob
    | unknown
): Promise<Uint8Array> {
  if (!stream) {
    throw new Error("Stream is undefined or null");
  }

  // For AWS SDK v3 response bodies (Blob with stream methods)
  const awsStream = stream as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (awsStream.transformToByteArray) {
    // Use AWS SDK's built-in transformation
    const bytes = await awsStream.transformToByteArray();
    return new Uint8Array(bytes);
  }

  // For Web API ReadableStream
  if (stream && typeof (stream as ReadableStream).getReader === "function") {
    const reader = (stream as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    // Calculate total length
    const totalLength = chunks.reduce(
      (sum, chunk) => sum + chunk.byteLength,
      0
    );

    // Merge chunks into a single Uint8Array
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return result;
  }

  // For Node.js-like streams that have a .on() method
  if (stream && typeof (stream as NodeJS.ReadableStream).on === "function") {
    return new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];

      (stream as NodeJS.ReadableStream).on(
        "data",
        (chunk: Uint8Array | ArrayBuffer) => {
          // Convert anything to Uint8Array
          const typedChunk =
            chunk instanceof Uint8Array
              ? chunk
              : new Uint8Array(
                  chunk instanceof ArrayBuffer
                    ? chunk
                    : new Uint8Array(chunk).buffer
                );
          chunks.push(typedChunk);
        }
      );

      (stream as NodeJS.ReadableStream).on("end", () => {
        // Calculate total size
        const totalSize = chunks.reduce(
          (sum, chunk) => sum + chunk.byteLength,
          0
        );

        // Create a new array and copy all chunks into it
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }

        resolve(result);
      });

      (stream as NodeJS.ReadableStream).on("error", reject);
    });
  }

  // If the stream is already an ArrayBuffer
  if (stream instanceof ArrayBuffer) {
    return new Uint8Array(stream);
  }

  // If the stream is an ArrayBuffer view (like Uint8Array)
  if (ArrayBuffer.isView(stream)) {
    return new Uint8Array(stream.buffer);
  }

  throw new Error("Unsupported stream type");
}

export async function GET(request: Request) {
  // Require authentication
  try {
    await requireAuth();
  } catch {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Extract path parameters from the URL
  const url = new URL(request.url);
  // Remove the initial part of the path to get the dynamic part
  const fullPath = url.pathname;
  const basePath = "/api/test-results/";
  const path = fullPath
    .slice(basePath.length)
    .split("/")
    .filter((segment) => segment.length > 0);

  // Extract URL parameters including our special forceIframe parameter
  const forceIframe = url.searchParams.get("forceIframe") === "true";

  if (path.length < 1) {
    return notFound();
  }

  // Handle both old-style URLs (/jobs/[uuid]/...) and new-style URLs (/[uuid]/...)
  let entityId: string;
  let reportFile: string;

  // Check if the first segment is 'jobs' or 'tests' (old URL format)
  if (path[0] === "jobs" || path[0] === "tests") {
    // Old-style URL: /[entityType]/[uuid]/[...reportPath]
    if (path.length < 2) {
      return notFound();
    }

    entityId = path[1]; // Second segment is the entity ID
    reportFile = path.length > 2 ? path.slice(2).join("/") : "";
  } else {
    // New-style URL: /[uuid]/[...reportPath]
    entityId = path[0]; // First segment is the entity ID
    reportFile = path.length > 1 ? path.slice(1).join("/") : "";
  }

  try {
    // Query the reports table to get the s3Url for this entity
    const reportResult = await db.query.reports.findFirst({
      where: eq(reports.entityId, entityId),
      columns: {
        s3Url: true,
        reportPath: true,
        entityType: true,
        status: true,
      },
    });

    if (!reportResult) {
      return notFound();
    }

    if (!reportResult.s3Url) {
      if (reportResult.status === "running") {
        return NextResponse.json(
          {
            error: "Report not ready",
            details:
              "The test is still running. Please wait for it to complete.",
          },
          { status: 202 }
        );
      }

      // Check if this is likely a timeout error for failed executions
      if (reportResult.status === "failed") {
        // For failed test executions without reports, it's very likely a timeout
        // since script validation errors and other issues usually still generate some output
        if (reportResult.entityType === "test") {
          return NextResponse.json(
            {
              error: "Test execution timeout",
              message: "Test execution timed out after 2 minutes",
              details: "Execution timed out after 2 minutes",
              timeoutInfo: {
                isTimeout: true,
                timeoutType: "test",
                timeoutDurationMs: 120000, // 2 minutes
                timeoutDurationMinutes: 2,
              },
              entityType: reportResult.entityType,
              status: reportResult.status,
            },
            { status: 408 }
          ); // 408 Request Timeout
        } else if (reportResult.entityType === "job") {
          return NextResponse.json(
            {
              error: "Job execution timeout",
              message: "Job execution timed out after 15 minutes",
              details: "Execution timed out after 15 minutes",
              timeoutInfo: {
                isTimeout: true,
                timeoutType: "job",
                timeoutDurationMs: 900000, // 15 minutes
                timeoutDurationMinutes: 15,
              },
              entityType: reportResult.entityType,
              status: reportResult.status,
            },
            { status: 408 }
          ); // 408 Request Timeout
        }

        // Return general failed execution error for other entity types
        return NextResponse.json(
          {
            error: "Execution failed",
            message: "The execution failed without generating a report",
            details: "The execution completed but no report was generated",
            entityType: reportResult.entityType,
            status: reportResult.status,
          },
          { status: 500 }
        );
      }

      return notFound();
    }

    // Parse S3 URL to extract useful parts
    const s3Url = new URL(reportResult.s3Url);
    const pathParts = s3Url.pathname
      .split("/")
      .filter((part) => part.length > 0);
    const bucket = pathParts[0];

    // Determine the file path based on what's being requested
    const targetFile = reportFile || "index.html";

    // Extract the base path without the file part and use only the entityId/report structure
    const entityIdIndex = pathParts.indexOf(entityId);
    let s3Key;

    if (entityIdIndex !== -1) {
      // Use the actual entityId and report path structure from S3 URL
      const prefix = pathParts
        .slice(entityIdIndex, pathParts.length - 1)
        .join("/");
      s3Key = `${prefix}/${targetFile}`;
    } else {
      // Fallback to direct construction if we can't find entityId in path
      s3Key = `${entityId}/report/${targetFile}`;
    }

    // Clean up any duplicate path segments (like report/report)
    s3Key = s3Key.replace(/\/report\/report\//g, "/report/");

    try {
      // Try AWS SDK approach
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const s3Response = await s3Client.send(command);

      if (!s3Response.Body) {
        throw new Error("Empty response from S3");
      }

      const buffer = await streamToUint8Array(s3Response.Body);
      const contentType = s3Response.ContentType || "application/octet-stream";

      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=300",
          // Only include Content-Disposition for downloads if not forcing iframe display
          ...(forceIframe
            ? {}
            : contentType &&
              contentType.includes("application/") &&
              !contentType.includes("html")
            ? {
                "Content-Disposition": `inline; filename="${targetFile
                  .split("/")
                  .pop()}"`,
              }
            : {}),
        },
      });
    } catch {
      // 3. Last resort: try a simple file URL construction
      try {
        // Construct a direct URL using the same pattern as the S3 key
        const urlBase = s3Url.protocol + "//" + s3Url.host;
        const bucketPrefix = "/" + bucket + "/";

        // Use the same s3Key we built earlier for consistency
        const fallbackUrl = `${urlBase}${bucketPrefix}${s3Key}`;

        // Configure the headers with AWS v4 signature
        const headers: HeadersInit = await getSignedHeaders();

        const fallbackResponse = await fetch(fallbackUrl, { headers });

        if (!fallbackResponse.ok) {
          throw new Error(
            `Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`
          );
        }

        const fallbackData = await fallbackResponse.arrayBuffer();
        const fallbackContentType =
          fallbackResponse.headers.get("Content-Type") ||
          "application/octet-stream";

        return new NextResponse(new Uint8Array(fallbackData), {
          status: 200,
          headers: {
            "Content-Type": fallbackContentType,
            "Cache-Control": "public, max-age=300",
            // Only include Content-Disposition for downloads if not forcing iframe display
            ...(forceIframe
              ? {}
              : fallbackContentType &&
                fallbackContentType.includes("application/") &&
                !fallbackContentType.includes("html")
              ? {
                  "Content-Disposition": `inline; filename="${targetFile
                    .split("/")
                    .pop()}"`,
                }
              : {}),
          },
        });
      } catch {
        return notFound();
      }
    }
  } catch (error) {
    console.error(`[TEST-RESULTS] Error processing request:`, error);
    return notFound();
  }
}
