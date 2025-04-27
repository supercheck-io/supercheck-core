import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
const postgres = require('postgres');
import * as schema from 'src/db/schema'; // Import the schema we copied
import { reports } from 'src/db/schema'; // Specifically import reports table
import { eq, and, sql } from 'drizzle-orm';
import { ReportMetadata } from '../interfaces'; // Import our interface

// Define a token for the Drizzle provider
export const DB_PROVIDER_TOKEN = 'DRIZZLE_ORM';

@Injectable()
export class DbService implements OnModuleInit {
  private readonly logger = new Logger(DbService.name);
  private dbInstance: PostgresJsDatabase<typeof schema>;

  constructor(private configService: ConfigService) {
    const connectionString = this.configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.error('DATABASE_URL environment variable is not set!');
      throw new Error('Database connection string is missing.');
    }

    // TODO: Add SSL config based on environment if needed
    // const sslConfig = this.configService.get('NODE_ENV') === 'production' ? { rejectUnauthorized: true } : false;
    const client = postgres(connectionString, { ssl: false /* ssl: sslConfig */ }); // Use the require'd postgres
    this.dbInstance = drizzle(client, { schema });
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
}
