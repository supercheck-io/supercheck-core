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
    job: Job<MonitorJobDataDto, MonitorExecutionResult[], string>,
  ): Promise<MonitorExecutionResult[]> {
    if (job.name === EXECUTE_MONITOR_JOB_NAME) {
      // Execute monitor from configured locations (single or multiple)
      return this.monitorService.executeMonitorWithLocations(job.data);
    }

    this.logger.warn(
      `Unknown job name: ${job.name} for job ID: ${job.id}. Throwing error.`,
    );
    throw new Error(`Unknown job name: ${job.name}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, results: MonitorExecutionResult[]) {
    // Save all location results with aggregation
    if (results && results.length > 0) {
      // Debug: Log synthetic test results if present
      const syntheticResults = results.filter((r) => r.testExecutionId);
      if (syntheticResults.length > 0) {
        this.logger.log(
          `[PROCESSOR] Saving ${syntheticResults.length} synthetic test result(s) from ${results.length} location(s)`,
        );
      }
      void this.monitorService.saveMonitorResults(results);
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
