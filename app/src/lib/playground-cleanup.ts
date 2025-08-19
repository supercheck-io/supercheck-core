/**
 * Playground Cleanup Service for Managing Test Report Cleanup
 * 
 * This service handles the scheduled cleanup of old playground test reports
 * that are not stored in the database. It uses the existing S3 cleanup service
 * for robust, batched deletion with proper error handling and logging.
 */

import { createS3CleanupService, type S3DeletionResult } from './s3-cleanup';
import { Queue, Worker, QueueEvents } from 'bullmq';
import type Redis from 'ioredis';

// Configuration interface for playground cleanup
export interface PlaygroundCleanupConfig {
  enabled: boolean;
  cronSchedule: string;
  maxAgeHours: number;
  bucketName: string;
  batchSize: number;
}

/**
 * Playground Cleanup Service
 */
export class PlaygroundCleanupService {
  private config: PlaygroundCleanupConfig;
  private s3Service: ReturnType<typeof createS3CleanupService>;
  private cleanupQueue: Queue | null = null;
  private cleanupWorker: Worker | null = null;
  private cleanupQueueEvents: QueueEvents | null = null;

  constructor(config: PlaygroundCleanupConfig) {
    this.config = config;
    this.s3Service = createS3CleanupService();
    
    console.log('[PLAYGROUND_CLEANUP] Initialized with config:', {
      enabled: this.config.enabled,
      cronSchedule: this.config.cronSchedule,
      maxAgeHours: this.config.maxAgeHours,
      bucketName: this.config.bucketName,
      batchSize: this.config.batchSize,
    });
  }

  /**
   * Initialize the cleanup system with queue and worker
   */
  async initialize(redisConnection: Redis): Promise<void> {
    if (!this.config.enabled) {
      console.log('[PLAYGROUND_CLEANUP] Cleanup is disabled, skipping initialization');
      return;
    }

    console.log('[PLAYGROUND_CLEANUP] Initializing cleanup system...');

    try {
      // Create the cleanup queue
      this.cleanupQueue = new Queue('playground-cleanup', {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 5, // Keep last 5 completed jobs for monitoring
          removeOnFail: 10,    // Keep last 10 failed jobs for debugging
          attempts: 3,         // Retry failed jobs up to 3 times
          backoff: {
            type: 'exponential',
            delay: 5000,       // Start with 5 second delay
          },
        },
      });

      // Create queue events for monitoring job completion
      this.cleanupQueueEvents = new QueueEvents('playground-cleanup', {
        connection: redisConnection,
      });

      // Create the worker to process cleanup jobs
      this.cleanupWorker = new Worker(
        'playground-cleanup',
        async (job) => {
          console.log(`[PLAYGROUND_CLEANUP] Processing cleanup job: ${job.id}`);
          return await this.performCleanup();
        },
        {
          connection: redisConnection,
          concurrency: 1, // Only run one cleanup job at a time
        }
      );

      // Set up worker event handlers
      this.cleanupWorker.on('completed', (job) => {
        console.log(`[PLAYGROUND_CLEANUP] Job ${job.id} completed successfully`);
      });

      this.cleanupWorker.on('failed', (job, err) => {
        console.error(`[PLAYGROUND_CLEANUP] Job ${job?.id} failed:`, err.message);
      });

      this.cleanupWorker.on('error', (err) => {
        console.error('[PLAYGROUND_CLEANUP] Worker error:', err);
      });

      // Schedule the recurring cleanup job
      await this.scheduleCleanupJob();

      console.log('[PLAYGROUND_CLEANUP] Initialization completed successfully');
    } catch (error) {
      console.error('[PLAYGROUND_CLEANUP] Failed to initialize:', error);
      throw new Error(`Playground cleanup initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Schedule the recurring cleanup job
   */
  private async scheduleCleanupJob(): Promise<void> {
    if (!this.cleanupQueue) {
      throw new Error('Cleanup queue not initialized');
    }

    console.log(`[PLAYGROUND_CLEANUP] Scheduling cleanup job with cron: ${this.config.cronSchedule}`);

    try {
      // Remove any existing jobs with the same name first
      const existingJobs = await this.cleanupQueue.getRepeatableJobs();
      const existingJob = existingJobs.find(job => job.name === 'playground-cleanup-job');
      
      if (existingJob) {
        console.log(`[PLAYGROUND_CLEANUP] Removing existing repeatable job: ${existingJob.key}`);
        await this.cleanupQueue.removeRepeatableByKey(existingJob.key);
      }

      // Add the new recurring job
      await this.cleanupQueue.add(
        'playground-cleanup-job',
        {
          maxAgeHours: this.config.maxAgeHours,
          bucketName: this.config.bucketName,
          scheduledAt: new Date().toISOString(),
        },
        {
          jobId: 'playground-cleanup-recurring', // Fixed ID prevents duplicates across instances
          repeat: {
            pattern: this.config.cronSchedule,
          },
        }
      );

      console.log('[PLAYGROUND_CLEANUP] Cleanup job scheduled successfully');
    } catch (error) {
      console.error('[PLAYGROUND_CLEANUP] Failed to schedule cleanup job:', error);
      throw error;
    }
  }

  /**
   * Perform the actual cleanup of old playground reports
   */
  private async performCleanup(): Promise<S3DeletionResult> {
    console.log('[PLAYGROUND_CLEANUP] Starting playground cleanup process...');
    
    const startTime = Date.now();
    const cutoffTime = Date.now() - (this.config.maxAgeHours * 60 * 60 * 1000);
    const cutoffDate = new Date(cutoffTime);

    console.log(`[PLAYGROUND_CLEANUP] Cleaning up reports older than: ${cutoffDate.toISOString()} (${this.config.maxAgeHours} hours ago)`);

    try {
      // List all objects in the playground bucket with pagination
      const objectsToDelete = await this.listOldPlaygroundObjects(cutoffTime);

      if (objectsToDelete.length === 0) {
        console.log('[PLAYGROUND_CLEANUP] No old playground reports found to clean up');
        return {
          success: true,
          deletedObjects: [],
          failedObjects: [],
          totalAttempted: 0,
        };
      }

      console.log(`[PLAYGROUND_CLEANUP] Found ${objectsToDelete.length} objects to delete`);

      // Use the existing S3 service for batch deletion
      const deletionInputs = objectsToDelete.map(obj => ({
        reportPath: obj.key,
        entityId: obj.key.split('/')[0] || 'unknown', // Extract run ID from key
        entityType: 'test' as const, // Playground reports are test-type
      }));

      const result = await this.s3Service.deleteReports(deletionInputs);

      const duration = Date.now() - startTime;
      console.log(`[PLAYGROUND_CLEANUP] Cleanup completed in ${duration}ms:`, {
        attempted: result.totalAttempted,
        deleted: result.deletedObjects.length,
        failed: result.failedObjects.length,
        success: result.success,
      });

      // Log failures for debugging
      if (result.failedObjects.length > 0) {
        console.warn('[PLAYGROUND_CLEANUP] Some deletions failed:');
        for (const failed of result.failedObjects.slice(0, 10)) { // Log first 10 failures
          console.warn(`  - ${failed.key}: ${failed.error}`);
        }
        if (result.failedObjects.length > 10) {
          console.warn(`  ... and ${result.failedObjects.length - 10} more failures`);
        }
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PLAYGROUND_CLEANUP] Cleanup failed after ${duration}ms:`, error);
      throw new Error(`Playground cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List old objects in the playground bucket that should be deleted
   */
  private async listOldPlaygroundObjects(cutoffTime: number): Promise<Array<{ key: string; lastModified: Date }>> {
    console.log('[PLAYGROUND_CLEANUP] Scanning playground bucket for old objects...');
    
    const objectsToDelete: Array<{ key: string; lastModified: Date }> = [];
    let continuationToken: string | undefined;
    let totalScanned = 0;

    try {
      const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      // Create S3 client with same config as cleanup service
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
        },
      });

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          ContinuationToken: continuationToken,
          MaxKeys: 1000, // Process in batches of 1000
        });

        const response = await s3Client.send(command);
        
        if (response.Contents) {
          for (const obj of response.Contents) {
            totalScanned++;
            
            if (obj.Key && obj.LastModified) {
              const lastModifiedTime = obj.LastModified.getTime();
              
              // Check if object is older than cutoff time
              if (lastModifiedTime < cutoffTime) {
                objectsToDelete.push({
                  key: obj.Key,
                  lastModified: obj.LastModified,
                });
              }
            }
          }
        }

        continuationToken = response.NextContinuationToken;
        
        // Log progress every 1000 objects
        if (totalScanned % 1000 === 0) {
          console.log(`[PLAYGROUND_CLEANUP] Scanned ${totalScanned} objects, found ${objectsToDelete.length} old objects so far`);
        }
      } while (continuationToken);

      console.log(`[PLAYGROUND_CLEANUP] Scan complete: ${totalScanned} objects scanned, ${objectsToDelete.length} objects marked for deletion`);
      return objectsToDelete;
    } catch (error) {
      console.error('[PLAYGROUND_CLEANUP] Failed to list playground objects:', error);
      throw new Error(`Failed to scan playground bucket: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Trigger a manual cleanup (useful for testing or one-off cleanups)
   */
  async triggerManualCleanup(): Promise<S3DeletionResult> {
    if (!this.cleanupQueue) {
      throw new Error('Cleanup queue not initialized');
    }

    console.log('[PLAYGROUND_CLEANUP] Triggering manual cleanup...');

    try {
      const job = await this.cleanupQueue.add(
        'manual-playground-cleanup',
        {
          maxAgeHours: this.config.maxAgeHours,
          bucketName: this.config.bucketName,
          triggeredAt: new Date().toISOString(),
          manual: true,
        },
        {
          priority: 10, // Higher priority for manual jobs
        }
      );

      console.log(`[PLAYGROUND_CLEANUP] Manual cleanup job queued: ${job.id}`);
      
      // Wait for the job to complete and return the result
      if (!this.cleanupQueueEvents) {
        throw new Error('Queue events not initialized');
      }
      const result = await job.waitUntilFinished(this.cleanupQueueEvents);
      return result as S3DeletionResult;
    } catch (error) {
      console.error('[PLAYGROUND_CLEANUP] Manual cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics and status
   */
  async getCleanupStatus(): Promise<{
    enabled: boolean;
    config: PlaygroundCleanupConfig;
    queueStatus: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    } | null;
  }> {
    let queueStatus = null;

    if (this.cleanupQueue) {
      try {
        const [waiting, active, completed, failed] = await Promise.all([
          this.cleanupQueue.getWaiting(),
          this.cleanupQueue.getActive(),
          this.cleanupQueue.getCompleted(),
          this.cleanupQueue.getFailed(),
        ]);

        queueStatus = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
        };
      } catch (error) {
        console.error('[PLAYGROUND_CLEANUP] Failed to get queue status:', error);
      }
    }

    return {
      enabled: this.config.enabled,
      config: this.config,
      queueStatus,
    };
  }

  /**
   * Gracefully shutdown the cleanup service
   */
  async shutdown(): Promise<void> {
    console.log('[PLAYGROUND_CLEANUP] Shutting down cleanup service...');

    const promises: Promise<void>[] = [];

    if (this.cleanupWorker) {
      promises.push(this.cleanupWorker.close());
    }

    if (this.cleanupQueue) {
      promises.push(this.cleanupQueue.close());
    }

    if (this.cleanupQueueEvents) {
      promises.push(this.cleanupQueueEvents.close());
    }

    try {
      await Promise.all(promises);
      console.log('[PLAYGROUND_CLEANUP] Shutdown completed successfully');
    } catch (error) {
      console.error('[PLAYGROUND_CLEANUP] Error during shutdown:', error);
      throw error;
    }
  }
}

/**
 * Create and configure the playground cleanup service from environment variables
 */
export function createPlaygroundCleanupService(): PlaygroundCleanupService {
  const config: PlaygroundCleanupConfig = {
    enabled: process.env.PLAYGROUND_CLEANUP_ENABLED === 'true',
    cronSchedule: process.env.PLAYGROUND_CLEANUP_CRON || '0 */12 * * *', // Default: every 12 hours
    maxAgeHours: parseInt(process.env.PLAYGROUND_CLEANUP_MAX_AGE_HOURS || '24', 10), // Default: 24 hours
    bucketName: process.env.S3_TEST_BUCKET_NAME || 'playwright-test-artifacts', // Use test bucket for playground
    batchSize: 1000, // Process 1000 objects at a time
  };

  // Validate configuration
  if (config.enabled) {
    if (config.maxAgeHours <= 0) {
      throw new Error('PLAYGROUND_CLEANUP_MAX_AGE_HOURS must be greater than 0');
    }

    if (!config.cronSchedule) {
      throw new Error('PLAYGROUND_CLEANUP_CRON is required when cleanup is enabled');
    }

    // Basic cron validation (should have 5 or 6 parts)
    const cronParts = config.cronSchedule.split(/\s+/);
    if (cronParts.length !== 5 && cronParts.length !== 6) {
      throw new Error(`Invalid PLAYGROUND_CLEANUP_CRON format: ${config.cronSchedule}`);
    }
  }

  return new PlaygroundCleanupService(config);
}

/**
 * Global instance for use across the application
 */
let playgroundCleanupInstance: PlaygroundCleanupService | null = null;

export function getPlaygroundCleanupService(): PlaygroundCleanupService | null {
  return playgroundCleanupInstance;
}

export function setPlaygroundCleanupInstance(instance: PlaygroundCleanupService): void {
  playgroundCleanupInstance = instance;
}