import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface NotificationProvider {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'telegram' | 'discord';
  config: Record<string, any>;
}

export interface NotificationPayload {
  type: 'monitor_failure' | 'monitor_recovery' | 'job_failed' | 'job_success' | 'job_timeout' | 'ssl_expiring';
  title: string;
  message: string;
  targetName: string;
  targetId: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor() {
    this.logger.log('NotificationService initialized');
  }

  async sendNotification(provider: NotificationProvider, payload: NotificationPayload): Promise<boolean> {
    this.logger.log(`Sending notification via ${provider.type} for ${payload.type}: ${payload.title}`);

    let success = false;

    try {
      // Validate provider configuration
      if (!this.validateProviderConfig(provider)) {
        this.logger.error(`Invalid configuration for provider ${provider.id} (${provider.type})`);
        return false;
      }

      // Send the actual notification
      switch (provider.type) {
        case 'email':
          success = await this.sendEmailNotification(provider.config, payload);
          break;
        case 'slack':
          success = await this.sendSlackNotification(provider.config, payload);
          break;
        case 'webhook':
          success = await this.sendWebhookNotification(provider.config, payload);
          break;
        case 'telegram':
          success = await this.sendTelegramNotification(provider.config, payload);
          break;
        case 'discord':
          success = await this.sendDiscordNotification(provider.config, payload);
          break;
        default:
          this.logger.error(`Unsupported notification provider type: ${provider.type}`);
          success = false;
      }

      if (success) {
        this.logger.log(`Successfully sent notification via ${provider.type} for ${payload.type}`);
      } else {
        this.logger.error(`Failed to send notification via ${provider.type} for ${payload.type}`);
      }

    } catch (error) {
      this.logger.error(`Failed to send notification via ${provider.type}:`, error);
      success = false;
    }

    return success;
  }

  private validateProviderConfig(provider: NotificationProvider): boolean {
    try {
      switch (provider.type) {
        case 'email':
          return !!(
            provider.config.smtpHost &&
            provider.config.smtpUser &&
            provider.config.smtpPassword &&
            provider.config.fromEmail &&
            provider.config.toEmail
          );
        case 'slack':
          return !!provider.config.webhookUrl;
        case 'webhook':
          return !!provider.config.url;
        case 'telegram':
          return !!(provider.config.botToken && provider.config.chatId);
        case 'discord':
          return !!provider.config.discordWebhookUrl;
        default:
          return false;
      }
    } catch (error) {
      this.logger.error(`Error validating provider config: ${error.message}`);
      return false;
    }
  }

  async sendNotificationToMultipleProviders(providers: NotificationProvider[], payload: NotificationPayload): Promise<{ success: number; failed: number }> {
    if (!providers || providers.length === 0) {
      this.logger.warn('No providers to send notifications to');
      return { success: 0, failed: 0 };
    }

    this.logger.log(`Sending notifications to ${providers.length} providers`);

    const results = await Promise.allSettled(
      providers.map(provider => this.sendNotification(provider, payload))
    );

    const success = results.filter(result => result.status === 'fulfilled' && result.value).length;
    const failed = results.length - success;

    this.logger.log(`Notification sent: ${success} success, ${failed} failed`);

    // Log detailed results for debugging
    results.forEach((result, index) => {
      const provider = providers[index];
      if (result.status === 'fulfilled') {
        if (result.value) {
          this.logger.debug(`Provider ${provider.id} (${provider.type}): Success`);
        } else {
          this.logger.warn(`Provider ${provider.id} (${provider.type}): Failed to send`);
        }
      } else {
        this.logger.error(`Provider ${provider.id} (${provider.type}): Error - ${result.reason}`);
      }
    });

    return { success, failed };
  }

  private async sendEmailNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: config.smtpSecure || false,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword,
        },
      });

      const emailContent = this.formatEmailContent(payload);
      
      await transporter.sendMail({
        from: config.fromEmail,
        to: config.toEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to send email notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendSlackNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    try {
      const webhookUrl = config.webhookUrl;
      if (!webhookUrl) {
        throw new Error('Slack webhook URL is required');
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `${payload.title}\n${payload.message}`,
          attachments: [
            {
              color: this.getColorForSeverity(payload.severity),
              fields: [
                {
                  title: 'Type',
                  value: payload.type,
                  short: true,
                },
                {
                  title: 'Target',
                  value: payload.targetName,
                  short: true,
                },
                {
                  title: 'Status',
                  value: payload.metadata?.status || 'N/A',
                  short: true,
                },
                {
                  title: 'Time',
                  value: new Date(payload.timestamp).toLocaleString(),
                  short: true,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack API responded with status ${response.status}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send Slack notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendDiscordNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    try {
      const webhookUrl = config.discordWebhookUrl;
      if (!webhookUrl) {
        throw new Error('Discord webhook URL is required');
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          embeds: [
            {
              title: payload.title,
              description: payload.message,
              color: this.getDiscordColorForSeverity(payload.severity),
              fields: [
                {
                  name: 'Type',
                  value: payload.type,
                  inline: true,
                },
                {
                  name: 'Target',
                  value: payload.targetName,
                  inline: true,
                },
                {
                  name: 'Status',
                  value: payload.metadata?.status || 'N/A',
                  inline: true,
                },
              ],
              timestamp: new Date(payload.timestamp).toISOString(),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Discord API responded with status ${response.status}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send Discord notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendTelegramNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    try {
      const { botToken, chatId } = config;
      if (!botToken || !chatId) {
        throw new Error('Telegram bot token and chat ID are required');
      }

      const message = `*${payload.title}*\n\n${payload.message}\n\nType: ${payload.type}\nTarget: ${payload.targetName}\nStatus: ${payload.metadata?.status || 'N/A'}\nTime: ${new Date(payload.timestamp).toLocaleString()}`;

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API responded with status ${response.status}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendWebhookNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    try {
      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: config.bodyTemplate ? 
          this.formatWebhookBody(config.bodyTemplate, payload) :
          JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.error(`Webhook request failed with status ${response.status}: ${response.statusText}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send webhook notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private formatWebhookBody(template: string, payload: NotificationPayload): string {
    try {
      // Replace template variables with actual values
      return template.replace(/\${(.*?)}/g, (match, key) => {
        const value = key.split('.').reduce((obj: any, k: string) => obj?.[k], payload);
        return value !== undefined ? String(value) : match;
      });
    } catch (error) {
      this.logger.error(`Failed to format webhook body: ${error.message}`);
      return JSON.stringify(payload);
    }
  }

  private formatEmailContent(payload: NotificationPayload): { subject: string; html: string; text: string } {
    const subject = payload.title;
    const text = `${payload.message}\n\nType: ${payload.type}\nTarget: ${payload.targetName}\nStatus: ${payload.metadata?.status || 'N/A'}\nTime: ${new Date(payload.timestamp).toLocaleString()}`;
    const html = `
      <h2>${payload.title}</h2>
      <p>${payload.message}</p>
      <table>
        <tr><td><strong>Type:</strong></td><td>${payload.type}</td></tr>
        <tr><td><strong>Target:</strong></td><td>${payload.targetName}</td></tr>
        <tr><td><strong>Status:</strong></td><td>${payload.metadata?.status || 'N/A'}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${new Date(payload.timestamp).toLocaleString()}</td></tr>
      </table>
    `;

    return { subject, html, text };
  }

  private getColorForSeverity(severity: NotificationPayload['severity']): string {
    switch (severity) {
      case 'error':
        return '#ff0000';
      case 'warning':
        return '#ffa500';
      case 'success':
        return '#00ff00';
      default:
        return '#808080';
    }
  }

  private getDiscordColorForSeverity(severity: NotificationPayload['severity']): number {
    switch (severity) {
      case 'error':
        return 0xff0000;
      case 'warning':
        return 0xffa500;
      case 'success':
        return 0x00ff00;
      default:
        return 0x808080;
    }
  }
} 