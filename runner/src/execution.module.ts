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
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.registerQueue(
      {
        name: TEST_EXECUTION_QUEUE,
      },
      {
        name: JOB_EXECUTION_QUEUE,
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
  exports: [
    // Export services if they need to be used by other modules
    // ExecutionService, // Potentially useful if API endpoints are added later
  ],
})
export class ExecutionModule implements OnModuleInit {
  onModuleInit() {
    console.log('DB_PROVIDER_TOKEN:', DB_PROVIDER_TOKEN);
    console.log('Environment DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  }
}
