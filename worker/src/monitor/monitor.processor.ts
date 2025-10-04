import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { MonitorJobDataDto } from './dto/monitor-job.dto';
import {
  MONITOR_EXECUTION_QUEUE,
  EXECUTE_MONITOR_JOB_NAME,
} from './monitor.constants';
import { MonitorExecutionResult } from './types/monitor-result.type';

@Processor(MONITOR_EXECUTION_QUEUE)
export class MonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitorProcessor.name);

  constructor(private readonly monitorService: MonitorService) {
    super();
  }

  async process(
    job: Job<MonitorJobDataDto, MonitorExecutionResult | null, string>,
  ): Promise<MonitorExecutionResult | null> {
    if (job.name === EXECUTE_MONITOR_JOB_NAME) {
      // Removed log - only log errors and important events
      return this.monitorService.executeMonitor(job.data);
    }

    this.logger.warn(
      `Unknown job name: ${job.name} for job ID: ${job.id}. Throwing error.`,
    );
    throw new Error(`Unknown job name: ${job.name}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: MonitorExecutionResult) {
    // Removed log - only log errors and important events
    if (result) {
      // Debug: Log the result object to see what BullMQ is passing
      if (result.testExecutionId) {
        this.logger.log(
          `[PROCESSOR] Monitor result has testExecutionId: ${result.testExecutionId}, testReportS3Url: ${result.testReportS3Url}`,
        );
      }
      void this.monitorService.saveMonitorResult(result);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<MonitorJobDataDto, MonitorExecutionResult, string> | undefined,
    err: Error,
  ) {
    const monitorId = (job?.data as any)?.monitorId || 'unknown_monitor';
    this.logger.error(
      `Job ${job?.id} (monitor ${monitorId}) has failed with error: ${err.message}`,
      err.stack,
    );
  }

  @OnWorkerEvent('progress')
  onProgress(
    job: Job<MonitorJobDataDto, MonitorExecutionResult, string>,
    progress: number | object,
  ) {
    // Removed log - progress updates are too verbose
  }
}
