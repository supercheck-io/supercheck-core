import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { HEARTBEAT_CHECKER_QUEUE } from '../constants';
import { HeartbeatService } from '../../monitor/services/heartbeat.service';

@Processor(HEARTBEAT_CHECKER_QUEUE)
export class HeartbeatCheckerProcessor extends WorkerHost {
  private readonly logger = new Logger(HeartbeatCheckerProcessor.name);

  constructor(private readonly heartbeatService: HeartbeatService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Running heartbeat check: ${job.name}`);
    const checkIntervalMinutes = job.data?.checkIntervalMinutes || 5;
    
    const result = await this.heartbeatService.checkMissedHeartbeats(checkIntervalMinutes);
    
    this.logger.log(`Heartbeat check completed: ${result.checked} checked, ${result.missedCount} missed, ${result.skipped} skipped, ${result.errors.length} errors`);
    if (result.errors.length > 0) {
      this.logger.error(`Heartbeat check errors:`, result.errors);
    }
    
    return result;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(`Heartbeat check completed: ${result.checked} checked, ${result.missedCount} missed, ${result.skipped} skipped`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: any) {
    this.logger.error(`Heartbeat check failed:`, error);
  }
} 