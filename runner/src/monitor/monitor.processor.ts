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
import { eq, desc, and, gte } from 'drizzle-orm';
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
      this.logger.debug(`[NOTIFICATION] Processing notifications for monitor ${jobData.monitorId}, result: ${result.status}, isUp: ${result.isUp}`);
      
      // Get monitor configuration including alert settings
      const monitor = await this.monitorService.getMonitorById(jobData.monitorId);
      if (!monitor) {
        this.logger.warn(`[NOTIFICATION] Monitor ${jobData.monitorId} not found`);
        return;
      }

      // Check if alerts are enabled
      if (!monitor.alertConfig?.enabled) {
        this.logger.debug(`[NOTIFICATION] No alerts configured for monitor ${jobData.monitorId}`);
        return;
      }

      // Get notification providers
      const providers = await this.monitorService.getNotificationProviders(jobData.monitorId);
      if (!providers || providers.length === 0) {
        this.logger.debug(`[NOTIFICATION] No notification providers configured for monitor ${jobData.monitorId}`);
        return;
      }

      // Get recent results to check for status changes and prevent duplicates
      const recentResults = await this.dbService.db.query.monitorResults.findMany({
        where: eq(schema.monitorResults.monitorId, jobData.monitorId),
        orderBy: [desc(schema.monitorResults.checkedAt)],
        limit: 10, // Get more results to better understand the pattern
      });

      // Current result is the most recent one (just saved)
      const currentResult = recentResults[0];
      const previousResult = recentResults[1]; // Second most recent

      this.logger.debug(`[NOTIFICATION] Current result: ${currentResult?.status}/${currentResult?.isUp}, Previous result: ${previousResult?.status}/${previousResult?.isUp}`);

      // Determine if we should send notifications
      const isFirstCheck = !previousResult;
      const hasStatusChanged = previousResult && previousResult.isUp !== currentResult.isUp;
      
      // Check for recent duplicate alerts to prevent spam
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentAlerts = await this.dbService.db.query.alertHistory.findMany({
        where: and(
          eq(schema.alertHistory.monitorId, jobData.monitorId),
          gte(schema.alertHistory.sentAt, oneHourAgo)
        ),
        orderBy: [desc(schema.alertHistory.sentAt)],
        limit: 5,
      });

      // Determine notification conditions
      const shouldNotifyFailure = monitor.alertConfig.alertOnFailure && 
                                !currentResult.isUp && 
                                (isFirstCheck || hasStatusChanged) &&
                                !this.hasRecentAlertOfType(recentAlerts, 'monitor_failure');

      const shouldNotifyRecovery = monitor.alertConfig.alertOnRecovery && 
                                 currentResult.isUp && 
                                 hasStatusChanged &&
                                 !this.hasRecentAlertOfType(recentAlerts, 'monitor_recovery');

      const shouldNotifySSL = monitor.alertConfig.alertOnSslExpiration && 
                            result.details?.sslCertificate?.daysRemaining !== undefined &&
                            result.details.sslCertificate.daysRemaining <= (monitor.config?.sslDaysUntilExpirationWarning || 30) &&
                            !this.hasRecentAlertOfType(recentAlerts, 'ssl_expiring');

      this.logger.debug(`[NOTIFICATION] Notification conditions - Failure: ${shouldNotifyFailure}, Recovery: ${shouldNotifyRecovery}, SSL: ${shouldNotifySSL}`);

      if (!shouldNotifyFailure && !shouldNotifyRecovery && !shouldNotifySSL) {
        this.logger.debug(`[NOTIFICATION] No notification conditions met for monitor ${jobData.monitorId}`);
        return;
      }

      // Create notification payload with enhanced context
      let notificationType: NotificationPayload['type'];
      let severity: NotificationPayload['severity'];
      let title: string;
      let message: string;

      if (shouldNotifySSL) {
        notificationType = 'ssl_expiring';
        severity = 'warning';
        title = `🔒 SSL Certificate Expiring - ${monitor.name}`;
        message = `SSL certificate for ${monitor.name} will expire in ${result.details?.sslCertificate?.daysRemaining} days. Please renew it to avoid service interruption.`;
      } else if (shouldNotifyFailure) {
        notificationType = 'monitor_failure';
        severity = 'error';
        title = `🚨 Monitor Down - ${monitor.name}`;
        message = `Monitor "${monitor.name}" is currently down. ${result.details?.errorMessage || 'No additional details available.'}`;
      } else if (shouldNotifyRecovery) {
        notificationType = 'monitor_recovery';
        severity = 'success';
        title = `✅ Monitor Recovered - ${monitor.name}`;
        message = `Monitor "${monitor.name}" is back online and functioning normally.`;
      } else {
        // Fallback case - should never reach here due to the conditions above
        notificationType = 'monitor_failure';
        severity = 'error';
        title = `⚠️ Monitor Alert - ${monitor.name}`;
        message = `Alert for monitor "${monitor.name}".`;
      }

      // Create enhanced payload with more context
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
          errorMessage: result.details?.errorMessage,
          monitorType: monitor.type,
          checkFrequency: `${monitor.frequencyMinutes || 'N/A'} minutes`,
          lastCheckTime: result.checkedAt.toISOString(),
        },
      };

      // Send notifications
      this.logger.log(`[NOTIFICATION] Sending ${notificationType} notifications for monitor ${monitor.id} to ${providers.length} providers`);
      const notificationResult = await this.notificationService.sendNotificationToMultipleProviders(providers, payload);
      this.logger.log(`[NOTIFICATION] Notification results for monitor ${monitor.id}: ${notificationResult.success} success, ${notificationResult.failed} failed`);
      
      // Save alert history to prevent duplicates and for audit trail
      try {
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

        this.logger.log(`[NOTIFICATION] Alert history saved for monitor ${monitor.id} with status: ${alertStatus}`);
      } catch (error) {
        this.logger.error(`[NOTIFICATION] Error saving alert history: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`[NOTIFICATION] Failed to process notifications for monitor ${jobData.monitorId}: ${error.message}`, error.stack);
    }
  }

  private hasRecentAlertOfType(recentAlerts: any[], alertType: string): boolean {
    // Check if we have sent this type of alert in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    return recentAlerts.some(alert => 
      alert.type === alertType && 
      alert.status === 'sent' && 
      new Date(alert.sentAt) > thirtyMinutesAgo
    );
  }
} 