import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  MONITOR_SCHEDULER_QUEUE,
  MONITOR_EXECUTION_QUEUE,
  EXECUTE_MONITOR_JOB_NAME,
} from '../constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MonitorJobData } from '../interfaces';
import * as crypto from 'crypto';

@Processor(MONITOR_SCHEDULER_QUEUE)
export class MonitorSchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitorSchedulerProcessor.name);

  constructor(
    @InjectQueue(MONITOR_EXECUTION_QUEUE) private monitorExecutionQueue: Queue,
  ) {
    super();
  }

  async process(
    job: Job<MonitorJobData, void, string>,
  ): Promise<{ success: boolean }> {
    // Removed log - only log errors
    await this.handleScheduledMonitorTrigger(job);
    return { success: true };
  }

  private async handleScheduledMonitorTrigger(job: Job<MonitorJobData>) {
    const monitorId = job.data.monitorId;
    try {
      const data = job.data;
      // Removed log - only log errors

      // Extract the jobData from the scheduler job and pass it to the execution queue
      const executionJobData = data.jobData as unknown;

      // Generate a unique job ID to avoid conflicts (similar to job scheduler pattern)
      const uniqueJobId = `${monitorId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

      // Add job to execution queue (like job scheduler does)
      await this.monitorExecutionQueue.add(
        EXECUTE_MONITOR_JOB_NAME,
        executionJobData,
        {
          jobId: uniqueJobId,
          attempts: (data.retryLimit as number) || 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: { count: 1000 },
        },
      );

      // Removed log - only log errors
    } catch (error) {
      this.logger.error(
        `Failed to process scheduled monitor trigger for monitor ${monitorId}:`,
        error,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    // Removed log - only log errors
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: unknown) {
    this.logger.error(`Scheduled monitor failed: ${job?.name}`, error);
  }
}
