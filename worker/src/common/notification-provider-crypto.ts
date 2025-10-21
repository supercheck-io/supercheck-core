import {
  decryptJson,
  encryptJson,
  isSecretEnvelope,
  maskSecret,
  type SecretEnvelope,
} from './security/secret-crypto';
import type {
  NotificationProviderConfig,
  NotificationProviderType,
  PlainNotificationProviderConfig,
} from 'src/db/schema';

const SENSITIVE_FIELDS: Record<NotificationProviderType, string[]> = {
  email: [],
  slack: ['webhookUrl'],
  webhook: ['url', 'headers'],
  telegram: ['botToken'],
  discord: ['discordWebhookUrl'],
};

const ALWAYS_SENSITIVE_FIELDS = new Set([
  'botToken',
  'webhookUrl',
  'discordWebhookUrl',
]);

export function encryptNotificationProviderConfig(
  config: PlainNotificationProviderConfig,
  context?: string,
): SecretEnvelope {
  return encryptJson(config, { context });
}

export function decryptNotificationProviderConfig(
  config: NotificationProviderConfig,
  context?: string,
): PlainNotificationProviderConfig {
  if (isSecretEnvelope(config)) {
    return decryptJson<PlainNotificationProviderConfig>(config, { context });
  }

  return (config as PlainNotificationProviderConfig) ?? {};
}

export function sanitizeConfigForClient(
  type: NotificationProviderType,
  config: PlainNotificationProviderConfig,
): {
  sanitizedConfig: PlainNotificationProviderConfig;
  maskedFields: string[];
} {
  const sanitized: PlainNotificationProviderConfig = { ...config };
  const maskedFields: string[] = [];

  const fieldsToMask = new Set([
    ...ALWAYS_SENSITIVE_FIELDS,
    ...(SENSITIVE_FIELDS[type] || []),
  ]);

  fieldsToMask.forEach((field) => {
    if (sanitized[field] !== undefined && sanitized[field] !== null) {
      maskedFields.push(field);
      const value = sanitized[field];

      if (typeof value === 'string' && value.length > 0) {
        sanitized[field] = maskSecret(value);
      } else if (field === 'headers') {
        sanitized[field] = {};
      } else {
        sanitized[field] = undefined;
      }
    }
  });

  return { sanitizedConfig: sanitized, maskedFields };
}

export { isSecretEnvelope as isEncryptedNotificationConfig } from './security/secret-crypto';
export type { SecretEnvelope } from './security/secret-crypto';
