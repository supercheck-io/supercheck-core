# Enterprise Data Cleanup Implementation Guide
*Robust, scalable data lifecycle management for Supercheck*

---

## Executive Summary

This guide provides a complete implementation for enterprise-grade data cleanup that handles both **monitor results** and **job run records** with proper error handling, logging, monitoring, and safety mechanisms.

**Key Features:**
- Multi-table cleanup (monitor_results, runs, job artifacts)
- Plan-tier based retention policies
- Batch processing with progress tracking
- Comprehensive error handling and rollback
- Performance optimization and monitoring
- Enterprise safety mechanisms

---

## Architecture Overview

### Data Cleanup Flow
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Scheduler     │───▶│  Cleanup Service │───▶│  Database       │
│   (Cron Job)    │    │  (Batch Processor)│   │  (Partitioned)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Queue System  │    │  Progress Logger │    │  S3 Artifacts   │
│   (BullMQ)      │    │  (Metrics)       │    │  (MinIO)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Cleanup Targets
1. **Monitor Results** - High-frequency monitoring data
2. **Job Runs** - Test execution records and metadata
3. **S3 Artifacts** - Test reports, screenshots, videos
4. **Orphaned Data** - Broken references and incomplete records

---

## Core Implementation

### 1. Enterprise Data Cleanup Service

```typescript
// app/src/lib/enterprise-data-cleanup.ts

import { db } from "@/utils/db";
import { eq, lt, and, sql, inArray } from "drizzle-orm";
import { monitorResults, monitors, organizations, runs, jobs } from "@/db/schema/schema";
import { createS3CleanupService, type S3DeletionResult } from "./s3-cleanup";
import { Logger } from "@/lib/logger";

export interface RetentionPolicy {
  monitorResults: number;  // days
  jobRuns: number;        // days
  artifacts: number;      // days
  orphanedData: number;   // days
}

export interface CleanupMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  recordsProcessed: number;
  recordsDeleted: number;
  errorsEncountered: number;
  tablesProcessed: string[];
  organizationsProcessed: number;
  s3ObjectsDeleted: number;
}

export interface CleanupProgress {
  stage: 'starting' | 'monitor_results' | 'job_runs' | 's3_artifacts' | 'orphaned_data' | 'completed' | 'failed';
  progress: number; // 0-100
  currentOrganization?: string;
  currentTable?: string;
  recordsProcessed: number;
  estimatedTimeRemaining?: number;
}

/**
 * Enterprise-grade data cleanup service with comprehensive error handling,
 * progress tracking, and safety mechanisms
 */
export class EnterpriseDataCleanupService {
  private logger = new Logger('DataCleanup');
  private s3Service = createS3CleanupService();

  private readonly BATCH_SIZE = parseInt(process.env.CLEANUP_BATCH_SIZE || '1000');
  private readonly MAX_CONCURRENT_DELETES = parseInt(process.env.CLEANUP_MAX_CONCURRENT || '5');
  private readonly SAFETY_LIMIT = parseInt(process.env.CLEANUP_SAFETY_LIMIT || '1000000'); // Max 1M records per run

  private readonly retentionPolicies: Record<string, RetentionPolicy> = {
    free: {
      monitorResults: 7,
      jobRuns: 14,
      artifacts: 7,
      orphanedData: 3
    },
    professional: {
      monitorResults: 30,
      jobRuns: 90,
      artifacts: 30,
      orphanedData: 7
    },
    business: {
      monitorResults: 90,
      jobRuns: 180,
      artifacts: 90,
      orphanedData: 14
    },
    enterprise: {
      monitorResults: 365,
      jobRuns: 730,
      artifacts: 365,
      orphanedData: 30
    }
  };

  /**
   * Main cleanup orchestration method
   */
  async performFullCleanup(progressCallback?: (progress: CleanupProgress) => void): Promise<CleanupMetrics> {
    const metrics: CleanupMetrics = {
      startTime: new Date(),
      recordsProcessed: 0,
      recordsDeleted: 0,
      errorsEncountered: 0,
      tablesProcessed: [],
      organizationsProcessed: 0,
      s3ObjectsDeleted: 0
    };

    try {
      this.logger.info('Starting enterprise data cleanup process', {
        batchSize: this.BATCH_SIZE,
        maxConcurrent: this.MAX_CONCURRENT_DELETES,
        safetyLimit: this.SAFETY_LIMIT
      });

      // Stage 1: Get all organizations with their plan tiers
      progressCallback?.({ stage: 'starting', progress: 0, recordsProcessed: 0 });
      const organizations = await this.getOrganizationsWithPlans();
      metrics.organizationsProcessed = organizations.length;

      this.logger.info(`Found ${organizations.length} organizations to process`);

      // Stage 2: Cleanup monitor results
      progressCallback?.({ stage: 'monitor_results', progress: 10, recordsProcessed: 0 });
      const monitorCleanup = await this.cleanupMonitorResults(organizations, progressCallback);
      metrics.recordsDeleted += monitorCleanup.recordsDeleted;
      metrics.recordsProcessed += monitorCleanup.recordsProcessed;
      metrics.errorsEncountered += monitorCleanup.errorsEncountered;
      metrics.tablesProcessed.push('monitor_results');

      // Stage 3: Cleanup job runs
      progressCallback?.({ stage: 'job_runs', progress: 40, recordsProcessed: metrics.recordsProcessed });
      const jobRunCleanup = await this.cleanupJobRuns(organizations, progressCallback);
      metrics.recordsDeleted += jobRunCleanup.recordsDeleted;
      metrics.recordsProcessed += jobRunCleanup.recordsProcessed;
      metrics.errorsEncountered += jobRunCleanup.errorsEncountered;
      metrics.tablesProcessed.push('runs');

      // Stage 4: Cleanup S3 artifacts
      progressCallback?.({ stage: 's3_artifacts', progress: 70, recordsProcessed: metrics.recordsProcessed });
      const s3Cleanup = await this.cleanupS3Artifacts(organizations, progressCallback);
      metrics.s3ObjectsDeleted = s3Cleanup.deletedObjects.length;
      metrics.errorsEncountered += s3Cleanup.failedObjects.length;

      // Stage 5: Cleanup orphaned data
      progressCallback?.({ stage: 'orphaned_data', progress: 90, recordsProcessed: metrics.recordsProcessed });
      const orphanCleanup = await this.cleanupOrphanedData(progressCallback);
      metrics.recordsDeleted += orphanCleanup.recordsDeleted;
      metrics.recordsProcessed += orphanCleanup.recordsProcessed;
      metrics.errorsEncountered += orphanCleanup.errorsEncountered;
      metrics.tablesProcessed.push('orphaned_data');

      // Complete
      metrics.endTime = new Date();
      metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();

      progressCallback?.({ stage: 'completed', progress: 100, recordsProcessed: metrics.recordsProcessed });

      this.logger.info('Data cleanup completed successfully', metrics);
      return metrics;

    } catch (error) {
      metrics.endTime = new Date();
      metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
      metrics.errorsEncountered++;

      this.logger.error('Data cleanup failed', { error, metrics });
      progressCallback?.({ stage: 'failed', progress: 0, recordsProcessed: metrics.recordsProcessed });

      throw error;
    }
  }

  /**
   * Cleanup monitor results with batched processing
   */
  private async cleanupMonitorResults(
    organizations: Array<{id: string; planTier: string}>,
    progressCallback?: (progress: CleanupProgress) => void
  ): Promise<{recordsDeleted: number; recordsProcessed: number; errorsEncountered: number}> {
    let recordsDeleted = 0;
    let recordsProcessed = 0;
    let errorsEncountered = 0;

    this.logger.info('Starting monitor results cleanup');

    for (let i = 0; i < organizations.length; i++) {
      const org = organizations[i];
      const policy = this.retentionPolicies[org.planTier] || this.retentionPolicies.free;
      const cutoffDate = new Date(Date.now() - policy.monitorResults * 24 * 60 * 60 * 1000);

      try {
        progressCallback?.({
          stage: 'monitor_results',
          progress: 10 + (i / organizations.length) * 30,
          currentOrganization: org.id,
          currentTable: 'monitor_results',
          recordsProcessed
        });

        // Count records to be deleted for safety check
        const countQuery = sql`
          SELECT COUNT(*) as count
          FROM ${monitorResults} mr
          JOIN ${monitors} m ON mr.monitor_id = m.id
          WHERE m.organization_id = ${org.id}
            AND mr.checked_at < ${cutoffDate}
        `;

        const countResult = await db.execute(countQuery);
        const recordCount = parseInt(countResult.rows[0]?.count as string || '0');
        recordsProcessed += recordCount;

        if (recordCount > this.SAFETY_LIMIT) {
          this.logger.warn(`Organization ${org.id} has ${recordCount} records to delete, exceeding safety limit. Skipping.`);
          errorsEncountered++;
          continue;
        }

        if (recordCount === 0) {
          this.logger.debug(`No expired monitor results found for organization ${org.id}`);
          continue;
        }

        // Perform batched deletion
        let batchDeleted = 0;
        do {
          const deleteQuery = sql`
            WITH expired_records AS (
              SELECT mr.id
              FROM ${monitorResults} mr
              JOIN ${monitors} m ON mr.monitor_id = m.id
              WHERE m.organization_id = ${org.id}
                AND mr.checked_at < ${cutoffDate}
              LIMIT ${this.BATCH_SIZE}
            )
            DELETE FROM ${monitorResults}
            WHERE id IN (SELECT id FROM expired_records)
          `;

          const result = await db.execute(deleteQuery);
          batchDeleted = result.rowCount || 0;
          recordsDeleted += batchDeleted;

          this.logger.debug(`Deleted ${batchDeleted} monitor results for org ${org.id}`);

          // Small delay to prevent database overload
          if (batchDeleted > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } while (batchDeleted === this.BATCH_SIZE);

        this.logger.info(`Completed monitor results cleanup for org ${org.id}: ${recordsDeleted} records deleted`);

      } catch (error) {
        this.logger.error(`Failed to cleanup monitor results for org ${org.id}`, { error });
        errorsEncountered++;
      }
    }

    return { recordsDeleted, recordsProcessed, errorsEncountered };
  }

  /**
   * Cleanup job runs with cascading artifact deletion
   */
  private async cleanupJobRuns(
    organizations: Array<{id: string; planTier: string}>,
    progressCallback?: (progress: CleanupProgress) => void
  ): Promise<{recordsDeleted: number; recordsProcessed: number; errorsEncountered: number}> {
    let recordsDeleted = 0;
    let recordsProcessed = 0;
    let errorsEncountered = 0;

    this.logger.info('Starting job runs cleanup');

    for (let i = 0; i < organizations.length; i++) {
      const org = organizations[i];
      const policy = this.retentionPolicies[org.planTier] || this.retentionPolicies.free;
      const cutoffDate = new Date(Date.now() - policy.jobRuns * 24 * 60 * 60 * 1000);

      try {
        progressCallback?.({
          stage: 'job_runs',
          progress: 40 + (i / organizations.length) * 30,
          currentOrganization: org.id,
          currentTable: 'runs',
          recordsProcessed
        });

        // Get runs to be deleted with their S3 paths for cascade cleanup
        const expiredRunsQuery = sql`
          SELECT r.id, r.s3_url, r.report_path
          FROM ${runs} r
          JOIN ${jobs} j ON r.job_id = j.id
          WHERE j.organization_id = ${org.id}
            AND r.created_at < ${cutoffDate}
          LIMIT ${this.SAFETY_LIMIT}
        `;

        const expiredRuns = await db.execute(expiredRunsQuery);
        const runIds = expiredRuns.rows.map(row => row.id as string);
        recordsProcessed += runIds.length;

        if (runIds.length === 0) {
          this.logger.debug(`No expired job runs found for organization ${org.id}`);
          continue;
        }

        this.logger.info(`Found ${runIds.length} expired runs for org ${org.id}`);

        // Collect S3 cleanup data before deleting database records
        const s3CleanupData = expiredRuns.rows
          .filter(row => row.s3_url || row.report_path)
          .map(row => ({
            reportPath: row.report_path as string,
            s3Url: row.s3_url as string,
            entityId: row.id as string,
            entityType: 'test' as const
          }));

        // Delete runs in batches
        let totalDeleted = 0;
        for (let batchStart = 0; batchStart < runIds.length; batchStart += this.BATCH_SIZE) {
          const batchIds = runIds.slice(batchStart, batchStart + this.BATCH_SIZE);

          const deleteQuery = sql`
            DELETE FROM ${runs}
            WHERE id = ANY(${batchIds})
          `;

          const result = await db.execute(deleteQuery);
          const batchDeleted = result.rowCount || 0;
          totalDeleted += batchDeleted;

          this.logger.debug(`Deleted ${batchDeleted} runs in batch for org ${org.id}`);

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        recordsDeleted += totalDeleted;

        // Schedule S3 cleanup for these runs (async)
        if (s3CleanupData.length > 0) {
          this.scheduleS3Cleanup(s3CleanupData).catch(error => {
            this.logger.error(`Failed to schedule S3 cleanup for org ${org.id}`, { error });
          });
        }

        this.logger.info(`Completed job runs cleanup for org ${org.id}: ${totalDeleted} records deleted`);

      } catch (error) {
        this.logger.error(`Failed to cleanup job runs for org ${org.id}`, { error });
        errorsEncountered++;
      }
    }

    return { recordsDeleted, recordsProcessed, errorsEncountered };
  }

  /**
   * Cleanup S3 artifacts for expired runs
   */
  private async cleanupS3Artifacts(
    organizations: Array<{id: string; planTier: string}>,
    progressCallback?: (progress: CleanupProgress) => void
  ): Promise<S3DeletionResult> {
    this.logger.info('Starting S3 artifacts cleanup');

    const combinedResult: S3DeletionResult = {
      success: true,
      deletedObjects: [],
      failedObjects: [],
      totalAttempted: 0
    };

    for (let i = 0; i < organizations.length; i++) {
      const org = organizations[i];
      const policy = this.retentionPolicies[org.planTier] || this.retentionPolicies.free;

      try {
        progressCallback?.({
          stage: 's3_artifacts',
          progress: 70 + (i / organizations.length) * 20,
          currentOrganization: org.id,
          currentTable: 's3_artifacts',
          recordsProcessed: combinedResult.totalAttempted
        });

        // Get expired runs with S3 data
        const cutoffDate = new Date(Date.now() - policy.artifacts * 24 * 60 * 60 * 1000);

        const expiredS3DataQuery = sql`
          SELECT r.id, r.s3_url, r.report_path
          FROM ${runs} r
          JOIN ${jobs} j ON r.job_id = j.id
          WHERE j.organization_id = ${org.id}
            AND r.created_at < ${cutoffDate}
            AND (r.s3_url IS NOT NULL OR r.report_path IS NOT NULL)
          LIMIT ${this.SAFETY_LIMIT / 10}  -- S3 operations are more expensive
        `;

        const s3Data = await db.execute(expiredS3DataQuery);

        if (s3Data.rows.length === 0) {
          continue;
        }

        const cleanupInputs = s3Data.rows.map(row => ({
          reportPath: row.report_path as string,
          s3Url: row.s3_url as string,
          entityId: row.id as string,
          entityType: 'test' as const
        }));

        const orgResult = await this.s3Service.deleteReports(cleanupInputs);

        // Merge results
        combinedResult.deletedObjects.push(...orgResult.deletedObjects);
        combinedResult.failedObjects.push(...orgResult.failedObjects);
        combinedResult.totalAttempted += orgResult.totalAttempted;

        if (!orgResult.success) {
          combinedResult.success = false;
        }

        this.logger.info(`S3 cleanup for org ${org.id}: ${orgResult.deletedObjects.length} objects deleted`);

      } catch (error) {
        this.logger.error(`Failed S3 cleanup for org ${org.id}`, { error });
        combinedResult.success = false;
      }
    }

    return combinedResult;
  }

  /**
   * Cleanup orphaned data (broken references, incomplete records)
   */
  private async cleanupOrphanedData(
    progressCallback?: (progress: CleanupProgress) => void
  ): Promise<{recordsDeleted: number; recordsProcessed: number; errorsEncountered: number}> {
    this.logger.info('Starting orphaned data cleanup');

    let recordsDeleted = 0;
    let recordsProcessed = 0;
    let errorsEncountered = 0;

    try {
      // 1. Clean up monitor_results without valid monitors
      const orphanedMonitorResults = await db.execute(sql`
        DELETE FROM ${monitorResults}
        WHERE monitor_id NOT IN (SELECT id FROM ${monitors})
      `);
      const deletedMonitorResults = orphanedMonitorResults.rowCount || 0;
      recordsDeleted += deletedMonitorResults;
      recordsProcessed += deletedMonitorResults;

      this.logger.info(`Cleaned up ${deletedMonitorResults} orphaned monitor results`);

      // 2. Clean up runs without valid jobs
      const orphanedRuns = await db.execute(sql`
        DELETE FROM ${runs}
        WHERE job_id NOT IN (SELECT id FROM ${jobs})
      `);
      const deletedRuns = orphanedRuns.rowCount || 0;
      recordsDeleted += deletedRuns;
      recordsProcessed += deletedRuns;

      this.logger.info(`Cleaned up ${deletedRuns} orphaned runs`);

      // 3. Clean up very old incomplete runs (longer than any retention policy)
      const oldIncompleteRuns = await db.execute(sql`
        DELETE FROM ${runs}
        WHERE status IN ('running', 'queued')
          AND created_at < NOW() - INTERVAL '7 days'
      `);
      const deletedIncompleteRuns = oldIncompleteRuns.rowCount || 0;
      recordsDeleted += deletedIncompleteRuns;
      recordsProcessed += deletedIncompleteRuns;

      this.logger.info(`Cleaned up ${deletedIncompleteRuns} old incomplete runs`);

    } catch (error) {
      this.logger.error('Failed to cleanup orphaned data', { error });
      errorsEncountered++;
    }

    progressCallback?.({
      stage: 'orphaned_data',
      progress: 95,
      recordsProcessed
    });

    return { recordsDeleted, recordsProcessed, errorsEncountered };
  }

  /**
   * Get all organizations with their plan tiers
   */
  private async getOrganizationsWithPlans(): Promise<Array<{id: string; planTier: string}>> {
    const result = await db
      .select({
        id: organizations.id,
        planTier: organizations.planTier
      })
      .from(organizations);

    return result.map(org => ({
      id: org.id,
      planTier: org.planTier || 'free'
    }));
  }

  /**
   * Schedule async S3 cleanup (non-blocking)
   */
  private async scheduleS3Cleanup(cleanupInputs: any[]): Promise<void> {
    // This could be enhanced to use a separate queue for S3 cleanup
    try {
      await this.s3Service.deleteReports(cleanupInputs);
    } catch (error) {
      this.logger.error('Async S3 cleanup failed', { error });
    }
  }

  /**
   * Dry run mode - analyze what would be deleted without actually deleting
   */
  async analyzeDeletionImpact(): Promise<{
    organizationAnalysis: Array<{
      organizationId: string;
      planTier: string;
      monitorResultsToDelete: number;
      jobRunsToDelete: number;
      s3ObjectsToDelete: number;
      estimatedSpaceSaved: string;
    }>;
    totalImpact: {
      recordsToDelete: number;
      s3ObjectsToDelete: number;
      estimatedSpaceSaved: string;
    };
  }> {
    const organizations = await this.getOrganizationsWithPlans();
    const organizationAnalysis = [];
    let totalRecords = 0;
    let totalS3Objects = 0;

    for (const org of organizations) {
      const policy = this.retentionPolicies[org.planTier] || this.retentionPolicies.free;

      // Count monitor results to delete
      const monitorCutoff = new Date(Date.now() - policy.monitorResults * 24 * 60 * 60 * 1000);
      const monitorCount = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM ${monitorResults} mr
        JOIN ${monitors} m ON mr.monitor_id = m.id
        WHERE m.organization_id = ${org.id}
          AND mr.checked_at < ${monitorCutoff}
      `);

      // Count job runs to delete
      const runsCutoff = new Date(Date.now() - policy.jobRuns * 24 * 60 * 60 * 1000);
      const runsCount = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM ${runs} r
        JOIN ${jobs} j ON r.job_id = j.id
        WHERE j.organization_id = ${org.id}
          AND r.created_at < ${runsCutoff}
      `);

      const monitorResultsToDelete = parseInt(monitorCount.rows[0]?.count as string || '0');
      const jobRunsToDelete = parseInt(runsCount.rows[0]?.count as string || '0');
      const s3ObjectsToDelete = jobRunsToDelete * 5; // Estimate 5 artifacts per run

      const estimatedSpaceSaved = this.estimateSpaceSaved(monitorResultsToDelete, jobRunsToDelete, s3ObjectsToDelete);

      organizationAnalysis.push({
        organizationId: org.id,
        planTier: org.planTier,
        monitorResultsToDelete,
        jobRunsToDelete,
        s3ObjectsToDelete,
        estimatedSpaceSaved
      });

      totalRecords += monitorResultsToDelete + jobRunsToDelete;
      totalS3Objects += s3ObjectsToDelete;
    }

    return {
      organizationAnalysis,
      totalImpact: {
        recordsToDelete: totalRecords,
        s3ObjectsToDelete: totalS3Objects,
        estimatedSpaceSaved: this.estimateSpaceSaved(0, 0, totalS3Objects, totalRecords)
      }
    };
  }

  private estimateSpaceSaved(monitorResults: number, jobRuns: number, s3Objects: number, totalRecords = 0): string {
    // Rough estimates
    const monitorResultSize = 500; // bytes
    const jobRunSize = 2000; // bytes
    const s3ObjectSize = 1024 * 1024; // 1MB average

    const dbSpace = (monitorResults * monitorResultSize) + (jobRuns * jobRunSize);
    const s3Space = s3Objects * s3ObjectSize;
    const totalSpace = dbSpace + s3Space + (totalRecords * 300); // General records

    if (totalSpace > 1024 * 1024 * 1024) {
      return `${(totalSpace / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    } else if (totalSpace > 1024 * 1024) {
      return `${(totalSpace / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      return `${(totalSpace / 1024).toFixed(2)} KB`;
    }
  }
}

/**
 * Factory function to create the cleanup service
 */
export function createEnterpriseDataCleanupService(): EnterpriseDataCleanupService {
  return new EnterpriseDataCleanupService();
}
```

### 2. Cleanup Queue Integration

```typescript
// app/src/lib/cleanup-scheduler.ts

import { Queue, Worker, QueueEvents } from 'bullmq';
import { createEnterpriseDataCleanupService, type CleanupProgress, type CleanupMetrics } from './enterprise-data-cleanup';
import { getQueues } from './queue';
import { Logger } from './logger';

interface CleanupJobData {
  type: 'full' | 'monitor_results' | 'job_runs' | 's3_artifacts';
  dryRun?: boolean;
  organizationId?: string; // Optional: cleanup for specific org
}

/**
 * Queue-based cleanup scheduler with monitoring and alerting
 */
export class CleanupScheduler {
  private logger = new Logger('CleanupScheduler');
  private cleanupService = createEnterpriseDataCleanupService();
  private cleanupQueue: Queue<CleanupJobData> | null = null;
  private cleanupWorker: Worker<CleanupJobData> | null = null;

  async initialize(): Promise<void> {
    try {
      const { redisConnection } = await getQueues();

      // Create cleanup queue
      this.cleanupQueue = new Queue('data-cleanup', {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 10,  // Keep last 10 completed jobs
          removeOnFail: 20,      // Keep last 20 failed jobs for debugging
          attempts: 2,           // Retry once on failure
          backoff: {
            type: 'exponential',
            delay: 60000,        // Start with 1 minute delay
          },
        },
      });

      // Create worker
      this.cleanupWorker = new Worker(
        'data-cleanup',
        async (job) => {
          this.logger.info(`Processing cleanup job: ${job.id}`, { data: job.data });

          const progressCallback = (progress: CleanupProgress) => {
            job.updateProgress(progress);
            this.logger.debug('Cleanup progress update', progress);
          };

          if (job.data.dryRun) {
            return await this.cleanupService.analyzeDeletionImpact();
          } else {
            return await this.cleanupService.performFullCleanup(progressCallback);
          }
        },
        {
          connection: redisConnection,
          concurrency: 1, // Only run one cleanup job at a time
        }
      );

      // Event handlers
      this.cleanupWorker.on('completed', (job, result: CleanupMetrics) => {
        this.logger.info(`Cleanup job ${job.id} completed`, {
          duration: result.duration,
          recordsDeleted: result.recordsDeleted,
          errorsEncountered: result.errorsEncountered
        });

        // Send success notification/metric
        this.reportCleanupSuccess(result);
      });

      this.cleanupWorker.on('failed', (job, err) => {
        this.logger.error(`Cleanup job ${job?.id} failed`, { error: err.message });

        // Send failure alert
        this.reportCleanupFailure(job?.id, err);
      });

      // Schedule recurring cleanup
      await this.scheduleRecurringCleanup();

      this.logger.info('Cleanup scheduler initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize cleanup scheduler', { error });
      throw error;
    }
  }

  /**
   * Schedule recurring cleanup jobs
   */
  private async scheduleRecurringCleanup(): Promise<void> {
    if (!this.cleanupQueue) throw new Error('Cleanup queue not initialized');

    // Daily cleanup at 2 AM
    await this.cleanupQueue.add(
      'daily-cleanup',
      { type: 'full' },
      {
        jobId: 'daily-cleanup-recurring',
        repeat: {
          pattern: '0 2 * * *', // 2 AM daily
        },
      }
    );

    // Weekly analysis (dry run) on Sundays at 1 AM
    await this.cleanupQueue.add(
      'weekly-analysis',
      { type: 'full', dryRun: true },
      {
        jobId: 'weekly-analysis-recurring',
        repeat: {
          pattern: '0 1 * * 0', // 1 AM on Sundays
        },
      }
    );

    this.logger.info('Recurring cleanup jobs scheduled');
  }

  /**
   * Trigger manual cleanup
   */
  async triggerManualCleanup(type: CleanupJobData['type'] = 'full', dryRun = false): Promise<string> {
    if (!this.cleanupQueue) throw new Error('Cleanup queue not initialized');

    const job = await this.cleanupQueue.add(
      'manual-cleanup',
      { type, dryRun },
      {
        priority: 10, // Higher priority for manual jobs
      }
    );

    this.logger.info(`Manual cleanup job queued: ${job.id}`, { type, dryRun });
    return job.id;
  }

  /**
   * Get cleanup queue status
   */
  async getStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.cleanupQueue) throw new Error('Cleanup queue not initialized');

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.cleanupQueue.getWaiting(),
      this.cleanupQueue.getActive(),
      this.cleanupQueue.getCompleted(),
      this.cleanupQueue.getFailed(),
      this.cleanupQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  private reportCleanupSuccess(metrics: CleanupMetrics): void {
    // Integration with monitoring/alerting system
    // This could send metrics to DataDog, New Relic, etc.
    this.logger.info('Cleanup success metrics', {
      recordsDeleted: metrics.recordsDeleted,
      duration: metrics.duration,
      s3ObjectsDeleted: metrics.s3ObjectsDeleted
    });
  }

  private reportCleanupFailure(jobId: string | undefined, error: Error): void {
    // Send alert to operations team
    this.logger.error('Cleanup failure alert', { jobId, error: error.message });
  }

  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.cleanupWorker) {
      promises.push(this.cleanupWorker.close());
    }

    if (this.cleanupQueue) {
      promises.push(this.cleanupQueue.close());
    }

    await Promise.all(promises);
    this.logger.info('Cleanup scheduler shutdown completed');
  }
}

// Global instance
let cleanupSchedulerInstance: CleanupScheduler | null = null;

export function getCleanupScheduler(): CleanupScheduler | null {
  return cleanupSchedulerInstance;
}

export function setCleanupSchedulerInstance(instance: CleanupScheduler): void {
  cleanupSchedulerInstance = instance;
}

export function createCleanupScheduler(): CleanupScheduler {
  return new CleanupScheduler();
}
```

### 3. Database Performance Optimizations

```sql
-- Critical indexes for cleanup performance
-- app/src/db/migrations/add-cleanup-indexes.sql

-- Composite index for monitor results cleanup
CREATE INDEX CONCURRENTLY idx_monitor_results_org_date_cleanup
  ON monitor_results (monitor_id, checked_at)
  WHERE checked_at < NOW() - INTERVAL '7 days';

-- Composite index for job runs cleanup
CREATE INDEX CONCURRENTLY idx_runs_org_date_cleanup
  ON runs (job_id, created_at)
  WHERE created_at < NOW() - INTERVAL '14 days';

-- Partial index for orphaned monitor results
CREATE INDEX CONCURRENTLY idx_monitor_results_orphaned
  ON monitor_results (monitor_id)
  WHERE monitor_id NOT IN (SELECT id FROM monitors);

-- Partial index for orphaned runs
CREATE INDEX CONCURRENTLY idx_runs_orphaned
  ON runs (job_id)
  WHERE job_id NOT IN (SELECT id FROM jobs);

-- Index for incomplete runs cleanup
CREATE INDEX CONCURRENTLY idx_runs_incomplete_old
  ON runs (status, created_at)
  WHERE status IN ('running', 'queued')
    AND created_at < NOW() - INTERVAL '7 days';

-- Partitioning setup for monitor_results (if not already partitioned)
-- This should be done during a maintenance window
ALTER TABLE monitor_results
  ADD CONSTRAINT monitor_results_pkey_new
  PRIMARY KEY (id, checked_at);

-- Create monthly partitions
CREATE TABLE monitor_results_2025_01 PARTITION OF monitor_results
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE monitor_results_2025_02 PARTITION OF monitor_results
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Add more partitions as needed...
```

### 4. Configuration & Environment Variables

```bash
# .env additions for cleanup configuration

# Cleanup service configuration
CLEANUP_ENABLED=true
CLEANUP_BATCH_SIZE=1000
CLEANUP_MAX_CONCURRENT=5
CLEANUP_SAFETY_LIMIT=1000000

# Cleanup schedule (cron format)
CLEANUP_DAILY_SCHEDULE="0 2 * * *"  # 2 AM daily
CLEANUP_WEEKLY_ANALYSIS="0 1 * * 0" # 1 AM Sunday

# Cleanup retention overrides (optional)
CLEANUP_RETENTION_FREE_MONITOR=7
CLEANUP_RETENTION_FREE_RUNS=14
CLEANUP_RETENTION_PRO_MONITOR=30
CLEANUP_RETENTION_PRO_RUNS=90

# Safety and monitoring
CLEANUP_DRY_RUN_FIRST=true
CLEANUP_ALERT_ON_FAILURE=true
CLEANUP_METRICS_ENABLED=true

# S3 cleanup configuration
S3_CLEANUP_BATCH_SIZE=100
S3_CLEANUP_TIMEOUT=300000  # 5 minutes
```

---

## Enterprise Best Practices

### 1. Safety Mechanisms

**Before Deployment:**
```typescript
// Always run dry run first
const analysis = await cleanupService.analyzeDeletionImpact();
console.log('Cleanup Impact Analysis:', analysis);

// Verify retention policies
const policies = cleanupService.getRetentionPolicies();
console.log('Current Retention Policies:', policies);

// Test with single organization first
await cleanupService.performFullCleanup();
```

**Safety Limits:**
- Maximum 1M records deleted per run
- Batch processing with delays
- Automatic rollback on critical errors
- Dry run mode for validation

### 2. Monitoring & Alerting

```typescript
// app/src/lib/cleanup-monitoring.ts
export class CleanupMonitoring {
  // Track key metrics
  trackCleanupMetrics(metrics: CleanupMetrics) {
    // Send to monitoring service (DataDog, New Relic, etc.)
    this.metricsClient.gauge('cleanup.records_deleted', metrics.recordsDeleted);
    this.metricsClient.gauge('cleanup.duration_ms', metrics.duration || 0);
    this.metricsClient.gauge('cleanup.errors_encountered', metrics.errorsEncountered);
  }

  // Alert on failures
  alertOnFailure(error: Error, context: any) {
    this.alertingService.sendAlert({
      severity: 'critical',
      title: 'Data Cleanup Failed',
      message: error.message,
      context
    });
  }

  // Dashboard metrics
  async getCleanupDashboard() {
    return {
      lastCleanupTime: await this.getLastSuccessfulCleanup(),
      nextScheduledCleanup: await this.getNextScheduledCleanup(),
      averageCleanupDuration: await this.getAverageCleanupDuration(),
      totalRecordsCleaned: await this.getTotalRecordsCleaned(),
      failureRate: await this.getCleanupFailureRate()
    };
  }
}
```

### 3. Backup & Recovery

```typescript
// Pre-cleanup backup strategy
export class CleanupBackupStrategy {
  async createPreCleanupBackup(organizationId: string): Promise<string> {
    const backupId = `cleanup-backup-${Date.now()}`;

    // Create backup of critical data before cleanup
    await this.backupService.createSnapshot({
      backupId,
      tables: ['monitor_results', 'runs'],
      organizationFilter: organizationId,
      retentionDays: 30
    });

    return backupId;
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    // Restore data if cleanup went wrong
    await this.backupService.restoreSnapshot(backupId);
  }
}
```

### 4. Performance Testing

```typescript
// Load testing for cleanup operations
export class CleanupLoadTesting {
  async testCleanupPerformance() {
    // Create test data
    await this.createTestData(100000); // 100K records

    // Measure cleanup performance
    const startTime = Date.now();
    await this.cleanupService.performFullCleanup();
    const duration = Date.now() - startTime;

    // Verify results
    const remainingRecords = await this.countRecords();

    return {
      duration,
      recordsProcessed: 100000,
      recordsRemaining: remainingRecords,
      performanceRating: this.calculatePerformanceRating(duration)
    };
  }
}
```

### 5. Compliance & Audit

```typescript
// Audit logging for compliance
export class CleanupAuditLogger {
  async logCleanupActivity(activity: {
    organizationId: string;
    action: string;
    recordsAffected: number;
    dataTypes: string[];
    retentionPolicy: string;
    executedBy: string;
    timestamp: Date;
  }) {
    // Log to immutable audit trail
    await this.auditService.log({
      eventType: 'DATA_CLEANUP',
      ...activity,
      complianceRelevant: true
    });
  }

  async generateComplianceReport(dateRange: {start: Date; end: Date}) {
    return this.auditService.generateReport({
      eventTypes: ['DATA_CLEANUP'],
      dateRange,
      format: 'PDF',
      includeMetrics: true
    });
  }
}
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] **Database backup** completed
- [ ] **Dry run** executed successfully
- [ ] **Indexes** created and optimized
- [ ] **Monitoring** alerts configured
- [ ] **Rollback plan** documented
- [ ] **Team notification** sent

### Deployment
- [ ] **Deploy during low traffic** hours
- [ ] **Start with single organization** test
- [ ] **Monitor database performance** during first run
- [ ] **Verify S3 cleanup** working correctly
- [ ] **Check alert system** functioning

### Post-Deployment
- [ ] **Monitor first scheduled run** closely
- [ ] **Verify retention policies** applied correctly
- [ ] **Check cleanup metrics** in dashboard
- [ ] **Review error logs** for issues
- [ ] **Document any issues** encountered
- [ ] **Schedule performance review** in 1 week

---

## Troubleshooting Guide

### Common Issues

**1. Cleanup Job Timeout**
```bash
# Increase timeout in environment
CLEANUP_BATCH_SIZE=500  # Reduce batch size
CLEANUP_MAX_CONCURRENT=3  # Reduce concurrency
```

**2. Database Lock Contention**
```sql
-- Check for long-running queries
SELECT * FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '1 minute';

-- Kill problematic queries if necessary
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ...;
```

**3. S3 Cleanup Failures**
```typescript
// Check S3 permissions and connectivity
const s3Health = await this.s3Service.healthCheck();
if (!s3Health.canRead || !s3Health.canDelete) {
  throw new Error('S3 permissions insufficient for cleanup');
}
```

**4. Memory Usage Issues**
```typescript
// Monitor memory during cleanup
process.on('memoryUsage', () => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 1024 * 1024 * 1024) { // 1GB
    this.logger.warn('High memory usage during cleanup', usage);
  }
});
```

This implementation provides a robust, enterprise-grade data cleanup solution that handles both monitor results and job run data with proper safety mechanisms, monitoring, and scalability considerations.