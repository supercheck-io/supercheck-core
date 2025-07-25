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

@Processor(MONITOR_SCHEDULER_QUEUE)
export class MonitorSchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitorSchedulerProcessor.name);

  constructor(
    @InjectQueue(MONITOR_EXECUTION_QUEUE) private monitorExecutionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<MonitorJobData, void, string>): Promise<any> {
    this.logger.log(
      `Processing scheduled monitor trigger: ${job.name} (${job.id})`,
    );
    await this.handleScheduledMonitorTrigger(job);
    return { success: true };
  }

  private async handleScheduledMonitorTrigger(job: Job) {
    const monitorId = job.data.monitorId;
    try {
      const data = job.data;
      this.logger.log(
        `Handling scheduled monitor trigger for monitor ${monitorId}`,
      );

      // Extract the jobData from the scheduler job and pass it to the execution queue
      const executionJobData = data.jobData;

      // Add job to execution queue (like job scheduler does)
      await this.monitorExecutionQueue.add(
        EXECUTE_MONITOR_JOB_NAME,
        executionJobData,
        {
          jobId: monitorId,
          attempts: data.retryLimit || 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: { count: 1000 },
        },
      );

      this.logger.log(
        `Created execution task for scheduled monitor ${monitorId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process scheduled monitor trigger for monitor ${monitorId}:`,
        error,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Scheduled monitor completed: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: any) {
    this.logger.error(`Scheduled monitor failed: ${job?.name}`, error);
  }
}
