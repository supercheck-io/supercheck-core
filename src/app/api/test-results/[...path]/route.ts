import { getContentType } from "@/lib/test-execution";
import { NextRequest } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import * as s3Storage from "@/lib/s3-storage";
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

/**
 * Determine storage location based on request origin
 * @param request The NextRequest object
 * @returns boolean indicating whether to check S3 first
 */
function shouldCheckS3First(request: NextRequest): boolean {
  // Get referrer or other headers that might indicate the source page
  const referrer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  
  // Check if the request is coming from the jobs page
  const isFromJobsPage = referrer.includes('/jobs/') || referrer.includes('/runs/');
  
  // For requests coming from jobs page, check S3 first
  return isFromJobsPage;
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

  // Get the test ID from the path
  const id = path[0];
  const remainingPath = path.slice(1);

  // Handle missing or invalid ID
  if (!id) {
    return new Response("Test ID is required", { status: 400 });
  }

  // Set up paths
  const publicDir = normalize(join(process.cwd(), "public"));
  const testResultsDir = normalize(join(publicDir, "test-results", id));
  const filePath = normalize(join(testResultsDir, ...remainingPath));

  try {
    // Determine storage strategy based on request context instead of ID format
    const checkS3First = shouldCheckS3First(request);
    console.log(`Request for ${id}: ${checkS3First ? 'Checking S3 first' : 'Checking local filesystem first'}`);
    
    // Check S3 first if request is from jobs page
    if (checkS3First) {
      try {
        const s3Key = `test-results/${id}/${remainingPath.join('/')}`;
        console.log(`Checking S3 for results: ${s3Key}`);
        
        // Check if this file exists in S3 job bucket
        const exists = await retryS3Operation(() => s3Storage.fileExists(s3Key, true));
        
        if (exists) {
          console.log(`Found results in S3 for ${id}`);
          const fileStream = await retryS3Operation(() => s3Storage.getReadStream(s3Key, true));
          
          // Collect all the chunks from the stream
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
              // Disable caching
              "Cache-Control": "no-store, max-age=0",
              "Pragma": "no-cache",
              "Expires": "0"
            },
          });
        }
      } catch (s3Error: any) {
        console.warn(`Error checking S3 for ${id}: ${s3Error.message}`);
        // Fall back to local filesystem
      }
    }
    
    // Check local filesystem
    console.log(`Checking local filesystem for results: ${filePath}`);
    
    // Check if the local directory exists
    if (!existsSync(testResultsDir)) {
      console.log(`Test results directory not found for ID: ${id}`);
      
      // If local file doesn't exist and we haven't checked S3 yet, try S3 as fallback
      if (!checkS3First) {
        try {
          const s3Key = `test-results/${id}/${remainingPath.join('/')}`;
          console.log(`Fallback: Checking S3 for results: ${s3Key}`);
          
          // Check if this file exists in S3
          const exists = await retryS3Operation(() => s3Storage.fileExists(s3Key, true));
          
          if (exists) {
            console.log(`Found results in S3 for ${id}`);
            const fileStream = await retryS3Operation(() => s3Storage.getReadStream(s3Key, true));
            
            // Collect all the chunks from the stream
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
                // Disable caching
                "Cache-Control": "no-store, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
              },
            });
          }
        } catch (err) {
          // Both local and S3 failed
          console.error(`Failed to find results in both local and S3 storage for ID: ${id}`);
        }
      }
      
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: `Test results not found for Run ID: ${id}`,
          statusCode: 404
        }), 
        { 
          status: 404,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Check if the file exists locally
    if (!existsSync(filePath)) {
      return new Response(`File not found: ${remainingPath.join("/")}`, {
        status: 404,
      });
    }

    // Read file content
    const content = await readFile(filePath);

    // Get the content type based on file extension
    const contentType = getContentType(filePath);

    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        // Disable caching
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      },
    });
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
