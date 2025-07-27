import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { AlertType } from 'src/db/schema';
import {
  NotificationService,
  NotificationPayload,
  NotificationProvider,
} from 'src/notification/notification.service';

@Injectable()
export class MonitorAlertService {
  private readonly logger = new Logger(MonitorAlertService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  async sendNotification(
    monitorId: string,
    type: 'recovery' | 'failure',
    reason: string,
    metadata: any = {},
  ) {
    this.logger.log(
      `[NOTIFY] Manual notification trigger for monitor ${monitorId}, type: ${type}`,
    );

    const db = this.dbService.db;

    // Get monitor details
    const monitor = await db.query.monitors.findFirst({
      where: eq(schema.monitors.id, monitorId),
    });

    if (!monitor) {
      this.logger.error(`[NOTIFY] Monitor not found: ${monitorId}`);
      return;
    }

    // Check if alerts are enabled
    if (!monitor.alertConfig?.enabled) {
      this.logger.log(`[NOTIFY] Alerts not enabled for monitor ${monitorId}`);
      return;
    }

    // Get notification providers
    const providers = await db
      .select({
        id: schema.notificationProviders.id,
        type: schema.notificationProviders.type,
        config: schema.notificationProviders.config,
      })
      .from(schema.notificationProviders)
      .innerJoin(
        schema.monitorNotificationSettings,
        eq(
          schema.monitorNotificationSettings.notificationProviderId,
          schema.notificationProviders.id,
        ),
      )
      .where(eq(schema.monitorNotificationSettings.monitorId, monitorId));

    if (!providers || providers.length === 0) {
      this.logger.log(
        `[NOTIFY] No notification providers configured for monitor ${monitorId}`,
      );
      return;
    }

    // Determine notification details
    let notificationType: NotificationPayload['type'];
    let severity: 'info' | 'warning' | 'error' | 'success';
    let title: string;
    let message: string;

    switch (type) {
      case 'recovery':
        notificationType = 'monitor_recovery';
        severity = 'success';
        title = `Monitor Recovered - ${monitor.name}`;
        message = `Monitor "${monitor.name}" has recovered and is now operational.`;
        if (!monitor.alertConfig.alertOnRecovery) {
          this.logger.log(
            `[NOTIFY] Recovery notifications disabled for monitor ${monitorId}`,
          );
          return;
        }
        break;
      case 'failure':
        notificationType = 'monitor_failure';
        severity = 'error';
        title = `Monitor Down - ${monitor.name}`;
        message = `Monitor "${monitor.name}" is down. ${reason || 'No ping received within expected interval'}`;
        if (!monitor.alertConfig.alertOnFailure) {
          this.logger.log(
            `[NOTIFY] Failure notifications disabled for monitor ${monitorId}`,
          );
          return;
        }
        break;
      default: {
        const _exhaustiveCheck: never = type;
        this.logger.error(
          `[NOTIFY] Invalid notification type: ${String(type)}`,
        );
        return _exhaustiveCheck;
      }
    }

    const baseUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL');
    const dashboardUrl = `${baseUrl}/monitors/${monitor.id}`;

    const notificationPayload: NotificationPayload = {
      type: notificationType,
      title: title,
      message: monitor.alertConfig.customMessage || message,
      targetName: monitor.name,
      targetId: monitor.id,
      severity: severity,
      timestamp: new Date(),
      metadata: {
        target: monitor.target,
        type: monitor.type,
        status: type === 'recovery' ? 'up' : 'down',
        dashboardUrl,
        targetUrl: monitor.type === 'heartbeat' ? undefined : monitor.target,
        trigger: 'runner',
        reason: reason || 'Automated status change detection',
        monitorType: monitor.type,
        checkFrequency: monitor.frequencyMinutes
          ? `${monitor.frequencyMinutes}m`
          : undefined,
        lastCheckTime: monitor.lastCheckAt
          ? new Date(monitor.lastCheckAt).toISOString()
          : undefined,
        ...metadata,
      },
    };

    this.logger.log(
      `[NOTIFY] Sending ${notificationType} notifications to ${providers.length} providers`,
    );

    const { success: successCount, failed: failedCount } =
      await this.notificationService.sendNotificationToMultipleProviders(
        providers as NotificationProvider[],
        notificationPayload,
      );

    this.logger.log(
      `[NOTIFY] Notification results: ${successCount} success, ${failedCount} failed`,
    );

    let alertStatus: 'sent' | 'failed' | 'pending' = 'pending';
    let errorMessage: string | undefined;

    if (successCount > 0 && failedCount === 0) {
      alertStatus = 'sent';
    } else if (successCount === 0 && failedCount > 0) {
      alertStatus = 'failed';
      errorMessage = `All ${failedCount} notifications failed`;
    } else if (successCount > 0 && failedCount > 0) {
      alertStatus = 'sent';
      errorMessage = `${failedCount} of ${providers.length} notifications failed`;
    }

    await db.insert(schema.alertHistory).values({
      type: notificationType as AlertType,
      message: notificationPayload.message,
      target: monitor.name,
      targetType: 'monitor',
      monitorId: monitor.id,
      provider: providers.map((p) => p.type).join(', '),
      status: alertStatus,
      errorMessage,
      sentAt: new Date(),
    });
  }
}
