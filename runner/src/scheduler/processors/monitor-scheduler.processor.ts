import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MONITOR_SCHEDULER_QUEUE, MONITOR_EXECUTION_QUEUE, EXECUTE_MONITOR_JOB_NAME } from '../constants';
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
    this.logger.log(`Triggered monitor: ${job.name} (Monitor ID: ${job.data.monitorId})`);
    
    // The data from the repeatable job is the MonitorJobData needed for execution
    const jobData = job.data;
    
    // Add a job to the execution queue
    await this.monitorExecutionQueue.add(EXECUTE_MONITOR_JOB_NAME, jobData, {
      jobId: jobData.monitorId, // Use monitorId for the execution job
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
    });
    
    this.logger.log(`Dispatched monitor execution job for monitor ${jobData.monitorId}`);
    return { success: true };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Scheduler job for monitor ${job.data.monitorId} completed, execution job dispatched.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: any) {
    this.logger.error(`Scheduler job for monitor ${job?.data?.monitorId} failed:`, error);
  }
} 