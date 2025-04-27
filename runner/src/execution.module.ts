import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

// Import Services and Processors
import { ExecutionService } from './execution/services/execution.service';
import { S3Service } from './execution/services/s3.service';
import { DbService } from './execution/services/db.service';
import { ValidationService } from './execution/services/validation.service';
import { RedisService } from './execution/services/redis.service';
import { TestExecutionProcessor } from './execution/processors/test-execution.processor';
import { JobExecutionProcessor } from './execution/processors/job-execution.processor';

// Define queue names (consider moving to constants file)
export const TEST_EXECUTION_QUEUE = 'test-execution';
export const JOB_EXECUTION_QUEUE = 'job-execution';

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
export class ExecutionModule {}
