import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { HEARTBEAT_PING_NOTIFICATION_QUEUE } from '../monitor.constants';
import { MonitorAlertService } from '../services/monitor-alert.service';

export interface HeartbeatPingNotificationData {
    monitorId: string;
    type: 'recovery' | 'failure';
    reason: string;
    metadata?: Record<string, any>;
}

@Processor(HEARTBEAT_PING_NOTIFICATION_QUEUE)
export class HeartbeatPingNotificationProcessor extends WorkerHost {
    private readonly logger = new Logger(HeartbeatPingNotificationProcessor.name);

    constructor(private readonly notificationService: MonitorAlertService) {
        super();
    }

    async process(
        job: Job<HeartbeatPingNotificationData, any, string>,
    ): Promise<void> {
        const { monitorId, type, reason, metadata } = job.data;
        this.logger.log(
            `Processing heartbeat ping notification job ${job.id} for monitor ${monitorId} - Type: ${type}`,
        );

        try {
            await this.notificationService.sendNotification(
                monitorId,
                type,
                reason,
                metadata,
            );
            this.logger.log(
                `Successfully processed heartbeat notification for monitor ${monitorId}.`,
            );
        } catch (error) {
            this.logger.error(
                `Failed to process heartbeat notification for monitor ${monitorId}`,
                error,
            );
            // The job will be retried automatically based on queue settings
            throw error;
        }
    }
}
