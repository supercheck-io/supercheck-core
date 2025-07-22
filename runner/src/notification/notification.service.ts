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
  metadata?: {
    responseTime?: number;
    status?: string;
    target?: string;
    type?: string;
    sslCertificate?: any;
    errorMessage?: string;
    dashboardUrl?: string;
    targetUrl?: string;
    timestamp?: string;
    monitorType?: string;
    checkFrequency?: string;
    lastCheckTime?: string;
    duration?: number;
    details?: any;
    totalTests?: number;
    passedTests?: number;
    failedTests?: number;
    skippedTests?: number;
    runId?: string;
    trigger?: string;
    [key: string]: any; // Allow any additional properties
  };
}

interface FormattedNotification {
  title: string;
  message: string;
  fields: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  color: string;
  footer: string;
  timestamp: number;
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

      // Enhanced payload with standardized formatting
      const enhancedPayload = this.enhancePayload(payload);
      const formattedNotification = this.formatNotification(enhancedPayload);

      // Send the actual notification
      switch (provider.type) {
        case 'email':
          success = await this.sendEmailNotification(provider.config, formattedNotification, enhancedPayload);
          break;
        case 'slack':
          success = await this.sendSlackNotification(provider.config, formattedNotification, enhancedPayload);
          break;
        case 'webhook':
          success = await this.sendWebhookNotification(provider.config, formattedNotification, enhancedPayload);
          break;
        case 'telegram':
          success = await this.sendTelegramNotification(provider.config, formattedNotification, enhancedPayload);
          break;
        case 'discord':
          success = await this.sendDiscordNotification(provider.config, formattedNotification, enhancedPayload);
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

  private enhancePayload(payload: NotificationPayload): NotificationPayload {
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Generate dashboard URLs for easy navigation
    let dashboardUrl: string;
    if (payload.type.includes('monitor')) {
      dashboardUrl = `${baseUrl}/monitors/${payload.targetId}`;
    } else if (payload.type.includes('job')) {
      dashboardUrl = `${baseUrl}/jobs`;
      if (payload.metadata?.runId) {
        dashboardUrl = `${baseUrl}/runs/${payload.metadata.runId}`;
      }
    } else {
      dashboardUrl = `${baseUrl}/alerts`;
    }
    
    const targetUrl = payload.metadata?.target;
    
    return {
      ...payload,
      metadata: {
        ...payload.metadata,
        dashboardUrl,
        targetUrl,
        timestamp: payload.timestamp.toISOString(),
      }
    };
  }

  private formatNotification(payload: NotificationPayload): FormattedNotification {
    // Standardized formatting with professional appearance - no emojis for consistency
    const isMonitor = payload.type.includes('monitor');
    const isJob = payload.type.includes('job');

    // Consistent title format without emojis for professional appearance
    const title = payload.title;

    // Enhanced message with context
    let enhancedMessage = payload.message;
    if (payload.metadata?.errorMessage) {
      enhancedMessage += `\n\n**Error Details:** ${payload.metadata.errorMessage}`;
    }

    // Build standardized fields
    const fields: Array<{ title: string; value: string; short?: boolean }> = [];

    // Basic info
    fields.push({
      title: isMonitor ? 'Monitor' : 'Job',
      value: payload.targetName,
      short: true,
    });

    if (payload.metadata?.type) {
      fields.push({
        title: 'Type',
        value: payload.metadata.type.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        short: true,
      });
    }

    // Status info
    if (payload.metadata?.status) {
      fields.push({
        title: 'Status',
        value: payload.metadata.status.toUpperCase(),
        short: true,
      });
    }

    // Time
    fields.push({
      title: 'Time',
      value: payload.timestamp.toUTCString(),
      short: true,
    });

    // Response time
    if (payload.metadata?.responseTime !== undefined) {
      fields.push({
        title: 'Response Time',
        value: `${payload.metadata.responseTime}ms`,
        short: true,
      });
    }

    // Target URL
    if (payload.metadata?.targetUrl) {
      fields.push({
        title: 'Target URL',
        value: payload.metadata.targetUrl,
        short: false,
      });
    }

    // Dashboard link
    if (payload.metadata?.dashboardUrl) {
      fields.push({
        title: '🔗 Dashboard',
        value: payload.metadata.dashboardUrl,
        short: false,
      });
    }

    // Trigger type (manual/scheduled)
    if (payload.metadata?.trigger) {
      fields.push({
        title: 'Trigger',
        value: payload.metadata.trigger,
        short: true,
      });
    }

    return {
      title,
      message: enhancedMessage,
      fields,
      color: this.getColorForSeverity(payload.severity),
      footer: 'sent by supercheck',
      timestamp: Math.floor(payload.timestamp.getTime() / 1000),
    };
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

  private async sendEmailNotification(config: any, formatted: FormattedNotification, payload: NotificationPayload): Promise<boolean> {
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

      const emailContent = this.formatEmailContent(formatted, payload);
      
      await transporter.sendMail({
        from: config.fromEmail,
        to: config.toEmail,
        subject: formatted.title,
        html: emailContent.html,
        text: emailContent.text,
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to send email notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendSlackNotification(config: any, formatted: FormattedNotification, payload: NotificationPayload): Promise<boolean> {
    try {
      const webhookUrl = config.webhookUrl;
      if (!webhookUrl) {
        throw new Error('Slack webhook URL is required');
      }

      this.logger.debug(`Sending Slack notification to: ${webhookUrl.substring(0, 50)}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SuperTest-Monitor/1.0',
        },
        body: JSON.stringify({
          text: formatted.title,
          attachments: [
            {
              color: formatted.color,
              text: formatted.message,
              fields: formatted.fields,
              footer: formatted.footer,
              ts: formatted.timestamp,
            }
          ]
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const responseText = await response.text().catch(() => 'Unable to read response');
        throw new Error(`Slack API returned ${response.status}: ${response.statusText}. Response: ${responseText}`);
      }

      this.logger.debug(`Slack notification sent successfully`);
      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger.error(`Slack notification timed out after 10 seconds`);
      } else if (error.cause?.code === 'ECONNREFUSED') {
        this.logger.error(`Failed to connect to Slack webhook URL - connection refused`);
      } else if (error.cause?.code === 'ENOTFOUND') {
        this.logger.error(`Failed to resolve Slack webhook URL - DNS lookup failed`);
      } else {
        this.logger.error(`Failed to send Slack notification: ${error.message}`);
      }
      return false;
    }
  }

  private async sendWebhookNotification(config: any, formatted: FormattedNotification, payload: NotificationPayload): Promise<boolean> {
    try {
      const webhookUrl = config.url;
      if (!webhookUrl) {
        throw new Error('Webhook URL is required');
      }

      const webhookPayload = {
        ...formatted,
        originalPayload: payload,
        provider: 'webhook',
        version: '1.0'
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SuperTest-Monitor/1.0',
        },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const responseText = await response.text().catch(() => 'Unable to read response');
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}. Response: ${responseText}`);
      }

      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger.error(`Webhook notification timed out after 10 seconds`);
      } else {
        this.logger.error(`Failed to send webhook notification: ${error.message}`);
      }
      return false;
    }
  }

  private async sendTelegramNotification(config: any, formatted: FormattedNotification, payload: NotificationPayload): Promise<boolean> {
    try {
      const { botToken, chatId } = config;
      if (!botToken || !chatId) {
        throw new Error('Telegram bot token and chat ID are required');
      }

      const telegramMessage = this.formatTelegramMessage(formatted);
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: telegramMessage,
          parse_mode: 'Markdown',
        }),
      });

      return response.ok;
    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${error.message}`, error.stack);
      return false;
    }
  }

  private async sendDiscordNotification(config: any, formatted: FormattedNotification, payload: NotificationPayload): Promise<boolean> {
    try {
      const webhookUrl = config.discordWebhookUrl;
      if (!webhookUrl) {
        throw new Error('Discord webhook URL is required');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SuperTest-Monitor/1.0',
        },
        body: JSON.stringify({
          content: formatted.title,
          embeds: [
            {
              title: formatted.title,
              description: formatted.message,
              color: parseInt(formatted.color.replace('#', ''), 16),
              fields: formatted.fields.map(field => ({
                name: field.title,
                value: field.value,
                inline: field.short || false,
              })),
              footer: {
                text: formatted.footer,
              },
              timestamp: new Date(formatted.timestamp * 1000).toISOString(),
            }
          ]
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const responseText = await response.text().catch(() => 'Unable to read response');
        throw new Error(`Discord API returned ${response.status}: ${response.statusText}. Response: ${responseText}`);
      }

      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger.error(`Discord notification timed out after 10 seconds`);
      } else {
        this.logger.error(`Failed to send Discord notification: ${error.message}`);
      }
      return false;
    }
  }

  private formatEmailContent(formatted: FormattedNotification, payload: NotificationPayload): { html: string; text: string } {
    const fieldsHtml = formatted.fields.map(field => 
      `<tr><td style="padding: 8px; font-weight: bold; vertical-align: top;">${field.title}:</td><td style="padding: 8px;">${field.value}</td></tr>`
    ).join('');

    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: ${formatted.color}; margin-bottom: 20px;">${formatted.title}</h2>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              ${formatted.message.replace(/\n/g, '<br>')}
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              ${fieldsHtml}
            </table>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
            <p style="font-size: 12px; color: #666; text-align: center;">${formatted.footer}</p>
          </div>
        </body>
      </html>
    `;

    const text = `${formatted.title}\n\n${formatted.message}\n\n${formatted.fields.map(field => `${field.title}: ${field.value}`).join('\n')}\n\n${formatted.footer}`;

    return { html, text };
  }

  private formatTelegramMessage(formatted: FormattedNotification): string {
    const fieldsText = formatted.fields.map(field => `*${field.title}:* ${field.value}`).join('\n');
    return `${formatted.title}\n\n${formatted.message}\n\n${fieldsText}`;
  }

  private getColorForSeverity(severity: string): string {
    switch (severity) {
      case 'error':
        return '#ef4444'; // Red
      case 'warning':
        return '#f59e0b'; // Amber
      case 'success':
        return '#22c55e'; // Green
      case 'info':
        return '#3b82f6'; // Blue
      default:
        return '#6b7280'; // Gray
    }
  }
} 