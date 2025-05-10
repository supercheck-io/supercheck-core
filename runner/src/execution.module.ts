import { Module, OnModuleInit, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';

// Import Services and Processors
import { ExecutionService } from './execution/services/execution.service';
import { S3Service } from './execution/services/s3.service';
import { DbService, DB_PROVIDER_TOKEN } from './execution/services/db.service';
import { ValidationService } from './execution/services/validation.service';
import { RedisService } from './execution/services/redis.service';
import { TestExecutionProcessor } from './execution/processors/test-execution.processor';
import { JobExecutionProcessor } from './execution/processors/job-execution.processor';
import * as schema from './db/schema';

// Define queue names (consider moving to constants file)
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';

// Define common job options with TTL settings
const defaultJobOptions = {
  removeOnComplete: { count: 1000, age: 24 * 3600 }, // Keep completed jobs for 24 hours (1000 max)
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 }, // Keep failed jobs for 7 days (5000 max)
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 }
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
    
    console.log('Creating database connection with URL:', connectionString.substring(0, 30) + '...');
    
    // Import postgres directly here to avoid issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postgres = require('postgres');
    
    // Initialize the Postgres.js client
    const client = postgres(connectionString, { ssl: false });
    
    // Create and return the Drizzle ORM instance
    return drizzle(client, { schema });
  },
};

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: TEST_EXECUTION_QUEUE,
        defaultJobOptions
      },
      {
        name: JOB_EXECUTION_QUEUE,
        defaultJobOptions
      }
    ),
  ],
  providers: [
    // Add database provider
    drizzleProvider,
    // Add all services and processors here
    ExecutionService,
    S3Service,
    DbService,
    ValidationService,
    RedisService,
    TestExecutionProcessor,
    JobExecutionProcessor,
  ],
})
export class ExecutionModule {}
