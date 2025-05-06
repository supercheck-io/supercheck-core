import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { notFound } from "next/navigation";

// Get S3 credentials from environment variables
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'minioadmin';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';

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
async function getSignedHeaders(url: string, method: string = 'GET'): Promise<HeadersInit> {
  try {
    // Simple implementation - in production, you'd want to use the aws4fetch library or similar
    // This is a placeholder that returns the basic auth headers for now
    // In a real implementation, we would calculate the AWS v4 signature
    return {
      'Authorization': `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${AWS_REGION}/s3/aws4_request`,
      'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
    };
  } catch (error) {
    console.error('Error generating AWS v4 signature:', error);
    return {};
  }
}

// Helper function to handle various stream types from S3
async function streamToUint8Array(stream: any): Promise<Uint8Array> {
  if (!stream) {
    throw new Error("Stream is undefined or null");
  }
  
  // For Web API ReadableStream
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    
    // Calculate total length
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    
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
  if (typeof stream.on === 'function') {
    return new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      
      stream.on('data', (chunk: Uint8Array | ArrayBuffer) => {
        // Convert anything to Uint8Array
        const typedChunk = chunk instanceof Uint8Array 
          ? chunk 
          : new Uint8Array(chunk instanceof ArrayBuffer ? chunk : new Uint8Array(chunk).buffer);
        chunks.push(typedChunk);
      });
      
      stream.on('end', () => {
        // Calculate total size
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        
        // Create a new array and copy all chunks into it
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        
        resolve(result);
      });
      
      stream.on('error', reject);
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

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  // Explicitly await params to fix the "sync dynamic APIs" error
  const resolvedParams = await Promise.resolve(params);
  const path = resolvedParams.path || [];
  
  // Extract URL parameters including our special forceIframe parameter
  const url = new URL(request.url);
  const forceIframe = url.searchParams.get('forceIframe') === 'true';
  
  if (path.length < 1) {
    return notFound();
  }
  
  // Handle both old-style URLs (/jobs/[uuid]/...) and new-style URLs (/[uuid]/...)
  let entityId: string;
  let reportFile: string;
  
  // Check if the first segment is 'jobs' or 'tests' (old URL format)
  if (path[0] === 'jobs' || path[0] === 'tests') {
    // Old-style URL: /[entityType]/[uuid]/[...reportPath]
    if (path.length < 2) {
      return notFound();
    }
    
    entityId = path[1]; // Second segment is the entity ID
    reportFile = path.length > 2 ? path.slice(2).join('/') : '';
    console.log(`Handling old-style URL for entity type ${path[0]}, ID ${entityId}, file: ${reportFile}`);
  } else {
    // New-style URL: /[uuid]/[...reportPath]
    entityId = path[0]; // First segment is the entity ID
    reportFile = path.length > 1 ? path.slice(1).join('/') : '';
    console.log(`Handling new-style URL for entity ID ${entityId}, file: ${reportFile}`);
  }
  
  try {
    const dbInstance = await db();
    
    // Query the reports table to get the s3Url for this entity
    let reportResult = await dbInstance.query.reports.findFirst({
      where: eq(reports.entityId, entityId),
      columns: {
        s3Url: true,
        reportPath: true,
        entityType: true,
        status: true
      }
    });
    
    if (!reportResult) {
      return notFound();
    }
    
    if (!reportResult.s3Url) {
      if (reportResult.status === 'running') {
        return NextResponse.json({ 
          error: "Report not ready", 
          details: "The test is still running. Please wait for it to complete."
        }, { status: 202 });
      }
      
      return notFound();
    }
    
    console.log(`Found report for ${entityId} with entity type ${reportResult.entityType}: ${reportResult.s3Url}`);
    
    // Parse S3 URL to extract useful parts
    const s3Url = new URL(reportResult.s3Url);
    console.log(`Parsed S3 URL:`, {
      protocol: s3Url.protocol,
      host: s3Url.host,
      pathname: s3Url.pathname,
      fullUrl: s3Url.toString()
    });
    
    const pathParts = s3Url.pathname.split('/').filter(part => part.length > 0);
    const bucket = pathParts[0];
    
    console.log(`Extracted parts:`, { bucket, pathParts });
    
    // Determine the file path based on what's being requested
    let targetFile = reportFile || 'index.html';
    
    // Extract the base path without the file part and use only the entityId/report structure
    const entityIdIndex = pathParts.indexOf(entityId);
    let s3Key;
    
    if (entityIdIndex !== -1) {
      // Use the actual entityId and report path structure from S3 URL
      const prefix = pathParts.slice(entityIdIndex, pathParts.length - 1).join('/');
      s3Key = `${prefix}/${targetFile}`;
    } else {
      // Fallback to direct construction if we can't find entityId in path
      s3Key = `${entityId}/report/${targetFile}`;
    }
    
    // Clean up any duplicate path segments (like report/report)
    s3Key = s3Key.replace(/\/report\/report\//g, '/report/');
    
    console.log(`Constructed key path: ${s3Key}`);
    
    // Skip the direct fetch approach that's failing and go straight to the AWS SDK
    console.log('Using AWS SDK approach for S3 access...');
      
    try {
      // Try AWS SDK approach
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });
      
      // Use AWS SDK for S3 access which handles auth correctly
      console.log(`Using AWS SDK for S3 access to ${bucket}/${s3Key}`);
      
      const s3Response = await s3Client.send(command);
      
      if (!s3Response.Body) {
        throw new Error("Empty response from S3");
      }
      
      const buffer = await streamToUint8Array(s3Response.Body);
      const contentType = s3Response.ContentType || 'application/octet-stream';
      
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=300',
          // Only include Content-Disposition for downloads if not forcing iframe display
          ...(forceIframe ? {} : (
            contentType && contentType.includes('application/') && !contentType.includes('html') ? 
            {'Content-Disposition': `inline; filename="${targetFile.split('/').pop()}"`} : {}
          ))
        }
      });
    } catch (error: unknown) {
      const s3Error = error as Error;
      console.error(`AWS SDK approach failed: ${s3Error.message}`);
      console.log('Trying final fallback with direct file construction...');
      
      // 3. Last resort: try a simple file URL construction 
      try {
        // Construct a direct URL using the same pattern as the S3 key
        const urlBase = s3Url.protocol + '//' + s3Url.host;
        const bucketPrefix = '/' + bucket + '/';
        
        // Use the same s3Key we built earlier for consistency
        const fallbackUrl = `${urlBase}${bucketPrefix}${s3Key}`;
        
        console.log(`Final fallback URL: ${fallbackUrl}`);
        
        // Configure the headers with AWS v4 signature
        const headers: HeadersInit = await getSignedHeaders(fallbackUrl);
        console.log(`Using AWS v4 signature auth for fallback S3 access`);
        
        const fallbackResponse = await fetch(fallbackUrl, { headers });
        
        if (!fallbackResponse.ok) {
          throw new Error(`Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
        }
        
        const fallbackData = await fallbackResponse.arrayBuffer();
        const fallbackContentType = fallbackResponse.headers.get('Content-Type') || 'application/octet-stream';
        
        return new NextResponse(new Uint8Array(fallbackData), {
          status: 200,
          headers: {
            'Content-Type': fallbackContentType,
            'Cache-Control': 'public, max-age=300',
            // Only include Content-Disposition for downloads if not forcing iframe display
            ...(forceIframe ? {} : (
              fallbackContentType && fallbackContentType.includes('application/') && !fallbackContentType.includes('html') ? 
              {'Content-Disposition': `inline; filename="${targetFile.split('/').pop()}"`} : {}
            ))
          }
        });
      } catch (error: unknown) {
        const fallbackError = error as Error;
        console.error(`All approaches failed. Last error: ${fallbackError.message}`);
        return notFound();
      }
    }
  } catch (error) {
    console.error(`Error fetching report for entity ${entityId}:`, error);
    return notFound();
  }
} 