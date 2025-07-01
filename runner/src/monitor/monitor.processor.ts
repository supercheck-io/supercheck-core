import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { MonitorJobDataDto } from './dto/monitor-job.dto';
import { MONITOR_EXECUTION_QUEUE, EXECUTE_MONITOR_JOB_NAME } from './monitor.constants';
import { MonitorExecutionResult } from './types/monitor-result.type';
import { NotificationService, NotificationPayload } from '../notification/notification.service';
import { DbService } from '../db/db.service';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { MonitorJobData } from '../execution/interfaces';

@Processor(MONITOR_EXECUTION_QUEUE)
export class MonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitorProcessor.name);

  constructor(
    private readonly monitorService: MonitorService,
    private readonly notificationService: NotificationService,
    private readonly dbService: DbService,
  ) {
    super();
  }

  async process(job: Job<MonitorJobDataDto, MonitorExecutionResult | null, string>): Promise<MonitorExecutionResult | null> {
    if (job.name === EXECUTE_MONITOR_JOB_NAME) {
      this.logger.log(
        `Executing monitor check for ${job.data.type} on target: ${job.data.target} (Job ID: ${job.id})`,
      );
      return this.monitorService.executeMonitor(job.data);
    }

    this.logger.warn(`Unknown job name: ${job.name} for job ID: ${job.id}. Throwing error.`);
    throw new Error(`Unknown job name: ${job.name}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: MonitorExecutionResult) {
    this.logger.log(`Job ${job.id} (monitor ${job.data.monitorId}) has completed processing in runner.`);
    if (result) {
      this.monitorService.saveMonitorResult(result);
      this.handleNotifications(job.data, result);
    }
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

  private async handleNotifications(jobData: MonitorJobDataDto, result: MonitorExecutionResult) {
    try {
      // Get monitor configuration including alert settings
      const monitor = await this.monitorService.getMonitorById(jobData.monitorId);
      if (!monitor || !monitor.alertConfig?.enabled) {
        this.logger.debug(`No alerts configured for monitor ${jobData.monitorId}`);
        return; // No alerts configured
      }

      // Get notification providers
      const providers = await this.monitorService.getNotificationProviders(jobData.monitorId);
      if (!providers || providers.length === 0) {
        this.logger.debug(`No notification providers configured for monitor ${jobData.monitorId}`);
        return; // No providers configured
      }

      // Get the previous result to check if status has changed
      const previousResult = await this.dbService.db.query.monitorResults.findFirst({
        where: eq(schema.monitorResults.monitorId, jobData.monitorId),
        orderBy: [desc(schema.monitorResults.checkedAt)],
      });

      // Only send notifications if:
      // 1. This is the first check (no previous result)
      // 2. The status has changed from the previous check
      // 3. SSL expiration warning needs to be sent
      const isFirstCheck = !previousResult;
      const hasStatusChanged = previousResult && previousResult.isUp !== result.isUp;
      const shouldNotifyFailure = monitor.alertConfig.alertOnFailure && !result.isUp && (isFirstCheck || hasStatusChanged);
      const shouldNotifyRecovery = monitor.alertConfig.alertOnRecovery && result.isUp && hasStatusChanged;
      const shouldNotifySSL = monitor.alertConfig.alertOnSslExpiration && 
                            result.details?.sslCertificate?.daysRemaining !== undefined &&
                            result.details.sslCertificate.daysRemaining <= (monitor.config?.sslDaysUntilExpirationWarning || 30);

      if (!shouldNotifyFailure && !shouldNotifyRecovery && !shouldNotifySSL) {
        this.logger.debug(`No notification conditions met for monitor ${jobData.monitorId}. Status: ${result.status}, IsUp: ${result.isUp}`);
        return; // No notification conditions met
      }

      // Create notification payload
      let notificationType: NotificationPayload['type'];
      let severity: NotificationPayload['severity'];
      let title: string;
      let message: string;

      if (shouldNotifySSL) {
        notificationType = 'ssl_expiring';
        severity = 'warning';
        title = `SSL Certificate Expiring - ${monitor.name}`;
        message = `SSL certificate for ${monitor.name} (${monitor.target}) will expire in ${result.details?.sslCertificate?.daysRemaining} days`;
      } else if (shouldNotifyFailure) {
        notificationType = 'monitor_failure';
        severity = 'error';
        title = `Monitor Down - ${monitor.name}`;
        message = result.details?.errorMessage || `Monitor ${monitor.name} is down`;
      } else if (shouldNotifyRecovery) {
        notificationType = 'monitor_recovery';
        severity = 'success';
        title = `Monitor Recovered - ${monitor.name}`;
        message = `Monitor ${monitor.name} is back online`;
      } else {
        // Fallback case - should never reach here due to the conditions above
        notificationType = 'monitor_failure';
        severity = 'error';
        title = `Monitor Alert - ${monitor.name}`;
        message = `Alert for monitor ${monitor.name}`;
      }

      const payload: NotificationPayload = {
        type: notificationType,
        title,
        message: monitor.alertConfig.customMessage || message,
        targetName: monitor.name,
        targetId: monitor.id,
        severity,
        timestamp: new Date(),
        metadata: {
          responseTime: result.responseTimeMs,
          status: result.status,
          target: monitor.target,
          type: monitor.type,
          sslCertificate: result.details?.sslCertificate,
        },
      };

      // Send notifications
      this.logger.log(`Sending notifications for monitor ${monitor.id}: ${notificationType} to ${providers.length} providers`);
      const notificationResult = await this.notificationService.sendNotificationToMultipleProviders(providers, payload);
      this.logger.log(`Sent notifications for monitor ${monitor.id}: ${notificationResult.success} success, ${notificationResult.failed} failed`);
      
      // Save alert history directly to the database
      try {
        // Determine the correct status based on notification results
        let alertStatus: 'sent' | 'failed' | 'pending' = 'pending';
        let errorMessage: string | undefined;

        if (notificationResult.success > 0 && notificationResult.failed === 0) {
          alertStatus = 'sent';
        } else if (notificationResult.success === 0 && notificationResult.failed > 0) {
          alertStatus = 'failed';
          errorMessage = `All ${notificationResult.failed} notifications failed`;
        } else if (notificationResult.success > 0 && notificationResult.failed > 0) {
          alertStatus = 'sent'; // Some succeeded, consider it sent
          errorMessage = `${notificationResult.failed} of ${providers.length} notifications failed`;
        }

        await this.dbService.db.insert(schema.alertHistory).values({
          type: notificationType,
          message: payload.message,
          target: monitor.name,
          targetType: 'monitor',
          monitorId: monitor.id,
          provider: providers.map(p => p.type).join(', '),
          status: alertStatus,
          errorMessage,
          sentAt: new Date(),
        });

        this.logger.log(`Alert history saved for monitor ${monitor.id} with status: ${alertStatus}`);
      } catch (error) {
        this.logger.error(`Error saving alert history: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send notifications for monitor ${jobData.monitorId}: ${error.message}`, error.stack);
    }
  }
} 