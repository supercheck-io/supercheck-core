import { getContentType } from "@/lib/test-execution";
import { NextRequest } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { Readable } from "stream";

const { join, normalize } = path;

// Maximum number of retries for S3 operations
const MAX_S3_RETRIES = 3;

/**
 * Retry an S3 operation with exponential backoff
 */
async function retryS3Operation<T>(operation: () => Promise<T>, maxRetries = MAX_S3_RETRIES): Promise<T> {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.warn(`S3 operation failed (attempt ${attempt + 1}/${maxRetries}): ${error.message || 'Unknown error'}`);
      
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
    // SIMPLIFIED LOGIC: Always check local folder first
    console.log(`Checking local filesystem first for results: ${filePath}`);
    
    // Check if the local directory exists and file exists
    if (existsSync(testResultsDir) && existsSync(filePath)) {
      console.log(`Found local results for ${type}/${id}`);
      
      // Read file content
      const content = await readFile(filePath);
      
      // Get the content type based on file extension
      const contentType = getContentType(filePath);
      
      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0"
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
        const exists = await retryS3Operation(() => s3Storage.fileExists(s3Key, true));
        
        if (exists) {
          console.log(`Found results in S3 for ${type}/${id}`);
          const fileStream = await retryS3Operation(() => s3Storage.getReadStream(s3Key, true));
          
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
          
          return new Response(allBytes, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-store, max-age=0",
              "Pragma": "no-cache",
              "Expires": "0"
            },
          });
        }
      } catch (s3Error: any) {
        console.warn(`Error with S3 for ${type}/${id}: ${s3Error.message}`);
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
  } catch (error: any) {
    console.error(`Error serving test result file ${filePath}:`, error);
    return new Response(`Error serving file: ${error.message || 'Unknown error'}`, {
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
