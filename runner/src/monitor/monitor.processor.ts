import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { MonitorJobDataDto } from './dto/monitor-job.dto';
import { MONITOR_QUEUE, EXECUTE_MONITOR_JOB } from './monitor.constants';
import { MonitorExecutionResult } from './types/monitor-result.type';

@Processor(MONITOR_QUEUE)
export class MonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitorProcessor.name);

  constructor(
    private readonly monitorService: MonitorService,
  ) {
    super();
  }

  async process(job: Job<MonitorJobDataDto, MonitorExecutionResult, string>): Promise<MonitorExecutionResult> {
    this.logger.log(`Processing monitor job ${job.id} of type ${job.data.type} for monitor ${job.data.monitorId}`);
    
    if (job.name !== EXECUTE_MONITOR_JOB) {
        this.logger.warn(`Unknown job name: ${job.name}`);
        throw new Error(`Unknown job name: ${job.name}`);
    }

    let result: MonitorExecutionResult;
    try {
      result = await this.monitorService.executeMonitor(job.data);
      this.logger.log(`Monitor job ${job.id} completed. Result for monitor ${job.data.monitorId}: ${JSON.stringify(result)}`);
      
      // Save the result to the database
      try {
        await this.monitorService.saveMonitorResult(result);
        this.logger.log(`Successfully saved result to DB for monitor ${job.data.monitorId}`);
      } catch (dbError) {
        this.logger.error(`Failed to save result to DB for monitor ${job.data.monitorId}: ${dbError.message}`, dbError.stack);
        // Decide if this error should make the job fail or if we should still return the result
        // For now, let's log and still consider the primary execution successful if it reached here
      }
      
      return result; // Still return result for BullMQ job completion in this queue
    } catch (error) {
      this.logger.error(`Monitor job ${job.id} failed for monitor ${job.data.monitorId}: ${error.message}`, error.stack);
      throw error; 
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<MonitorJobDataDto, MonitorExecutionResult, string>) {
    this.logger.log(`Job ${job.id} (monitor ${job.data.monitorId}) has completed processing in runner.`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MonitorJobDataDto, MonitorExecutionResult, string> | undefined, err: Error) {
    const monitorId = job?.data?.monitorId || 'unknown_monitor';
    this.logger.error(`Job ${job?.id} (monitor ${monitorId}) has failed with error: ${err.message}`, err.stack);
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<MonitorJobDataDto, MonitorExecutionResult, string>, progress: number | object) {
    this.logger.log(`Job ${job.id} (monitor ${job.data.monitorId}) reported progress: ${JSON.stringify(progress)}`);
  }
} 