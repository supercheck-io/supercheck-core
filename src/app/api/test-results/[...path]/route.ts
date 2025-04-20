import { getContentType } from "@/lib/test-execution";
import { NextRequest } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { getDb } from "@/db/client";
import { reports } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const { join, normalize } = path;

// Maximum number of retries for S3 operations
const MAX_S3_RETRIES = 3;

/**
 * Retry an S3 operation with exponential backoff
 */
async function retryS3Operation<T>(operation: () => Promise<T>, maxRetries = MAX_S3_RETRIES): Promise<T> {
  let lastError: unknown = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`S3 operation failed (attempt ${attempt + 1}/${maxRetries}): ${message}`);
      
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff before retrying (100ms, 200ms, 400ms...)
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we reach here, all retries failed
  throw lastError || new Error('S3 operation failed after multiple retries');
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  const path = params.path;

  // Check if path is valid
  if (!path || path.length === 0) {
    return new Response("Invalid path", { status: 400 });
  }

  // With the new structure, the path will be [type, id, ...fileparts]
  // e.g., ['tests', 'test-1234', 'report', 'index.html']
  // or ['jobs', 'job-1234', 'report', 'index.html']
  
  // Check if we have enough path segments
  if (path.length < 2) {
    return new Response("Invalid path format", { status: 400 });
  }
  
  // Extract type and ID
  const type = path[0]; // 'tests' or 'jobs'
  const id = path[1];
  const remainingPath = path.slice(2);
  
  // Validate type
  if (type !== 'tests' && type !== 'jobs') {
    return new Response("Invalid test type. Must be 'tests' or 'jobs'", { status: 400 });
  }

  // Handle missing or invalid ID
  if (!id) {
    return new Response("Test ID is required", { status: 400 });
  }

  // Set up paths
  const publicDir = normalize(join(process.cwd(), "public"));
  const testResultsDir = normalize(join(publicDir, "test-results", type, id));
  const filePath = normalize(join(testResultsDir, ...remainingPath));

  try {
    // NEW: Check report metadata first to avoid queue operations
    const db = await getDb();
    const entityType = type === 'tests' ? 'test' : 'job';
    
    // First check the report metadata table
    const metadata = await db.select().from(reports)
      .where(and(
        eq(reports.entityType, entityType),
        eq(reports.entityId, id)
      ))
      .execute();
    
    // If we found metadata, we know the report exists and where it is
    if (metadata.length > 0) {
      console.log(`Found report metadata for ${type}/${id}, using cached path information`);
      
      // Check if the file exists in the expected location
      if (existsSync(filePath)) {
        console.log(`Serving report file from cached location: ${filePath}`);
        
        // Read file content
        const content = await readFile(filePath);
        
        // Get the content type based on file extension
        const contentType = getContentType(filePath);
        
        return new Response(content, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600", // Cache for 1 hour
            "Expires": new Date(Date.now() + 3600000).toUTCString() // 1 hour from now
          },
        });
      }
    }
    
    // SIMPLIFIED LOGIC: If no metadata, check local folder next
    console.log(`No metadata found or file missing, checking local filesystem for results: ${filePath}`);
    
    // Check if the local directory exists and file exists
    if (existsSync(testResultsDir) && existsSync(filePath)) {
      console.log(`Found local results for ${type}/${id}`);
      
      // Read file content
      const content = await readFile(filePath);
      
      // Get the content type based on file extension
      const contentType = getContentType(filePath);
      
      // Store metadata to speed up future requests
      if (remainingPath[0] === 'report' && remainingPath[1] === 'index.html') {
        try {
          console.log(`Ensuring report metadata exists for ${type}/${id}`);
          
          // Check if metadata already exists before inserting
          const existingMetadata = await db.select()
            .from(reports)
            .where(and(
              eq(reports.entityType, entityType),
              eq(reports.entityId, id)
            ))
            .execute();
          
          if (existingMetadata.length === 0) {
            // Only insert if no metadata exists
            console.log(`Creating new metadata entry for ${type}/${id}`);
            await db.insert(reports).values({
              entityType: entityType,
              entityId: id,
              reportPath: `/test-results/${type}/${id}/report`,
              status: 'completed',
              createdAt: new Date(),
              updatedAt: new Date()
            }).execute();
          } else {
            console.log(`Metadata already exists for ${type}/${id}, skipping insertion`);
          }
        } catch (dbError) {
          // Log but don't fail the request if we can't save metadata
          console.warn(`Failed to save report metadata: ${dbError}`);
        }
      }
      
      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
          "Expires": new Date(Date.now() + 3600000).toUTCString() // 1 hour from now
        },
      });
    }
    
    // If file isn't found locally and it's a job/run, try S3 as fallback
    if (type === 'jobs') {
      console.log(`Local results not found for ${type}/${id}, checking S3 as fallback`);
      
      // Only import the S3 module if we actually need to access S3
      try {
        // Dynamically import S3 storage only when needed
        const s3Storage = await import("@/lib/s3-storage");
        
        const s3Key = `test-results/${type}/${id}/${remainingPath.join('/')}`;
        
        // Check if this file exists in S3
        const exists = await retryS3Operation(() => s3Storage.fileExists(s3Key));
        
        if (exists) {
          console.log(`Found results in S3 for ${type}/${id}`);
          const fileStream = await retryS3Operation(() => s3Storage.getReadStream(s3Key));
          
          // Process the stream
          const chunks = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk);
          }
          
          // Concatenate the chunks into a single Uint8Array
          const allBytes = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            allBytes.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset);
            offset += chunk.byteLength;
          }
          
          // Get the content type based on file extension
          const contentType = getContentType(s3Key);
          
          // Store metadata for S3 files too
          if (remainingPath[0] === 'report' && remainingPath[1] === 'index.html') {
            try {
              console.log(`Ensuring S3 report metadata exists for ${type}/${id}`);
              
              // Check if metadata already exists before inserting
              const existingMetadata = await db.select()
                .from(reports)
                .where(and(
                  eq(reports.entityType, entityType),
                  eq(reports.entityId, id)
                ))
                .execute();
              
              if (existingMetadata.length === 0) {
                // Only insert if no metadata exists
                console.log(`Creating new S3 metadata entry for ${type}/${id}`);
                await db.insert(reports).values({
                  entityType: entityType,
                  entityId: id,
                  reportPath: `/test-results/${type}/${id}/report`,
                  status: 'completed',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }).execute();
              } else {
                console.log(`S3 metadata already exists for ${type}/${id}, skipping insertion`);
              }
            } catch (dbError) {
              // Log but don't fail the request if we can't save metadata
              console.warn(`Failed to save S3 report metadata: ${dbError}`);
            }
          }
          
          return new Response(allBytes, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=3600", // Cache for 1 hour
              "Expires": new Date(Date.now() + 3600000).toUTCString() // 1 hour from now
            },
          });
        }
      } catch (s3Error: unknown) {
        const message = s3Error instanceof Error ? s3Error.message : 'Unknown S3 error';
        console.warn(`Error with S3 for ${type}/${id}: ${message}`);
      }
    }
    
    // If we reach here, neither local nor S3 had the file
    return new Response(
      JSON.stringify({
        error: "Not Found",
        message: `Test results not found for ${type} ID: ${id}`,
        statusCode: 404
      }), 
      { 
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error serving test result file ${filePath}:`, error);
    return new Response(`Error serving file: ${message}`, {
      status: 500,
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
