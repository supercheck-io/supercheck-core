import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from 'src/db/schema'; // Import the schema we copied
import { reports, jobs, runs } from 'src/db/schema'; // Specifically import reports table
import { eq, and, sql, desc } from 'drizzle-orm';
import { ReportMetadata } from '../interfaces'; // Import our interface

// Define a token for the Drizzle provider
export const DB_PROVIDER_TOKEN = 'DB_DRIZZLE';

@Injectable()
export class DbService implements OnModuleInit {
  private readonly logger = new Logger(DbService.name);

  constructor(
    @Inject(DB_PROVIDER_TOKEN) private dbInstance: PostgresJsDatabase<typeof schema>,
    private configService: ConfigService
  ) {
    this.logger.log('Drizzle ORM initialized.');
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
   * Stores or updates report metadata in the database.
   * Adapt based on ReportMetadata interface.
   */
  async storeReportMetadata(metadata: ReportMetadata): Promise<void> {
    const { entityId, entityType, reportPath, status, s3Url } = metadata;
    this.logger.debug(`Storing report metadata for ${entityType}/${entityId} with status ${status}`);

    try {
      const existing = await this.db.select()
        .from(reports)
        .where(and(
          eq(reports.entityId, entityId),
          eq(reports.entityType, entityType)
        ))
        .limit(1);

      if (existing.length > 0) {
        this.logger.debug(`Updating existing report metadata for ${entityType}/${entityId}`);
        await this.db.update(reports)
          .set({
            reportPath, // This is likely the S3 key now
            status,
            s3Url,
            updatedAt: new Date()
          })
          .where(and(
            eq(reports.entityId, entityId),
            eq(reports.entityType, entityType)
          ))
          .execute();
      } else {
        this.logger.debug(`Inserting new report metadata for ${entityType}/${entityId}`);
        await this.db.insert(reports)
          .values({
            entityId,
            entityType,
            reportPath, // S3 key
            status,
            s3Url,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .execute();
      }
      this.logger.log(`Successfully stored report metadata for ${entityType}/${entityId}`);
    } catch (error) {
      this.logger.error(`Error storing report metadata for ${entityType}/${entityId}: ${error.message}`, error.stack);
      // Decide whether to re-throw or just log
      // throw error; 
    }
  }

  /**
   * Updates the status of a job in the jobs table
   * @param jobId The ID of the job to update
   * @param status The new status to set
   */
  async updateJobStatus(
    jobId: string, 
    status: 'pending' | 'running' | 'passed' | 'failed' | 'error'
  ): Promise<void> {
    this.logger.debug(`Updating job status for job ${jobId} to ${status}`);
    
    try {
      await this.db.update(jobs)
        .set({
          status,
          updatedAt: new Date(),
          ...(status === 'passed' || status === 'failed' || status === 'error' ? { lastRunAt: new Date() } : {})
        })
        .where(eq(jobs.id, jobId))
        .execute();
        
      this.logger.log(`Successfully updated job status for job ${jobId} to ${status}`);
    } catch (error) {
      this.logger.error(`Error updating job status for job ${jobId}: ${error.message}`, error.stack);
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
    status: string,
    duration?: string
  ): Promise<void> {
    this.logger.debug(`Updating run ${runId} with status ${status} and duration ${duration}`);
    
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
          const secondsMatch = duration.match(/(\d+)s/) || duration.match(/^(\d+)$/);
          durationSeconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;
        }
        
        // Store both the numeric seconds and the formatted string
        updateData.duration = durationSeconds;
      }
      
      // Add completedAt timestamp for terminal statuses
      if (['completed', 'failed', 'passed', 'error'].includes(status)) {
        updateData.completedAt = now;
      }
      
      // Update the database
      await this.dbInstance
        .update(runs)
        .set(updateData)
        .where(eq(runs.id, runId));
      
      this.logger.log(`Successfully updated run ${runId} with status ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update run status: ${error.message}`, error.stack);
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
      this.logger.error(`Failed to get last run for job ${jobId}: ${error.message}`);
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
      this.logger.error(`Failed to get notification providers: ${error.message}`);
      return [];
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
      this.logger.error(`Failed to get recent runs for job ${jobId}: ${error.message}`);
      return [];
    }
  }
}
