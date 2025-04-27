import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { reports } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

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

// Helper function to convert Node.js stream to buffer
async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) {
    throw new Error("Stream is undefined or null");
  }
  
  // For Node.js Readable streams (from AWS SDK)
  if (typeof stream.pipe === 'function') {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
  
  // For Web API ReadableStream
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return Buffer.from(result.buffer);
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
  
  // Path format could be:
  // /jobs/[runId]/report/[...reportPath] for job runs
  // /tests/[testId]/report/[...reportPath] for test runs
  if (path.length < 3 || (path[0] !== 'jobs' && path[0] !== 'tests')) {
    return NextResponse.json({ 
      error: "Invalid path", 
      details: "Path must start with 'jobs' or 'tests' followed by an ID and optional report path" 
    }, { status: 400 });
  }
  
  const entityType = path[0] === 'jobs' ? 'job' : 'test';
  const entityId = path[1];
  let reportFile = path.slice(2).join('/');
  
  // Ensure path has report/ prefix
  if (!reportFile.startsWith('report/') && reportFile !== 'report') {
    reportFile = `report/${reportFile}`;
  }
  
  // If reportFile ends with just 'report', append index.html
  if (reportFile === 'report') {
    reportFile = 'report/index.html';
  }
  
  console.log(`Handling report request for ${entityType} ${entityId}, file: ${reportFile}`);
  
  try {
    const dbInstance = await db();
    
    // Query the reports table to get the s3Url for this entity
    let reportResult = await dbInstance.query.reports.findFirst({
      where: and(
        eq(reports.entityId, entityId),
        eq(reports.entityType, entityType)
      ),
      columns: {
        s3Url: true,
        reportPath: true,
        entityType: true,
        status: true
      }
    });
    
    // If not found with the specified entity type, try the alternate entity type
    // This helps with entity type mismatches between UI expectations and stored data
    if (!reportResult) {
      const alternateEntityType = entityType === 'job' ? 'test' : 'job';
      
      console.log(`Report not found for ${entityType} ${entityId}, trying ${alternateEntityType} instead...`);
      
      reportResult = await dbInstance.query.reports.findFirst({
        where: and(
          eq(reports.entityId, entityId),
          eq(reports.entityType, alternateEntityType)
        ),
        columns: {
          s3Url: true,
          reportPath: true,
          entityType: true,
          status: true
        }
      });
      
      if (reportResult) {
        console.log(`Found report using alternate entity type ${alternateEntityType}`);
      }
    }
    
    if (!reportResult) {
      return NextResponse.json({ 
        error: "Report not found", 
        details: `No report found for ${entityType} with ID ${entityId}`
      }, { status: 404 });
    }
    
    if (!reportResult.s3Url) {
      if (reportResult.status === 'running') {
        return NextResponse.json({ 
          error: "Report not ready", 
          details: "The test is still running. Please wait for it to complete."
        }, { status: 202 });
      }
      
      return NextResponse.json({ 
        error: "Report S3 URL not available",
        details: "The S3 URL for this report is missing. This could happen if the report upload to S3 failed or if the report was not generated."
      }, { status: 404 });
    }
    
    console.log(`Found report for ${entityId} with entity type ${reportResult.entityType}: ${reportResult.s3Url}`);
    
    // Parse S3 URL to extract useful parts
    const s3Url = new URL(reportResult.s3Url);
    const s3Host = `${s3Url.protocol}//${s3Url.host}`;
    const pathParts = s3Url.pathname.split('/').filter(part => part.length > 0);
    const bucket = pathParts[0];
    const basePath = pathParts.slice(1, -1).join('/');
    
    // Determine the file path based on what's being requested
    let targetFile = reportFile.replace(/^report\//, '');
    if (targetFile === '') targetFile = 'index.html';
    
    // Clean up the key path
    const key = `${basePath}/${targetFile}`.replace(/\/+/g, '/');
    console.log(`Constructed key path: ${key}`);
    
    // 1. Try direct S3 URL construction first
    try {
      // Construct direct URL to the file
      const directUrl = `${s3Host}/${bucket}/${key}`;
      console.log(`Trying direct fetch from: ${directUrl}`);
      
      // Configure the headers for MinIO access
      const headers: HeadersInit = {};
      if (S3_ENDPOINT.includes('localhost') || S3_ENDPOINT.includes('127.0.0.1')) {
        headers['Authorization'] = `Basic ${Buffer.from(`${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}`).toString('base64')}`;
      }
      
      const response = await fetch(directUrl, { headers });
      
      if (!response.ok) {
        console.error(`Direct fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.arrayBuffer();
      const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
      
      return new NextResponse(data, {
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
    } catch (directFetchError) {
      console.log(`Direct URL approach failed: ${directFetchError.message}`);
      console.log('Trying fallback approach with AWS SDK...');
      
      try {
        // 2. Try AWS SDK approach
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });
        
        const s3Response = await s3Client.send(command);
        
        if (!s3Response.Body) {
          throw new Error("Empty response from S3");
        }
        
        const buffer = await streamToBuffer(s3Response.Body);
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
      } catch (s3Error) {
        console.error(`AWS SDK approach failed: ${s3Error.message}`);
        console.log('Trying final fallback with direct file construction...');
        
        // 3. Last resort: try a simple file URL construction 
        try {
          // Extract the base URL without the file part
          const baseUrlParts = reportResult.s3Url.split('/');
          baseUrlParts.pop(); // Remove the last part (index.html)
          const baseUrl = baseUrlParts.join('/');
          
          // Build the complete URL
          const fallbackUrl = `${baseUrl}/${targetFile}`;
          console.log(`Final fallback URL: ${fallbackUrl}`);
          
          // Configure the headers
          const headers: HeadersInit = {};
          if (S3_ENDPOINT.includes('localhost') || S3_ENDPOINT.includes('127.0.0.1')) {
            headers['Authorization'] = `Basic ${Buffer.from(`${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}`).toString('base64')}`;
          }
          
          const fallbackResponse = await fetch(fallbackUrl, { headers });
          
          if (!fallbackResponse.ok) {
            throw new Error(`Fallback fetch failed: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
          }
          
          const fallbackData = await fallbackResponse.arrayBuffer();
          const fallbackContentType = fallbackResponse.headers.get('Content-Type') || 'application/octet-stream';
          
          return new NextResponse(fallbackData, {
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
        } catch (fallbackError) {
          console.error(`All approaches failed. Last error: ${fallbackError.message}`);
          return NextResponse.json({
            error: "Failed to fetch report",
            details: "All approaches to fetch the report failed. Please check server logs for details."
          }, { status: 500 });
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching report for ${entityType} ${entityId}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch report", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 