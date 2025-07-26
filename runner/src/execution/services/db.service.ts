import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Redis } from 'ioredis';
import * as schema from 'src/db/schema'; // Import the schema we copied
import {
  reports,
  jobs,
  runs,
  JobStatus,
  TestRunStatus,
  alertHistory,
  AlertType,
  AlertStatus,
} from 'src/db/schema'; // Specifically import reports table
import { eq, and, sql, desc } from 'drizzle-orm';
import { ReportMetadata } from '../interfaces'; // Import our interface

// Define a token for the Drizzle provider
export const DB_PROVIDER_TOKEN = 'DB_DRIZZLE';

@Injectable()
export class DbService implements OnModuleInit {
  private readonly logger = new Logger(DbService.name);
  private redisClient: Redis;

  constructor(
    @Inject(DB_PROVIDER_TOKEN)
    private dbInstance: PostgresJsDatabase<typeof schema>,
    private configService: ConfigService,
  ) {
    this.logger.log('Drizzle ORM initialized.');

    // Initialize Redis client
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.redisClient = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.redisClient.on('error', (err) =>
      this.logger.error('Redis Error:', err),
    );
    this.redisClient.on('connect', () => this.logger.log('Redis Connected'));
  }

  async onModuleInit() {
    // Optional: Test connection on startup
    try {
      await this.dbInstance.select({ now: sql`now()` });
      this.logger.log('Database connection successful.');
    } catch (error) {
      this.logger.error('Database connection failed!', error);
    }
  }

  get db(): PostgresJsDatabase<typeof schema> {
    return this.dbInstance;
  }

  /**
   * Publishes status updates to Redis channels for SSE
   */
  private async publishStatusUpdate(channel: string, data: any): Promise<void> {
    try {
      await this.redisClient.publish(channel, JSON.stringify(data));
      this.logger.debug(
        `Published to Redis channel ${channel}: ${JSON.stringify(data)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish to Redis channel ${channel}: ${error.message}`,
      );
    }
  }

  /**
   * Stores or updates report metadata in the database.
   * Adapt based on ReportMetadata interface.
   */
  async storeReportMetadata(metadata: ReportMetadata): Promise<void> {
    const { entityId, entityType, reportPath, status, s3Url } = metadata;
    this.logger.debug(
      `Storing report metadata for ${entityType}/${entityId} with status ${status}`,
    );

    try {
      const existing = await this.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.entityId, entityId),
            eq(reports.entityType, entityType),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        this.logger.debug(
          `Updating existing report metadata for ${entityType}/${entityId}`,
        );
        await this.db
          .update(reports)
          .set({
            reportPath, // This is likely the S3 key now
            status,
            s3Url,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(reports.entityId, entityId),
              eq(reports.entityType, entityType),
            ),
          )
          .execute();
      } else {
        this.logger.debug(
          `Inserting new report metadata for ${entityType}/${entityId}`,
        );
        await this.db
          .insert(reports)
          .values({
            entityId,
            entityType,
            reportPath, // S3 key
            status,
            s3Url,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
      }
      this.logger.log(
        `Successfully stored report metadata for ${entityType}/${entityId}`,
      );

      // Publish test status update to Redis for SSE
      if (entityType === 'test') {
        const statusData = {
          status,
          testId: entityId,
          reportPath,
          s3Url,
          error: undefined,
        };

        // Publish to status channel
        await this.publishStatusUpdate(`test:${entityId}:status`, statusData);

        // If terminal status, publish to complete channel
        if (['completed', 'failed'].includes(status)) {
          await this.publishStatusUpdate(
            `test:${entityId}:complete`,
            statusData,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error storing report metadata for ${entityType}/${entityId}: ${error.message}`,
        error.stack,
      );
      // Decide whether to re-throw or just log
      // throw error;
    }
  }

  /**
   * Updates the status of a job in the jobs table
   * @param jobId The ID of the job to update
   * @param runStatuses Array of run statuses for the job
   */
  async updateJobStatus(
    jobId: string,
    runStatuses: ('pending' | 'running' | 'passed' | 'failed' | 'error')[],
  ): Promise<void> {
    try {
      // Determine the aggregate job status
      let jobStatus: JobStatus;
      if (runStatuses.some((s) => s === 'error')) {
        jobStatus = 'error';
      } else if (runStatuses.some((s) => s === 'failed')) {
        jobStatus = 'failed';
      } else if (runStatuses.some((s) => s === 'running' || s === 'pending')) {
        jobStatus = 'running';
      } else if (runStatuses.every((s) => s === 'passed')) {
        jobStatus = 'passed';
      } else {
        jobStatus = 'passed'; // Default to completed if all runs are done (and not failed)
      }

      this.logger.log(
        `Updating job ${jobId} status based on ${runStatuses.length} runs. Final status: ${jobStatus}`,
      );
      await this.db
        .update(jobs)
        .set({
          status: jobStatus,
        })
        .where(eq(jobs.id, jobId));
    } catch (error) {
      this.logger.error(`Failed to update job status for ${jobId}:`, error);
    }
  }

  /**
   * Updates the status and duration of a run in the runs table
   * @param runId The ID of the run to update
   * @param status The new status to set
   * @param duration The duration of the run (string like "3s" or "1m 30s")
   */
  async updateRunStatus(
    runId: string,
    status: TestRunStatus,
    duration?: string,
  ): Promise<void> {
    this.logger.debug(
      `Updating run ${runId} with status ${status} and duration ${duration}`,
    );

    try {
      const now = new Date();
      const updateData: any = {
        status,
      };

      // Add duration if provided - convert string duration to seconds (integer)
      if (duration) {
        // Extract just the seconds as integer
        let durationSeconds = 0;

        if (duration.includes('m')) {
          // Format like "1m 30s"
          const minutes = parseInt(duration.split('m')[0].trim(), 10) || 0;
          const secondsMatch = duration.match(/(\d+)s/);
          const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;
          durationSeconds = minutes * 60 + seconds;
        } else {
          // Format like "45s" or just number
          const secondsMatch =
            duration.match(/(\d+)s/) || duration.match(/^(\d+)$/);
          durationSeconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;
        }

        // Store both the numeric seconds and the formatted string
        updateData.duration = durationSeconds;
      }

      // Add completedAt timestamp for terminal statuses
      if (['failed', 'passed', 'error'].includes(status)) {
        updateData.completedAt = now;
      }

      // Update the database
      await this.dbInstance
        .update(runs)
        .set(updateData)
        .where(eq(runs.id, runId));

      this.logger.log(
        `Successfully updated run ${runId} with status ${status}`,
      );

      // Publish status update to Redis for SSE
      const statusData = {
        status,
        runId,
        duration: updateData.duration,
        startedAt: updateData.startedAt,
        completedAt: updateData.completedAt,
        errorDetails: updateData.errorDetails,
        artifactPaths: updateData.artifactPaths,
      };

      // Publish to status channel
      await this.publishStatusUpdate(`job:${runId}:status`, statusData);

      // If terminal status, publish to complete channel
      if (['completed', 'failed', 'passed', 'error'].includes(status)) {
        await this.publishStatusUpdate(`job:${runId}:complete`, statusData);
      }
    } catch (error) {
      this.logger.error(
        `Failed to update run status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Gets a job by ID including alert configuration
   * @param jobId The ID of the job to retrieve
   */
  async getJobById(jobId: string): Promise<any> {
    try {
      const job = await this.db.query.jobs.findFirst({
        where: (jobs, { eq }) => eq(jobs.id, jobId),
      });
      return job;
    } catch (error) {
      this.logger.error(`Failed to get job ${jobId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets the last run for a job
   * @param jobId The ID of the job to get the last run for
   */
  async getLastRunForJob(jobId: string): Promise<any> {
    try {
      const lastRun = await this.db.query.runs.findFirst({
        where: eq(schema.runs.jobId, jobId),
        orderBy: [desc(schema.runs.completedAt)],
      });
      return lastRun;
    } catch (error) {
      this.logger.error(
        `Failed to get last run for job ${jobId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Gets notification providers by IDs
   * @param providerIds Array of provider IDs
   */
  async getNotificationProviders(providerIds: string[]): Promise<any[]> {
    try {
      if (!providerIds || providerIds.length === 0) {
        return [];
      }

      const providers = await this.db.query.notificationProviders.findMany({
        where: (notificationProviders, { inArray }) =>
          inArray(notificationProviders.id, providerIds),
      });

      return providers || [];
    } catch (error) {
      this.logger.error(
        `Failed to get notification providers: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Saves an alert history record to the database
   */
  async saveAlertHistory(
    jobId: string,
    type: AlertType,
    provider: string,
    status: AlertStatus,
    message: string,
    errorMessage?: string,
  ): Promise<void> {
    try {
      // Get the actual job name
      const job = await this.getJobById(jobId);
      const jobName = job?.name || `Job ${jobId}`;

      await this.db.insert(alertHistory).values({
        jobId,
        type,
        provider,
        status,
        message,
        sentAt: new Date(),
        errorMessage,
        target: jobName,
        targetType: 'job',
      });

      this.logger.log(
        `Successfully saved alert history for job ${jobId} with status: ${status}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to save alert history for job ${jobId}:`,
        error,
      );
      throw new Error('Internal Server Error');
    }
  }

  /**
   * Get recent runs for a job to check alert thresholds
   */
  async getRecentRunsForJob(jobId: string, limit: number = 5) {
    try {
      const runs = await this.db
        .select({
          id: schema.runs.id,
          status: schema.runs.status,
          createdAt: schema.runs.createdAt,
        })
        .from(schema.runs)
        .where(eq(schema.runs.jobId, jobId))
        .orderBy(desc(schema.runs.createdAt))
        .limit(limit);

      return runs;
    } catch (error) {
      this.logger.error(
        `Failed to get recent runs for job ${jobId}: ${error.message}`,
      );
      return [];
    }
  }

  async getRunStatusesForJob(
    jobId: string,
  ): Promise<('pending' | 'running' | 'passed' | 'failed' | 'error')[]> {
    try {
      const result = await this.db
        .select({ status: runs.status })
        .from(runs)
        .where(eq(runs.jobId, jobId));

      return result.map((r) => r.status).filter((s) => s !== null) as (
        | 'pending'
        | 'running'
        | 'passed'
        | 'failed'
        | 'error'
      )[];
    } catch (error) {
      this.logger.error(`Failed to get run statuses for job ${jobId}:`, error);
      return [];
    }
  }
}
