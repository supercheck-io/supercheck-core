import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface NotificationProvider {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'telegram' | 'discord';
  config: Record<string, any>;
  isEnabled: boolean;
}

export interface NotificationPayload {
  type: 'monitor_down' | 'monitor_up' | 'job_failed' | 'job_success' | 'job_timeout' | 'ssl_expiring';
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

  async sendNotification(provider: NotificationProvider, payload: NotificationPayload): Promise<boolean> {
    if (!provider.isEnabled) {
      this.logger.warn(`Provider ${provider.id} is disabled, skipping notification`);
      return false;
    }

    try {
      switch (provider.type) {
        case 'email':
          return await this.sendEmailNotification(provider.config, payload);
        case 'slack':
          return await this.sendSlackNotification(provider.config, payload);
        case 'webhook':
          return await this.sendWebhookNotification(provider.config, payload);
        case 'telegram':
          return await this.sendTelegramNotification(provider.config, payload);
        case 'discord':
          return await this.sendDiscordNotification(provider.config, payload);
        default:
          this.logger.error(`Unsupported notification provider type: ${provider.type}`);
          return false;
      }
    } catch (error) {
      this.logger.error(`Failed to send notification via ${provider.type}:`, error);
      return false;
    }
  }

  async sendNotificationToMultipleProviders(providers: NotificationProvider[], payload: NotificationPayload): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      providers.map(provider => this.sendNotification(provider, payload))
    );

    const success = results.filter(result => result.status === 'fulfilled' && result.value).length;
    const failed = results.length - success;

    this.logger.log(`Notification sent: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  private async sendEmailNotification(config: any, payload: NotificationPayload): Promise<boolean> {
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
  }

  private async sendSlackNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    const slackMessage = this.formatSlackMessage(payload);
    
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: slackMessage.text,
        channel: config.channel,
        attachments: slackMessage.attachments,
      }),
    });

    return response.ok;
  }

  private async sendWebhookNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    const method = config.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    let body = JSON.stringify(payload);
    if (config.bodyTemplate) {
      body = this.replaceTemplateVariables(config.bodyTemplate, payload);
    }

    const response = await fetch(config.url, {
      method,
      headers,
      body: method !== 'GET' ? body : undefined,
    });

    return response.ok;
  }

  private async sendTelegramNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    const message = this.formatTelegramMessage(payload);
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    return response.ok;
  }

  private async sendDiscordNotification(config: any, payload: NotificationPayload): Promise<boolean> {
    const embed = this.formatDiscordEmbed(payload);

    const response = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    return response.ok;
  }

  private formatEmailContent(payload: NotificationPayload) {
    const severityEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      success: '✅',
    };

    const subject = `${severityEmoji[payload.severity]} ${payload.title}`;
    const text = `${payload.message}\n\nTarget: ${payload.targetName}\nTime: ${payload.timestamp.toISOString()}`;
    
    const html = `
      <h2>${severityEmoji[payload.severity]} ${payload.title}</h2>
      <p><strong>Message:</strong> ${payload.message}</p>
      <p><strong>Target:</strong> ${payload.targetName}</p>
      <p><strong>Time:</strong> ${payload.timestamp.toISOString()}</p>
      ${payload.metadata ? `<p><strong>Details:</strong> ${JSON.stringify(payload.metadata, null, 2)}</p>` : ''}
    `;

    return { subject, text, html };
  }

  private formatSlackMessage(payload: NotificationPayload) {
    const colorMap = {
      info: '#36a64f',
      warning: '#ff9500',
      error: '#ff0000',
      success: '#36a64f',
    };

    return {
      text: payload.title,
      attachments: [
        {
          color: colorMap[payload.severity],
          fields: [
            {
              title: 'Message',
              value: payload.message,
              short: false,
            },
            {
              title: 'Target',
              value: payload.targetName,
              short: true,
            },
            {
              title: 'Time',
              value: payload.timestamp.toISOString(),
              short: true,
            },
          ],
        },
      ],
    };
  }

  private formatTelegramMessage(payload: NotificationPayload): string {
    const severityEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      success: '✅',
    };

    return `
<b>${severityEmoji[payload.severity]} ${payload.title}</b>

<b>Message:</b> ${payload.message}
<b>Target:</b> ${payload.targetName}
<b>Time:</b> ${payload.timestamp.toISOString()}
    `.trim();
  }

  private formatDiscordEmbed(payload: NotificationPayload) {
    const colorMap = {
      info: 0x0099ff,
      warning: 0xff9500,
      error: 0xff0000,
      success: 0x00ff00,
    };

    return {
      title: payload.title,
      description: payload.message,
      color: colorMap[payload.severity],
      fields: [
        {
          name: 'Target',
          value: payload.targetName,
          inline: true,
        },
        {
          name: 'Time',
          value: payload.timestamp.toISOString(),
          inline: true,
        },
      ],
      timestamp: payload.timestamp.toISOString(),
    };
  }

  private replaceTemplateVariables(template: string, payload: NotificationPayload): string {
    return template
      .replace(/\{\{title\}\}/g, payload.title)
      .replace(/\{\{message\}\}/g, payload.message)
      .replace(/\{\{targetName\}\}/g, payload.targetName)
      .replace(/\{\{targetId\}\}/g, payload.targetId)
      .replace(/\{\{severity\}\}/g, payload.severity)
      .replace(/\{\{timestamp\}\}/g, payload.timestamp.toISOString())
      .replace(/\{\{type\}\}/g, payload.type);
  }
} 