import { db as getDbInstance } from "@/lib/db";
import { 
  monitors, 
  monitorResults, 
  notificationProviders, 
  monitorNotificationSettings,
  type NotificationProviderType,
  type NotificationProviderConfig,
  type MonitorResultStatus
} from "@/db/schema/schema";
import { eq, and, desc } from "drizzle-orm";
import nodemailer from 'nodemailer';

export interface AlertContext {
  monitorId: string;
  monitorName: string;
  monitorTarget: string;
  monitorType: string;
  status: MonitorResultStatus;
  previousStatus?: MonitorResultStatus;
  errorMessage?: string;
  responseTime?: number;
  checkedAt: Date;
  isStatusChange: boolean;
  consecutiveFailures?: number;
}

export class AlertService {
  private static instance: AlertService;

  public static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  /**
   * Process alert for a monitor result
   * This should be called from the monitor execution service when a result is saved
   */
  async processMonitorAlert(alertContext: AlertContext): Promise<void> {
    try {
      console.log(`[Alert Service] Processing alert for monitor ${alertContext.monitorId}, status: ${alertContext.status}, isStatusChange: ${alertContext.isStatusChange}`);

      // Only send alerts for status changes or critical failures
      if (!alertContext.isStatusChange && alertContext.status !== 'error') {
        console.log(`[Alert Service] No status change and not critical error, skipping alert for monitor ${alertContext.monitorId}`);
        return;
      }

      const db = await getDbInstance();
      
      // Get notification settings for this monitor
      const notificationSettings = await db
        .select({
          providerId: monitorNotificationSettings.notificationProviderId,
          providerType: notificationProviders.type,
          providerConfig: notificationProviders.config,
          isEnabled: notificationProviders.isEnabled,
        })
        .from(monitorNotificationSettings)
        .innerJoin(
          notificationProviders,
          eq(monitorNotificationSettings.notificationProviderId, notificationProviders.id)
        )
        .where(
          and(
            eq(monitorNotificationSettings.monitorId, alertContext.monitorId),
            eq(notificationProviders.isEnabled, true)
          )
        );

      if (notificationSettings.length === 0) {
        console.log(`[Alert Service] No notification providers configured for monitor ${alertContext.monitorId}`);
        return;
      }

      // Send alerts through all configured providers
      const alertPromises = notificationSettings.map(setting => 
        this.sendAlert(setting.providerType, setting.providerConfig, alertContext)
      );

      await Promise.allSettled(alertPromises);
      console.log(`[Alert Service] Processed ${alertPromises.length} alert notifications for monitor ${alertContext.monitorId}`);

    } catch (error) {
      console.error(`[Alert Service] Error processing alert for monitor ${alertContext.monitorId}:`, error);
    }
  }

  /**
   * Send alert through specific notification provider
   */
  private async sendAlert(
    providerType: NotificationProviderType,
    config: NotificationProviderConfig,
    context: AlertContext
  ): Promise<void> {
    try {
      switch (providerType) {
        case 'email':
          await this.sendEmailAlert(config, context);
          break;
        case 'slack':
          await this.sendSlackAlert(config, context);
          break;
        case 'webhook':
          await this.sendWebhookAlert(config, context);
          break;
        case 'telegram':
          await this.sendTelegramAlert(config, context);
          break;
        case 'discord':
          await this.sendDiscordAlert(config, context);
          break;
        default:
          console.warn(`[Alert Service] Unsupported provider type: ${providerType}`);
      }
    } catch (error) {
      console.error(`[Alert Service] Failed to send ${providerType} alert:`, error);
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(config: NotificationProviderConfig, context: AlertContext): Promise<void> {
    if (!config.smtpHost || !config.toEmail) {
      throw new Error('Email configuration incomplete');
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 587,
      secure: config.smtpSecure || false,
      auth: config.smtpUser ? {
        user: config.smtpUser,
        pass: config.smtpPassword,
      } : undefined,
    });

    const subject = this.generateEmailSubject(context);
    const html = this.generateEmailBody(context);

    await transporter.sendMail({
      from: config.fromEmail || config.smtpUser,
      to: config.toEmail,
      subject,
      html,
    });

    console.log(`[Alert Service] Email alert sent for monitor ${context.monitorId}`);
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(config: NotificationProviderConfig, context: AlertContext): Promise<void> {
    if (!config.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const payload = {
      text: this.generateSlackMessage(context),
      attachments: [{
        color: this.getAlertColor(context.status),
        fields: [
          {
            title: 'Monitor',
            value: context.monitorName,
            short: true
          },
          {
            title: 'Target',
            value: context.monitorTarget,
            short: true
          },
          {
            title: 'Status',
            value: context.status.toUpperCase(),
            short: true
          },
          {
            title: 'Time',
            value: context.checkedAt.toISOString(),
            short: true
          }
        ]
      }]
    };

    if (context.errorMessage) {
      payload.attachments[0].fields.push({
        title: 'Error',
        value: context.errorMessage,
        short: false
      });
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }

    console.log(`[Alert Service] Slack alert sent for monitor ${context.monitorId}`);
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(config: NotificationProviderConfig, context: AlertContext): Promise<void> {
    if (!config.url) {
      throw new Error('Webhook URL not configured');
    }

    const method = config.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    let body: string | undefined;
    if (method !== 'GET') {
      const payload = {
        monitorId: context.monitorId,
        monitorName: context.monitorName,
        monitorTarget: context.monitorTarget,
        monitorType: context.monitorType,
        status: context.status,
        previousStatus: context.previousStatus,
        errorMessage: context.errorMessage,
        responseTime: context.responseTime,
        checkedAt: context.checkedAt.toISOString(),
        isStatusChange: context.isStatusChange,
      };

      body = config.bodyTemplate 
        ? this.interpolateTemplate(config.bodyTemplate, payload)
        : JSON.stringify(payload);
    }

    const response = await fetch(config.url, {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }

    console.log(`[Alert Service] Webhook alert sent for monitor ${context.monitorId}`);
  }

  /**
   * Send Telegram alert
   */
  private async sendTelegramAlert(config: NotificationProviderConfig, context: AlertContext): Promise<void> {
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram configuration incomplete');
    }

    const message = this.generateTelegramMessage(context);
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API failed: ${response.statusText}`);
    }

    console.log(`[Alert Service] Telegram alert sent for monitor ${context.monitorId}`);
  }

  /**
   * Send Discord alert
   */
  private async sendDiscordAlert(config: NotificationProviderConfig, context: AlertContext): Promise<void> {
    if (!config.discordWebhookUrl) {
      throw new Error('Discord webhook URL not configured');
    }

    const embed = {
      title: `Monitor Alert: ${context.monitorName}`,
      description: this.generateDiscordMessage(context),
      color: this.getAlertColorHex(context.status),
      fields: [
        {
          name: 'Target',
          value: context.monitorTarget,
          inline: true
        },
        {
          name: 'Status',
          value: context.status.toUpperCase(),
          inline: true
        },
        {
          name: 'Time',
          value: context.checkedAt.toISOString(),
          inline: true
        }
      ],
      timestamp: context.checkedAt.toISOString(),
    };

    if (context.errorMessage) {
      embed.fields.push({
        name: 'Error',
        value: context.errorMessage.substring(0, 1024), // Discord field limit
        inline: false
      });
    }

    const response = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    console.log(`[Alert Service] Discord alert sent for monitor ${context.monitorId}`);
  }

  // Helper methods for message generation
  private generateEmailSubject(context: AlertContext): string {
    const statusIcon = context.status === 'up' ? '✅' : '🚨';
    return `${statusIcon} Monitor Alert: ${context.monitorName} is ${context.status.toUpperCase()}`;
  }

  private generateEmailBody(context: AlertContext): string {
    const statusIcon = context.status === 'up' ? '✅' : '🚨';
    const statusColor = context.status === 'up' ? '#28a745' : '#dc3545';

    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: ${statusColor};">${statusIcon} Monitor Alert</h2>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0;">${context.monitorName}</h3>
              <p><strong>Status:</strong> <span style="color: ${statusColor};">${context.status.toUpperCase()}</span></p>
              <p><strong>Target:</strong> ${context.monitorTarget}</p>
              <p><strong>Type:</strong> ${context.monitorType}</p>
              <p><strong>Checked At:</strong> ${context.checkedAt.toLocaleString()}</p>
              ${context.responseTime ? `<p><strong>Response Time:</strong> ${context.responseTime}ms</p>` : ''}
              ${context.errorMessage ? `<p><strong>Error:</strong> ${context.errorMessage}</p>` : ''}
            </div>
            <p style="color: #6c757d; font-size: 0.9em;">
              This alert was sent because the monitor status changed or encountered a critical error.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateSlackMessage(context: AlertContext): string {
    const statusIcon = context.status === 'up' ? '✅' : '🚨';
    return `${statusIcon} *Monitor Alert*: ${context.monitorName} is *${context.status.toUpperCase()}*`;
  }

  private generateTelegramMessage(context: AlertContext): string {
    const statusIcon = context.status === 'up' ? '✅' : '🚨';
    let message = `${statusIcon} *Monitor Alert*\n\n`;
    message += `*Monitor:* ${context.monitorName}\n`;
    message += `*Status:* ${context.status.toUpperCase()}\n`;
    message += `*Target:* ${context.monitorTarget}\n`;
    message += `*Type:* ${context.monitorType}\n`;
    message += `*Time:* ${context.checkedAt.toLocaleString()}\n`;
    
    if (context.responseTime) {
      message += `*Response Time:* ${context.responseTime}ms\n`;
    }
    
    if (context.errorMessage) {
      message += `*Error:* ${context.errorMessage}\n`;
    }
    
    return message;
  }

  private generateDiscordMessage(context: AlertContext): string {
    let message = `Monitor **${context.monitorName}** is **${context.status.toUpperCase()}**`;
    if (context.errorMessage) {
      message += `\n\n**Error:** ${context.errorMessage}`;
    }
    return message;
  }

  private getAlertColor(status: MonitorResultStatus): string {
    switch (status) {
      case 'up': return 'good';
      case 'down': return 'danger';
      case 'error': return 'danger';
      case 'timeout': return 'warning';
      default: return 'warning';
    }
  }

  private getAlertColorHex(status: MonitorResultStatus): number {
    switch (status) {
      case 'up': return 0x28a745; // Green
      case 'down': return 0xdc3545; // Red
      case 'error': return 0xdc3545; // Red
      case 'timeout': return 0xffc107; // Yellow
      default: return 0x6c757d; // Gray
    }
  }

  private interpolateTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }
}

export const alertService = AlertService.getInstance(); 