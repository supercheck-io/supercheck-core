import { NextRequest, NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, alertHistory, monitorNotificationSettings, notificationProviders } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import type { AlertType } from '@/db/schema/schema';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { id: monitorId } = params;
  
  if (!monitorId) {
    return NextResponse.json({ error: "Monitor ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { type, reason, metadata = {} } = body;

    console.log(`[NOTIFY] Manual notification trigger for monitor ${monitorId}, type: ${type}`);

    // Get monitor details
    const monitor = await db.query.monitors.findFirst({
      where: eq(monitors.id, monitorId),
    });

    if (!monitor) {
      return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
    }

    // Check if alerts are enabled
    if (!monitor.alertConfig?.enabled) {
      console.log(`[NOTIFY] Alerts not enabled for monitor ${monitorId}`);
      return NextResponse.json({ 
        success: false, 
        message: "Alerts not enabled for this monitor" 
      });
    }

    // Get notification providers
    const providers = await db
      .select({
        id: notificationProviders.id,
        type: notificationProviders.type,
        config: notificationProviders.config,
      })
      .from(notificationProviders)
      .innerJoin(
        monitorNotificationSettings,
        eq(monitorNotificationSettings.notificationProviderId, notificationProviders.id)
      )
      .where(eq(monitorNotificationSettings.monitorId, monitorId));

    if (!providers || providers.length === 0) {
      console.log(`[NOTIFY] No notification providers configured for monitor ${monitorId}`);
      return NextResponse.json({ 
        success: false, 
        message: "No notification providers configured" 
      });
    }

    // Determine notification details based on type with professional formatting
    let notificationType: string;
    let severity: 'info' | 'warning' | 'error' | 'success';
    let title: string;
    let message: string;

    switch (type) {
      case 'recovery':
        notificationType = 'monitor_recovery';
        severity = 'success';
        title = `Monitor Recovered - ${monitor.name}`;
        message = `Monitor "${monitor.name}" has recovered and is now operational.`;
        
        // Only send recovery notifications if enabled
        if (!monitor.alertConfig.alertOnRecovery) {
          console.log(`[NOTIFY] Recovery notifications disabled for monitor ${monitorId}`);
          return NextResponse.json({ 
            success: false, 
            message: "Recovery notifications are disabled" 
          });
        }
        break;
        
      case 'failure':
        notificationType = 'monitor_failure';
        severity = 'error';
        title = `Monitor Alert - ${monitor.name}`;
        message = `Monitor "${monitor.name}" is down. ${reason || 'No ping received within expected interval'}`;
        
        // Only send failure notifications if enabled
        if (!monitor.alertConfig.alertOnFailure) {
          console.log(`[NOTIFY] Failure notifications disabled for monitor ${monitorId}`);
          return NextResponse.json({ 
            success: false, 
            message: "Failure notifications are disabled" 
          });
        }
        break;
        
      default:
        return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
    }

    // Enhanced notification payload with consistent metadata
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const dashboardUrl = `${baseUrl}/monitors/${monitor.id}`;
    
    const notificationPayload = {
      type: notificationType,
      title,
      message: monitor.alertConfig.customMessage || message,
      targetName: monitor.name,
      targetId: monitor.id,
      severity,
      timestamp: new Date(),
      metadata: {
        target: monitor.target,
        type: monitor.type,
        status: type === 'recovery' ? 'up' : 'down',
        dashboardUrl,
        targetUrl: monitor.type === 'heartbeat' ? undefined : monitor.target,
        trigger: 'manual',
        reason: reason || 'Manual notification trigger',
        monitorType: monitor.type,
        checkFrequency: monitor.frequencyMinutes ? `${monitor.frequencyMinutes}m` : undefined,
        lastCheckTime: monitor.lastCheckAt ? new Date(monitor.lastCheckAt).toISOString() : undefined,
        ...metadata,
      },
    };

    console.log(`[NOTIFY] Sending ${notificationType} notifications to ${providers.length} providers`);

    // Send notifications to each provider using consistent formatting
    const notificationResults = await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          const success = await sendNotificationToProvider(provider, notificationPayload);
          return { providerId: provider.id, type: provider.type, success };
        } catch (error) {
          console.error(`[NOTIFY] Error sending to provider ${provider.id}:`, error);
          return { providerId: provider.id, type: provider.type, success: false, error: error };
        }
      })
    );

    const successCount = notificationResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failedCount = notificationResults.length - successCount;

    console.log(`[NOTIFY] Notification results: ${successCount} success, ${failedCount} failed`);

    // Save alert history
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

    await db.insert(alertHistory).values({
      type: notificationType as AlertType,
      message: notificationPayload.message,
      target: monitor.name,
      targetType: 'monitor',
      monitorId: monitor.id,
      provider: providers.map(p => p.type).join(', '),
      status: alertStatus,
      errorMessage,
      sentAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Notifications sent: ${successCount} success, ${failedCount} failed`,
      results: {
        total: providers.length,
        success: successCount,
        failed: failedCount,
        details: notificationResults.map(result => 
          result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
        )
      }
    });

  } catch (error: unknown) {
    let errMsg = 'Failed to send notifications';
    const e = error as any;
    if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
      errMsg = e.message;
    } else if (typeof e === 'string') {
      errMsg = e;
    }
    console.error(`[NOTIFY] Error processing notification for monitor ${monitorId}:`, error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

async function sendNotificationToProvider(provider: any, payload: any): Promise<boolean> {
  // Professional notification formatting with consistent structure
  try {
    const formattedNotification = formatNotificationForProvider(payload);
    
    switch (provider.type) {
      case 'slack':
        if (!provider.config.webhookUrl) {
          throw new Error('Slack webhook URL not configured');
        }
        
        const slackResponse = await fetch(provider.config.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: formattedNotification.title,
            attachments: [
              {
                color: formattedNotification.color,
                text: formattedNotification.message,
                fields: formattedNotification.fields,
                footer: 'sent by supercheck',
                ts: Math.floor(payload.timestamp.getTime() / 1000),
              }
            ]
          }),
        });

        if (!slackResponse.ok) {
          throw new Error(`Slack API returned ${slackResponse.status}: ${slackResponse.statusText}`);
        }
        return true;

      case 'email':
        // For email, log the formatted notification (SMTP would be implemented here)
        console.log(`[NOTIFY] Would send email notification:`, formattedNotification.title);
        return true;

      case 'webhook':
        if (!provider.config.url) {
          throw new Error('Webhook URL not configured');
        }
        
        const webhookPayload = {
          ...formattedNotification,
          originalPayload: payload,
          provider: 'webhook',
          version: '1.0'
        };
        
        const webhookResponse = await fetch(provider.config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        });

        return webhookResponse.ok;

      case 'telegram':
        if (!provider.config.botToken || !provider.config.chatId) {
          throw new Error('Telegram bot token and chat ID not configured');
        }
        
        const telegramMessage = formatTelegramMessage(formattedNotification);
        const telegramResponse = await fetch(`https://api.telegram.org/bot${provider.config.botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: provider.config.chatId,
            text: telegramMessage,
            parse_mode: 'Markdown',
          }),
        });

        return telegramResponse.ok;

      case 'discord':
        if (!provider.config.discordWebhookUrl) {
          throw new Error('Discord webhook URL not configured');
        }
        
        const discordResponse = await fetch(provider.config.discordWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: formattedNotification.title,
            embeds: [
              {
                title: formattedNotification.title,
                description: formattedNotification.message,
                color: parseInt(formattedNotification.color.replace('#', ''), 16),
                fields: formattedNotification.fields.map(field => ({
                  name: field.title,
                  value: field.value,
                  inline: field.short || false,
                })),
                footer: {
                  text: 'sent by supercheck',
                },
                timestamp: payload.timestamp.toISOString(),
              }
            ]
          }),
        });

        return discordResponse.ok;

      default:
        console.log(`[NOTIFY] Provider type ${provider.type} not yet implemented for manual notifications`);
        return false;
    }
  } catch (error) {
    console.error(`[NOTIFY] Error sending notification via ${provider.type}:`, error);
    return false;
  }
}

function formatNotificationForProvider(payload: any) {
  // Professional formatting without emojis for consistency
  const title = payload.title;

  // Build structured fields
  const fields = [
    {
      title: 'Monitor',
      value: payload.targetName,
      short: true,
    },
    {
      title: 'Type',
      value: payload.metadata?.monitorType?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'N/A',
      short: true,
    },
    {
      title: 'Status',
      value: payload.metadata?.status?.toUpperCase() || 'UNKNOWN',
      short: true,
    },
    {
      title: 'Time',
      value: payload.timestamp.toLocaleString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      short: true,
    }
  ];

  // Add performance metrics if available
  if (payload.metadata?.responseTime) {
    fields.push({
      title: 'Response Time',
      value: `${payload.metadata.responseTime}ms`,
      short: true,
    });
  }

  if (payload.metadata?.checkFrequency) {
    fields.push({
      title: 'Check Frequency',
      value: payload.metadata.checkFrequency,
      short: true,
    });
  }

  // Add target information for non-heartbeat monitors
  if (payload.metadata?.targetUrl && payload.metadata?.monitorType !== 'heartbeat') {
    fields.push({
      title: 'Target URL',
      value: payload.metadata.targetUrl,
      short: false,
    });
  }

  // Add dashboard link
  if (payload.metadata?.dashboardUrl) {
    fields.push({
      title: '🔗 Dashboard',
      value: payload.metadata.dashboardUrl,
      short: false,
    });
  }

  return {
    title,
    message: payload.message,
    fields,
    color: getColorForSeverity(payload.severity),
  };
}

function formatTelegramMessage(formatted: any): string {
  const fieldsText = formatted.fields.map((field: any) => `*${field.title}:* ${field.value}`).join('\n');
  return `${formatted.title}\n\n${formatted.message}\n\n${fieldsText}`;
}

function getColorForSeverity(severity: string): string {
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