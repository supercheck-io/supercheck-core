import { Module, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as postgres from 'postgres';

// Import Services and Processors
import { ExecutionService } from './execution/services/execution.service';
import { S3Service } from './execution/services/s3.service';
import { DbService, DB_PROVIDER_TOKEN } from './execution/services/db.service';
import { RedisService } from './execution/services/redis.service';
import { TestExecutionProcessor } from './execution/processors/test-execution.processor';
import { JobExecutionProcessor } from './execution/processors/job-execution.processor';
import { NotificationModule } from './notification/notification.module';
import * as schema from './db/schema';

// Import constants from constants file
import {
  TEST_EXECUTION_QUEUE,
  JOB_EXECUTION_QUEUE,
} from './execution/constants';

// Define common job options with TTL settings
const defaultJobOptions = {
  removeOnComplete: { count: 500, age: 24 * 3600 }, // Keep completed jobs for 24 hours (500 max)
  removeOnFail: { count: 1000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (1000 max)
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
};

// PostgreSQL database connection provider
const drizzleProvider: Provider = {
  provide: DB_PROVIDER_TOKEN,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set!');
    }

    // Creating database connection

    // Initialize the Postgres.js client
    const client = postgres(connectionString, { ssl: false });

    // Create and return the Drizzle ORM instance
    return drizzle(client, { schema });
  },
};

@Module({
  imports: [
    NotificationModule,
    BullModule.registerQueue(
      {
        name: TEST_EXECUTION_QUEUE,
        defaultJobOptions,
        // Note: Worker concurrency is controlled by the processor options
      },
      {
        name: JOB_EXECUTION_QUEUE,
        defaultJobOptions,
        // Note: Worker concurrency is controlled by the processor options
      },
    ),
  ],
  providers: [
    // Add database provider
    drizzleProvider,
    // Add all services and processors here
    ExecutionService,
    S3Service,
    DbService,
    RedisService,
    TestExecutionProcessor,
    JobExecutionProcessor,
  ],
  exports: [drizzleProvider, DbService, RedisService],
})
export class ExecutionModule {}
