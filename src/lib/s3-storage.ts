import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, CreateBucketCommand, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, stat, rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';

// Default timeout for S3 operations in milliseconds (5 seconds)
const S3_OPERATION_TIMEOUT = parseInt(process.env.S3_OPERATION_TIMEOUT || '5000');

// Maximum number of retries for S3 operations
const MAX_S3_RETRIES = parseInt(process.env.S3_MAX_RETRIES || '3');

// Default bucket names
export const JOB_BUCKET_NAME = process.env.S3_JOB_BUCKET_NAME || 'playwright-job-artifacts';

// Lazy initialization of S3 client
let s3ClientInstance: S3Client | null = null;

// Function to get S3 client only when needed
function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    console.log(`Initializing S3 client with endpoint: ${process.env.S3_ENDPOINT || 'http://localhost:9000'}`);
    console.log(`S3 client configuration: timeout=${S3_OPERATION_TIMEOUT}ms, maxRetries=${MAX_S3_RETRIES}`);
    
    s3ClientInstance = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      forcePathStyle: true, // Required for MinIO and local S3 servers
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin'
      },
      // Add connection configuration to improve reliability
      requestHandler: {
        connectionTimeout: S3_OPERATION_TIMEOUT,
        socketTimeout: S3_OPERATION_TIMEOUT,
      },
      // Add retry configuration
      maxAttempts: MAX_S3_RETRIES
    });
    
    console.log(`Using job bucket: ${JOB_BUCKET_NAME}`);
  }
  
  return s3ClientInstance;
}

// Helper function to retry an operation
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_S3_RETRIES,
  operationName: string = 'S3 operation'
): Promise<T> {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries}): ${error.message || 'Unknown error'}`);
      
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff before retrying (100ms, 200ms, 400ms...)
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we reach here, all retries failed
  throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`);
}

// Helper to determine which bucket to use based on the context
export function getBucketName(isJob: boolean): string {
  return JOB_BUCKET_NAME;
}

// Ensure the bucket exists
export async function ensureBucketExists(bucketName: string): Promise<void> {
  try {
    const s3Client = getS3Client();
    console.log(`Checking if bucket exists: ${bucketName} at endpoint ${process.env.S3_ENDPOINT || 'http://localhost:9000'}`);
    
    // Try to list objects to see if bucket exists and we have access
    await withRetry(
      () => s3Client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1
      })),
      MAX_S3_RETRIES,
      `Check if bucket ${bucketName} exists`
    );
    
    console.log(`Bucket '${bucketName}' already exists`);
  } catch (error: any) {
    console.log(`Error checking bucket existence: ${error.name} - ${error.message}`);
    
    // If bucket doesn't exist, create it
    if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
      try {
        const s3Client = getS3Client();
        console.log(`Creating bucket '${bucketName}'`);
        await withRetry(
          () => s3Client.send(new CreateBucketCommand({
            Bucket: bucketName
          })),
          MAX_S3_RETRIES,
          `Create bucket ${bucketName}`
        );
        console.log(`Bucket '${bucketName}' created successfully`);
      } catch (createError: any) {
        console.error(`Error creating bucket '${bucketName}':`, createError.message);
        // Don't throw, just log the error and continue
      }
    } else {
      console.error(`Error checking bucket '${bucketName}' existence:`, error.message);
      // Don't throw, just log the error and continue
    }
  }
}

// Ensure both buckets exist
export async function ensureAllBucketsExist(): Promise<void> {
  await ensureBucketExists(JOB_BUCKET_NAME);
}

// Upload a file to S3
export async function uploadFile(
  localFilePath: string, 
  s3Key: string,
  contentType: string = 'application/octet-stream',
  isJob: boolean = false
): Promise<string> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    // Read file as buffer instead of streaming to avoid readableFlowing issues
    const fileBuffer = await fs.readFile(localFilePath);
    
    console.log(`Uploading file ${localFilePath} to S3 bucket ${bucketName}, key: ${s3Key}`);
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType
    }));
    
    console.log(`Successfully uploaded file to S3: ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error(`Error uploading file ${localFilePath} to S3:`, error);
    throw error;
  }
}

// Upload a directory recursively to S3
export async function uploadDirectory(
  localDirPath: string,
  s3KeyPrefix: string,
  isJob: boolean = false
): Promise<string[]> {
  try {
    const bucketName = getBucketName(isJob);
    const keys: string[] = [];
    const files = await readdir(localDirPath, { recursive: true });
    
    for (const file of files) {
      const localFilePath = join(localDirPath, file.toString());
      const stats = await stat(localFilePath);
      
      if (stats.isFile()) {
        const s3Key = `${s3KeyPrefix}/${file}`;
        await uploadFile(localFilePath, s3Key, undefined, isJob);
        keys.push(s3Key);
      }
    }
    
    return keys;
  } catch (error) {
    console.error(`Error uploading directory ${localDirPath} to S3:`, error);
    throw error;
  }
}

// Download a file from S3
export async function downloadFile(
  s3Key: string,
  localFilePath: string,
  isJob: boolean = false
): Promise<string> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    // Create directory if it doesn't exist
    await mkdir(dirname(localFilePath), { recursive: true });
    
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key
    }));
    
    if (response.Body instanceof Readable) {
      const writeStream = createWriteStream(localFilePath);
      await finished(response.Body.pipe(writeStream));
    } else if (response.Body) {
      const buffer = await response.Body.transformToByteArray();
      await finished(Readable.from(buffer).pipe(createWriteStream(localFilePath)));
    } else {
      throw new Error('No body returned from S3');
    }
    
    return localFilePath;
  } catch (error) {
    console.error(`Error downloading file ${s3Key} from S3:`, error);
    throw error;
  }
}

// Check if a file exists in S3
export async function fileExists(
  s3Key: string,
  isJob: boolean = false
): Promise<boolean> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    await withRetry(
      () => s3Client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      })),
      MAX_S3_RETRIES,
      `Check if file ${s3Key} exists in ${bucketName}`
    );
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound') {
      return false;
    }
    console.error(`Error checking if file ${s3Key} exists in S3:`, error);
    throw error;
  }
}

// List files in S3 with a prefix
export async function listFiles(
  prefix: string,
  isJob: boolean = false
): Promise<string[]> {
  const bucketName = getBucketName(isJob);
  const s3Client = getS3Client();
  const files: string[] = [];
  let continuationToken: string | undefined = undefined;
  
  try {
    do {
      const response: ListObjectsV2CommandOutput = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }));
      
      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            files.push(object.Key);
          }
        }
      }
      
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    
    return files;
  } catch (error) {
    console.error(`Error listing files with prefix ${prefix} from S3:`, error);
    throw error;
  }
}

// Get a readable stream for a file from S3
export async function getReadStream(
  s3Key: string,
  isJob: boolean = false
): Promise<Readable> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    const response = await withRetry(
      () => s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      })),
      MAX_S3_RETRIES,
      `Get stream for ${s3Key} from ${bucketName}`
    );
    
    if (response.Body instanceof Readable) {
      return response.Body;
    } else if (response.Body) {
      const buffer = await response.Body.transformToByteArray();
      return Readable.from(buffer);
    } else {
      throw new Error('No body returned from S3');
    }
  } catch (error) {
    console.error(`Error getting stream for file ${s3Key} from S3:`, error);
    throw error;
  }
}

// Download a directory recursively from S3
export async function downloadDirectory(
  s3KeyPrefix: string,
  localDirPath: string,
  isJob: boolean = false
): Promise<string[]> {
  try {
    const bucketName = getBucketName(isJob);
    await mkdir(localDirPath, { recursive: true });
    
    const files = await listFiles(s3KeyPrefix, isJob);
    const downloadedFiles: string[] = [];
    
    for (const file of files) {
      // Determine the relative path within the prefix
      const relativePath = file.substring(s3KeyPrefix.length);
      const localFilePath = join(localDirPath, relativePath);
      
      // Create subdirectories if needed
      await mkdir(dirname(localFilePath), { recursive: true });
      
      // Download the file
      await downloadFile(file, localFilePath, isJob);
      downloadedFiles.push(localFilePath);
    }
    
    return downloadedFiles;
  } catch (error) {
    console.error(`Error downloading directory ${s3KeyPrefix} from S3:`, error);
    throw error;
  }
}

// Get a temporary local file path for a given S3 key
export async function getTemporaryLocalFile(
  s3Key: string,
  isJob: boolean = false
): Promise<{ path: string, cleanup: () => Promise<void> }> {
  const tempDir = join(tmpdir(), 'supertest-temp', uuidv4());
  await mkdir(tempDir, { recursive: true });
  
  const filename = basename(s3Key);
  const localPath = join(tempDir, filename);
  
  await downloadFile(s3Key, localPath, isJob);
  
  return {
    path: localPath,
    cleanup: async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`Error cleaning up temporary directory ${tempDir}:`, error);
      }
    }
  };
}

// Get a publicly accessible URL for a file (with expiration)
export async function getPresignedUrl(
  s3Key: string,
  expiresIn: number = 3600,
  isJob: boolean = false
): Promise<string> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key
    });
    
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error(`Error generating presigned URL for ${s3Key}:`, error);
    throw error;
  }
}

// Delete a file from S3
export async function deleteFile(
  s3Key: string,
  isJob: boolean = false
): Promise<void> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: s3Key
    }));
  } catch (error) {
    console.error(`Error deleting file ${s3Key} from S3:`, error);
    throw error;
  }
}

// Delete multiple files from S3
export async function deleteFiles(
  s3Keys: string[],
  isJob: boolean = false
): Promise<void> {
  try {
    const bucketName = getBucketName(isJob);
    const s3Client = getS3Client();
    if (s3Keys.length === 0) return;
    
    // S3 only allows deleting a maximum of 1000 objects in one call
    const MAX_OBJECTS = 1000;
    
    for (let i = 0; i < s3Keys.length; i += MAX_OBJECTS) {
      const batch = s3Keys.slice(i, i + MAX_OBJECTS);
      
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: batch.map(Key => ({ Key }))
        }
      }));
    }
  } catch (error) {
    console.error(`Error deleting files from S3:`, error);
    throw error;
  }
}

// Delete files with a prefix (like a directory)
export async function deletePrefix(
  prefix: string,
  isJob: boolean = false
): Promise<void> {
  try {
    const files = await listFiles(prefix, isJob);
    if (files.length > 0) {
      await deleteFiles(files, isJob);
    }
  } catch (error) {
    console.error(`Error deleting prefix ${prefix} from S3:`, error);
    throw error;
  }
} 