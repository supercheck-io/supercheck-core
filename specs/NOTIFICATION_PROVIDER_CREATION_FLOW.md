# Notification Provider Creation Flow

## Overview

This document describes the complete flow for creating notification providers in the SuperTest application. Notification providers are used to send alerts and notifications when monitors fail, jobs complete, or other system events occur.

## Supported Provider Types

The system supports the following notification provider types:

- **email**: SMTP-based email notifications
- **slack**: Slack webhook notifications
- **webhook**: Generic HTTP webhook notifications
- **telegram**: Telegram bot notifications
- **discord**: Discord webhook notifications

## Database Schema

### Notification Providers Table

```sql
CREATE TABLE notification_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organization(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES user(id) ON DELETE NO ACTION,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Required Fields

- **name**: Human-readable name for the provider (e.g., "Production Slack Alerts")
- **type**: One of the supported provider types
- **config**: JSON configuration specific to the provider type
- **organizationId**: The organization this provider belongs to
- **createdByUserId**: The user who created this provider

## API Endpoints

### Create Notification Provider

**Endpoint**: `POST /api/notification-providers`

**Request Body**:
```json
{
  "name": "Production Slack Alerts",
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/...",
    "channel": "#alerts",
    "isDefault": false
  },
  "organizationId": "uuid",
  "createdByUserId": "uuid"
}
```

**Response**:
```json
{
  "id": "uuid",
  "name": "Production Slack Alerts",
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/...",
    "channel": "#alerts",
    "isDefault": false
  },
  "organizationId": "uuid",
  "createdByUserId": "uuid",
  "isEnabled": true,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### Get Notification Providers

**Endpoint**: `GET /api/notification-providers`

**Response**:
```json
[
  {
    "id": "uuid",
    "name": "Production Slack Alerts",
    "type": "slack",
    "config": { ... },
    "organizationId": "uuid",
    "createdByUserId": "uuid",
    "isEnabled": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "lastUsed": "2024-01-01T12:00:00Z"
  }
]
```

## Provider-Specific Configuration

### Email Provider

```json
{
  "type": "email",
  "config": {
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "smtpUser": "alerts@company.com",
    "smtpPassword": "password",
    "smtpSecure": false,
    "fromEmail": "alerts@company.com",
    "toEmail": "team@company.com",
    "isDefault": false
  }
}
```

### Slack Provider

```json
{
  "type": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
    "channel": "#alerts",
    "isDefault": false
  }
}
```

### Webhook Provider

```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.company.com/webhooks/alerts",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer token",
      "Content-Type": "application/json"
    },
    "bodyTemplate": "{\"alert\": \"{{message}}\", \"timestamp\": \"{{timestamp}}\"}",
    "isDefault": false
  }
}
```

### Telegram Provider

```json
{
  "type": "telegram",
  "config": {
    "botToken": "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz",
    "chatId": "123456789",
    "isDefault": false
  }
}
```

### Discord Provider

```json
{
  "type": "discord",
  "config": {
    "discordWebhookUrl": "https://discord.com/api/webhooks/...",
    "isDefault": false
  }
}
```

## Frontend Integration

### Form Validation

The frontend should validate:

1. **Name**: Required, max 255 characters
2. **Type**: Must be one of the supported types
3. **Config**: Must contain required fields for the selected type
4. **Organization**: Must be a valid organization ID
5. **Created By User**: Must be a valid user ID

### Error Handling

Common validation errors:

- Missing required fields
- Invalid provider type
- Invalid configuration for the selected type
- Organization not found
- User not found
- Duplicate provider name within organization

### Success Flow

1. User fills out the notification provider form
2. Frontend validates the input
3. Frontend sends POST request to `/api/notification-providers`
4. Backend validates the data using `notificationProvidersInsertSchema`
5. Backend inserts the provider into the database
6. Backend returns the created provider with status 201
7. Frontend shows success message and redirects to providers list

## Usage in Alerts

Once created, notification providers can be:

1. **Assigned to monitors** via the `monitorNotificationSettings` table
2. **Assigned to jobs** via the `jobNotificationSettings` table
3. **Referenced in alert configurations** via the `alerts` table

### Monitor Integration

```sql
INSERT INTO monitor_notification_settings (monitor_id, notification_provider_id)
VALUES ('monitor-uuid', 'provider-uuid');
```

### Job Integration

```sql
INSERT INTO job_notification_settings (job_id, notification_provider_id)
VALUES ('job-uuid', 'provider-uuid');
```

## Security Considerations

1. **API Keys and Tokens**: Store sensitive configuration in encrypted form
2. **Organization Isolation**: Providers are scoped to organizations
3. **User Permissions**: Only organization members can create providers
4. **Rate Limiting**: Implement rate limiting for webhook calls
5. **Validation**: Validate all webhook URLs and API endpoints

## Testing

### Unit Tests

- Test provider creation with valid data
- Test validation errors for invalid data
- Test provider type-specific configuration validation

### Integration Tests

- Test end-to-end provider creation flow
- Test provider usage in monitor alerts
- Test provider usage in job notifications

### Manual Testing

1. Create providers of each supported type
2. Test webhook delivery to external services
3. Verify email delivery through SMTP
4. Test Slack/Discord message formatting
5. Verify Telegram bot message delivery

## Troubleshooting

### Common Issues

1. **SMTP Connection Failed**: Check SMTP settings and credentials
2. **Webhook Delivery Failed**: Verify URL and authentication
3. **Slack Message Not Delivered**: Check webhook URL and channel permissions
4. **Telegram Bot Not Responding**: Verify bot token and chat ID
5. **Discord Webhook Error**: Check webhook URL and permissions

### Debug Steps

1. Check application logs for error messages
2. Verify provider configuration in database
3. Test webhook endpoints manually
4. Check network connectivity to external services
5. Verify API keys and tokens are valid

## Future Enhancements

1. **Provider Templates**: Pre-configured templates for common services
2. **Provider Testing**: Built-in test functionality for each provider type
3. **Provider Analytics**: Track delivery success rates and response times
4. **Provider Scheduling**: Configure different providers for different times
5. **Provider Escalation**: Chain multiple providers for critical alerts 