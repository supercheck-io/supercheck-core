import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getContentType } from '../utils';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;
  private jobBucketName: string;
  private testBucketName: string;
  private s3Endpoint: string;
  private maxRetries: number;
  private operationTimeout: number;

  constructor(private configService: ConfigService) {
    this.jobBucketName = this.configService.get<string>('S3_JOB_BUCKET_NAME', 'playwright-job-artifacts');
    this.testBucketName = this.configService.get<string>('S3_TEST_BUCKET_NAME', 'playwright-test-artifacts');
    this.s3Endpoint = this.configService.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', 'minioadmin');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', 'minioadmin');
    this.maxRetries = this.configService.get<number>('S3_MAX_RETRIES', 3);
    this.operationTimeout = this.configService.get<number>('S3_OPERATION_TIMEOUT', 5000);

    this.logger.log(`Initializing S3 client: endpoint=${this.s3Endpoint}, job bucket=${this.jobBucketName}, test bucket=${this.testBucketName}, region=${region}`);

    this.s3Client = new S3Client({
      region,
      endpoint: this.s3Endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: this.maxRetries,
    });
  }

  async onModuleInit() {
    // Ensure both buckets exist
    await this.ensureBucketExists(this.jobBucketName);
    await this.ensureBucketExists(this.testBucketName);
  }

  /**
   * Get the appropriate bucket based on entity type
   */
  getBucketForEntityType(entityType: string): string {
    if (entityType === 'test') {
      return this.testBucketName;
    }
    return this.jobBucketName; // Default to job bucket for 'job' and other entity types
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'S3 operation',
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error as Error;
        const errorMessage = lastError.message || 'Unknown error';
        this.logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${this.maxRetries}): ${errorMessage}`,
        );
        if (attempt < this.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    this.logger.error(`${operationName} failed after ${this.maxRetries} retries.`);
    throw lastError || new Error(`${operationName} failed after ${this.maxRetries} retries`);
  }

  async ensureBucketExists(bucketName: string): Promise<void> {
    this.logger.debug(`Checking if bucket exists: ${bucketName}`);
    try {
      await this.withRetry(
        () => this.s3Client.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 })),
        `Check bucket ${bucketName} existence`
      );
      this.logger.log(`Bucket '${bucketName}' already exists.`);
    } catch (error: any) {
      if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
        this.logger.warn(`Bucket '${bucketName}' does not exist. Attempting to create...`);
        try {
          await this.withRetry(
            () => this.s3Client.send(new CreateBucketCommand({ Bucket: bucketName })),
            `Create bucket ${bucketName}`
          );
          this.logger.log(`Bucket '${bucketName}' created successfully.`);
        } catch (createError: any) {
          this.logger.error(`Failed to create bucket '${bucketName}': ${createError.message}`, createError.stack);
        }
      } else {
        this.logger.error(`Error checking bucket '${bucketName}' existence: ${error.message}`, error.stack);
      }
    }
  }

  async uploadFile(
    localFilePath: string,
    s3Key: string,
    contentType?: string,
    bucket?: string,
  ): Promise<string> {
    const targetBucket = bucket || this.jobBucketName;
    this.logger.debug(`Uploading file ${localFilePath} to s3://${targetBucket}/${s3Key}`);
    try {
      const fileBuffer = await fs.readFile(localFilePath);
      const determinedContentType = contentType || getContentType(localFilePath);

      await this.withRetry(
        () => this.s3Client.send(new PutObjectCommand({
          Bucket: targetBucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: determinedContentType,
        })),
        `Upload file ${s3Key}`
      );

      this.logger.log(`Successfully uploaded file to s3://${targetBucket}/${s3Key}`);
      return s3Key;
    } catch (error) {
      this.logger.error(`Error uploading file ${localFilePath} to S3 key ${s3Key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Format a path for report storage using the entity ID directly without nested folders
  formatReportPath(entityId: string, reportPath: string = 'report'): string {
    return `${entityId}/${reportPath}`;
  }

  async uploadDirectory(
    localDirPath: string,
    s3KeyPrefix: string,
    bucket?: string,
    entityId?: string,
    entityType?: string,
  ): Promise<string[]> {
    const targetBucket = bucket || this.jobBucketName;
    
    // If entityId and entityType are provided, use the direct ID format
    if (entityId && entityType) {
      // Replace any test-results/entity paths with direct ID path
      if (s3KeyPrefix.includes('test-results')) {
        s3KeyPrefix = this.formatReportPath(entityId);
      }
    }
    
    this.logger.log(`[S3 UPLOAD] Starting directory upload from ${localDirPath} to s3://${targetBucket}/${s3KeyPrefix}`);
    
    // Check if directory exists
    try {
      const stats = await fs.stat(localDirPath);
      if (!stats.isDirectory()) {
        this.logger.error(`[S3 UPLOAD] Path ${localDirPath} is not a directory`);
        throw new Error(`Path ${localDirPath} is not a directory`);
      }
    } catch (err) {
      this.logger.error(`[S3 UPLOAD] Failed to access directory ${localDirPath}: ${err.message}`);
      throw err;
    }
    
    // List directory contents to debug
    let files: string[] = [];
    try {
      files = await fs.readdir(localDirPath);
      this.logger.log(`[S3 UPLOAD] Directory contents (${files.length} items): ${files.join(', ')}`);
      
      if (files.length === 0) {
        this.logger.warn(`[S3 UPLOAD] Warning: Directory ${localDirPath} is empty`);
      }
    } catch (err) {
      this.logger.error(`[S3 UPLOAD] Failed to read directory contents: ${err.message}`);
      throw err;
    }
    
    // Verify bucket exists before attempting upload
    try {
      await this.withRetry(
        () => this.s3Client.send(new ListObjectsV2Command({ Bucket: targetBucket, MaxKeys: 1 })),
        `Check bucket ${targetBucket} before upload`
      );
      this.logger.log(`[S3 UPLOAD] Verified bucket '${targetBucket}' exists.`);
    } catch (error) {
      this.logger.error(`[S3 UPLOAD] Bucket verification failed: ${error.message}`, error.stack);
      throw new Error(`S3 bucket verification failed: ${error.message}`);
    }
    
    const uploadedKeys: string[] = [];
    const normalizedPrefix = s3KeyPrefix.replace(/^\/+/, '').replace(/\/*$/, '');
    let uploadErrors = 0;

    const walk = async (dir: string, currentS3Prefix: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        this.logger.debug(`[S3 UPLOAD] Walking directory ${dir}, found ${entries.length} items`);

        for (const entry of entries) {
          const fullLocalPath = path.join(dir, entry.name);
          const relativePath = path.relative(localDirPath, fullLocalPath);
          const s3Key = normalizedPrefix + '/' + relativePath.split(path.sep).join('/');

          if (entry.isDirectory()) {
            // Recursively walk into subdirectories
            await walk(fullLocalPath, s3Key); 
          } else if (entry.isFile()) {
            // Push file upload promise to array - REPLACED with direct await
            try {
                this.logger.debug(`[S3 UPLOAD] Uploading file ${fullLocalPath} to ${s3Key}`);
                const key = await this.uploadFile(fullLocalPath, s3Key, undefined, targetBucket);
                uploadedKeys.push(key); // Push key on success
                this.logger.debug(`[S3 UPLOAD] Successfully uploaded ${key}`);
            } catch (fileUploadError) {
                uploadErrors++;
                this.logger.error(`[S3 UPLOAD] Failed to upload file ${fullLocalPath} to ${s3Key}: ${fileUploadError.message}`);
                if (uploadErrors >= 3) {
                  this.logger.error(`[S3 UPLOAD] Too many upload errors (${uploadErrors}), stopping directory upload`);
                  throw new Error(`Too many upload failures: ${uploadErrors} files failed to upload`);
                }
            }
          }
        }

      } catch (readError) {
         // Log error if reading a directory fails, but continue if possible
         this.logger.error(`[S3 UPLOAD] Error reading directory ${dir}: ${readError.message}`);
         
         if (readError.message.includes('Too many upload failures')) {
           throw readError; // Re-throw this specific error to stop the process
         }
      }
    };

    try {
      // Start the recursive walk from the root directory
      await walk(localDirPath, normalizedPrefix);
      
      if (uploadedKeys.length === 0) {
        this.logger.error(`[S3 UPLOAD] No files were uploaded from ${localDirPath}. This could indicate an issue.`);
        if (files.length > 0) {
          throw new Error('No files were uploaded despite directory containing files');
        }
      } else {
        this.logger.log(`[S3 UPLOAD] Finished upload for ${localDirPath}. Successfully uploaded ${uploadedKeys.length} files to prefix ${normalizedPrefix} in bucket ${targetBucket}`);
      }
    } catch (error) {
      this.logger.error(`[S3 UPLOAD] Error during directory upload process for ${localDirPath}: ${error.message}`, error.stack);
      throw error; // Re-throw to let caller handle it
    }
    
    return uploadedKeys; // Return keys of successfully uploaded files
  }

  // Get the base URL for entity reports
  getBaseUrlForEntity(entityType: string, entityId: string): string {
    const bucket = this.getBucketForEntityType(entityType);
    // Use direct UUID without nested folders
    const prefix = `${entityId}/report`;
    
    // Fix: Make sure URL format is correct for MinIO
    return `${this.s3Endpoint}/${bucket}/${prefix}`;
  }
}
