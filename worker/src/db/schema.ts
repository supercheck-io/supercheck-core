import {
  integer,
  pgTable,
  text,
  varchar,
  primaryKey,
  timestamp,
  jsonb,
  uuid,
  uniqueIndex,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

/* ================================
   AUTH SCHEMA
   -------------------------------
   Tables required by better-auth, modified to use UUIDs.
   Using UUIDv7 for time-ordered IDs with better indexing performance (PostgreSQL 18+).
=================================== */

/**
 * Stores user information for authentication and identification.
 */
export const user = pgTable('user', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  role: text('role'),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
});

/**
 * Represents an organization or a company account.
 */
export const organization = pgTable('organization', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at').notNull(),
  metadata: text('metadata'),
});

/**
 * Maps users to organizations, defining their roles.
 */
export const member = pgTable(
  'member',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('project_viewer').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => ({
    uniqueUserOrg: unique().on(table.userId, table.organizationId),
  }),
);

/**
 * Stores pending invitations for users to join an organization.
 */
export const invitation = pgTable('invitation', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').default('pending').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  selectedProjects: text('selected_projects'), // JSON array of project IDs
});

/**
 * Manages user sessions for authentication.
 */
export const session = pgTable('session', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: uuid('active_organization_id').references(
    () => organization.id,
  ),
  activeProjectId: uuid('active_project_id').references(() => projects.id),
  impersonatedBy: text('impersonated_by'),
});

/**
 * Stores provider-specific account information for OAuth.
 */
export const account = pgTable('account', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  accountId: text('account_id'),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

/**
 * Stores tokens for email verification or password resets.
 */
export const verification = pgTable('verification', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Manages API keys for programmatic access.
 */
export const apikey = pgTable('apikey', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  name: text('name'),
  start: text('start'),
  prefix: text('prefix'),
  key: text('key').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'no action' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  refillInterval: text('refill_interval'),
  refillAmount: text('refill_amount'),
  lastRefillAt: timestamp('last_refill_at'),
  enabled: boolean('enabled').default(true),
  rateLimitEnabled: boolean('rate_limit_enabled').default(true),
  rateLimitTimeWindow: text('rate_limit_time_window').default('60'),
  rateLimitMax: text('rate_limit_max').default('100'),
  requestCount: text('request_count'),
  remaining: text('remaining'),
  lastRequest: timestamp('last_request'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  permissions: text('permissions'),
  metadata: text('metadata'),
});

/* ================================
   APPLICATION SCHEMA
   -------------------------------
   Application-specific tables.
=================================== */

/**
 * Represents a project within an organization.
 */
export const projects = pgTable('projects', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique(),
  description: text('description'),
  isDefault: boolean('is_default').default(false).notNull(),
  status: varchar('status', { length: 50 })
    .$type<'active' | 'archived' | 'deleted'>()
    .notNull()
    .default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Maps users to projects, defining their roles within a project.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).default('project_viewer').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserProject: unique().on(table.userId, table.projectId),
  }),
);

export type TestPriority = 'low' | 'medium' | 'high';
export type TestType = 'browser' | 'api' | 'database' | 'custom';
/**
 * Stores test definitions and scripts.
 */
export const tests = pgTable('tests', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  script: text('script').notNull().default(''), // Store Base64-encoded script content
  priority: varchar('priority', { length: 50 })
    .$type<TestPriority>()
    .notNull()
    .default('medium'),
  type: varchar('type', { length: 50 })
    .$type<TestType>()
    .notNull()
    .default('browser'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
});

export type JobStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';
export type JobConfig = {
  environment?: string;
  variables?: Record<string, string>;
  retryStrategy?: {
    maxRetries: number;
    backoffFactor: number;
  };
};

/**
 * Defines alert configurations for jobs and monitors.
 */
export type AlertConfig = {
  enabled: boolean;
  notificationProviders: string[]; // Limited to MAX_NOTIFICATION_CHANNELS
  alertOnFailure: boolean;
  alertOnRecovery?: boolean;
  alertOnSslExpiration?: boolean;
  alertOnSuccess?: boolean;
  alertOnTimeout?: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  customMessage?: string;
};
/**
 * Defines scheduled or on-demand jobs that run a collection of tests.
 */
export const jobs = pgTable('jobs', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  cronSchedule: varchar('cron_schedule', { length: 100 }),
  status: varchar('status', { length: 50 })
    .$type<JobStatus>()
    .notNull()
    .default('pending'),
  alertConfig: jsonb('alert_config').$type<AlertConfig>(),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  scheduledJobId: varchar('scheduled_job_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
});

/**
 * A join table linking jobs to the tests they include.
 */
export const jobTests = pgTable(
  'job_tests',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    testId: uuid('test_case_id')
      .notNull()
      .references(() => tests.id),
    orderPosition: integer('order_position'),
  },
  (table) => ({
    pk: primaryKey({
      name: 'job_test_cases_pk',
      columns: [table.jobId, table.testId],
    }),
  }),
);

export type TestRunStatus = 'running' | 'passed' | 'failed' | 'error';

export type JobTrigger = 'manual' | 'remote' | 'schedule';

export type ArtifactPaths = {
  logs?: string;
  video?: string;
  screenshots?: string[];
};

/**
 * Records the execution history and results of a job run.
 */
export const runs = pgTable('runs', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  status: varchar('status', { length: 50 })
    .$type<TestRunStatus>()
    .notNull()
    .default('running'),
  duration: varchar('duration', { length: 100 }),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  artifactPaths: jsonb('artifact_paths').$type<ArtifactPaths>(),
  logs: text('logs'),
  errorDetails: text('error_details'),
  trigger: varchar('trigger', { length: 50 })
    .$type<JobTrigger>()
    .notNull()
    .default('manual'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type ReportType = 'test' | 'job' | 'monitor';
/**
 * Stores information about generated reports for tests or jobs.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => user.id, {
      onDelete: 'no action',
    }),
    entityType: varchar('entity_type', { length: 50 })
      .$type<ReportType>()
      .notNull(),
    entityId: text('entity_id').notNull(), // Changed from uuid to support extended execution IDs
    reportPath: varchar('report_path', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('passed'),
    s3Url: varchar('s3_url', { length: 1024 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    typeIdUnique: uniqueIndex('reports_entity_type_id_idx').on(
      table.entityType,
      table.entityId,
    ),
  }),
);

export type MonitorType =
  | 'http_request'
  | 'website'
  | 'ping_host'
  | 'port_check'
  | 'synthetic_test';

/**
 * Represents the current status of a monitor.
 */
export type MonitorStatus =
  | 'up'
  | 'down'
  | 'paused'
  | 'pending'
  | 'maintenance'
  | 'error';

/**
 * Defines the configuration for a monitor, with settings specific to its type.
 */
export type MonitorConfig = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string;
  expectedStatusCodes?: string;
  keywordInBody?: string;
  keywordInBodyShouldBePresent?: boolean;
  responseBodyJsonPath?: { path: string; expectedValue: unknown };
  auth?: {
    type: 'none' | 'basic' | 'bearer';
    username?: string;
    password?: string;
    token?: string;
  };
  port?: number;
  protocol?: 'tcp' | 'udp';
  // SSL-specific settings
  enableSslCheck?: boolean;
  sslDaysUntilExpirationWarning?: number;
  sslCheckFrequencyHours?: number;
  sslLastCheckedAt?: string;
  sslCheckOnStatusChange?: boolean;
  // Legacy fields (deprecated, use SSL-specific fields above)
  checkExpiration?: boolean;
  daysUntilExpirationWarning?: number;
  checkRevocation?: boolean;
  timeoutSeconds?: number;
  regions?: string[];
  retryStrategy?: {
    maxRetries: number;
    backoffFactor: number;
  };
  alertChannels?: string[];
  // Synthetic test specific settings
  testId?: string;
  testTitle?: string; // Cached test title for display
  playwrightOptions?: {
    headless?: boolean;
    timeout?: number;
    retries?: number;
  };
  [key: string]: unknown;
};

/**
 * Defines monitoring configurations for services or endpoints.
 */
export const monitors = pgTable('monitors', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 50 }).$type<MonitorType>().notNull(),
  target: varchar('target', { length: 2048 }).notNull(),
  frequencyMinutes: integer('frequency_minutes').notNull().default(5),
  enabled: boolean('enabled').notNull().default(true),
  status: varchar('status', { length: 50 })
    .$type<MonitorStatus>()
    .notNull()
    .default('pending'),
  config: jsonb('config').$type<MonitorConfig>(),
  alertConfig: jsonb('alert_config').$type<AlertConfig>(),
  lastCheckAt: timestamp('last_check_at'),
  lastStatusChangeAt: timestamp('last_status_change_at'),
  mutedUntil: timestamp('muted_until'),
  scheduledJobId: varchar('scheduled_job_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
});

export type MonitorResultStatus = 'up' | 'down' | 'error' | 'timeout';
/**
 * Contains detailed information about the result of a single monitor check.
 */
export type MonitorResultDetails = {
  statusCode?: number;
  statusText?: string;
  errorMessage?: string;
  responseHeaders?: Record<string, string>;
  responseBodySnippet?: string;
  ipAddress?: string;
  location?: string;
  sslCertificate?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysRemaining?: number;
  };
  [key: string]: unknown;
};

/**
 * Stores the results of each monitor check.
 */
export const monitorResults = pgTable('monitor_results', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  monitorId: uuid('monitor_id')
    .notNull()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  checkedAt: timestamp('checked_at').notNull().defaultNow(),
  status: varchar('status', { length: 50 })
    .$type<MonitorResultStatus>()
    .notNull(),
  responseTimeMs: integer('response_time_ms'),
  details: jsonb('details').$type<MonitorResultDetails>(),
  isUp: boolean('is_up').notNull(),
  isStatusChange: boolean('is_status_change').notNull().default(false),
  consecutiveFailureCount: integer('consecutive_failure_count')
    .notNull()
    .default(0),
  alertsSentForFailure: integer('alerts_sent_for_failure').notNull().default(0),
  // For synthetic monitors - store test execution metadata
  testExecutionId: text('test_execution_id'), // Unique execution ID (for accessing reports)
  testReportS3Url: text('test_report_s3_url'), // Full S3 URL to the report
});

/**
 * A table for tags that can be applied to monitors for organization and filtering.
 */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => user.id, {
      onDelete: 'no action',
    }),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    projectTagNameUnique: uniqueIndex('tags_project_name_idx').on(
      table.projectId,
      table.name,
    ),
  }),
);

/**
 * A join table linking monitors to tags.
 */
export const monitorTags = pgTable(
  'monitor_tags',
  {
    monitorId: uuid('monitor_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.monitorId, table.tagId] }),
  }),
);

/**
 * A join table linking tests to tags.
 */
export const testTags = pgTable(
  'test_tags',
  {
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.testId, table.tagId] }),
  }),
);

type SecretEnvelope = {
  encrypted: true;
  version: 1;
  payload: string;
  context?: string;
};

export type NotificationProviderType =
  | 'email'
  | 'slack'
  | 'webhook'
  | 'telegram'
  | 'discord';

export type PlainNotificationProviderConfig = {
  name?: string;
  isDefault?: boolean;
  emails?: string;
  webhookUrl?: string;
  channel?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  botToken?: string;
  chatId?: string;
  discordWebhookUrl?: string;
  [key: string]: unknown;
};

export type EncryptedNotificationProviderConfig = SecretEnvelope;

/**
 * Holds the configuration details for different notification provider types.
 */
export type NotificationProviderConfig =
  | (PlainNotificationProviderConfig & { encrypted?: false })
  | EncryptedNotificationProviderConfig;

/**
 * Configures different channels for sending alerts (e.g., email, Slack).
 */
export const notificationProviders = pgTable('notification_providers', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 })
    .$type<NotificationProviderType>()
    .notNull(),
  config: jsonb('config').$type<NotificationProviderConfig>().notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type AlertType =
  | 'monitor_failure'
  | 'monitor_recovery'
  | 'job_failed'
  | 'job_success'
  | 'job_timeout'
  | 'ssl_expiring';
export type AlertStatus = 'sent' | 'failed' | 'pending';

/**
 * Logs the history of alerts that have been sent.
 */
export const alertHistory = pgTable('alert_history', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).$type<AlertType>().notNull(),
  target: varchar('target', { length: 255 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  monitorId: uuid('monitor_id').references(() => monitors.id, {
    onDelete: 'cascade',
  }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 })
    .$type<AlertStatus>()
    .notNull()
    .default('pending'),
  sentAt: timestamp('sent_at').defaultNow(),
  errorMessage: text('error_message'),
});

/**
 * Join table to link monitors with specific notification providers.
 */
export const monitorNotificationSettings = pgTable(
  'monitor_notification_settings',
  {
    monitorId: uuid('monitor_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    notificationProviderId: uuid('notification_provider_id')
      .notNull()
      .references(() => notificationProviders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: 'monitor_notification_settings_pk',
      columns: [table.monitorId, table.notificationProviderId],
    }),
  }),
);

/**
 * Join table to link jobs with specific notification providers.
 */
export const jobNotificationSettings = pgTable(
  'job_notification_settings',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    notificationProviderId: uuid('notification_provider_id')
      .notNull()
      .references(() => notificationProviders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.jobId, table.notificationProviderId] }),
  }),
);

/**
 * Holds the detailed information for an audit log entry.
 */
export type AuditDetails = {
  resource?: string;
  resourceId?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
};
/**
 * Records a log of all significant actions performed by users.
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  userId: uuid('user_id').references(() => user.id),
  organizationId: uuid('organization_id').references(() => organization.id),
  action: varchar('action', { length: 255 }).notNull(),
  details: jsonb('details').$type<AuditDetails>(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type NotificationType = 'email' | 'slack' | 'webhook' | 'in-app';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
/**
 * Defines the content of a notification.
 */
export type NotificationContent = {
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
};
/**
 * A generic table for storing user-facing notifications.
 */
export const notifications = pgTable('notifications', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id),
  type: varchar('type', { length: 50 })
    .$type<NotificationType>()
    .notNull()
    .default('email'),
  content: jsonb('content').$type<NotificationContent>().notNull(),
  status: varchar('status', { length: 50 })
    .$type<NotificationStatus>()
    .notNull()
    .default('pending'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Configures alert settings for monitors.
 */
export const alerts = pgTable('alerts', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),
  monitorId: uuid('monitor_id').references(() => monitors.id, {
    onDelete: 'cascade',
  }),
  enabled: boolean('enabled').default(true).notNull(),
  notificationProviders: jsonb('notification_providers').$type<string[]>(),
  alertOnFailure: boolean('alert_on_failure').default(true).notNull(),
  alertOnRecovery: boolean('alert_on_recovery').default(true),
  alertOnSslExpiration: boolean('alert_on_ssl_expiration').default(false),
  alertOnSuccess: boolean('alert_on_success').default(false),
  alertOnTimeout: boolean('alert_on_timeout').default(false),
  failureThreshold: integer('failure_threshold').default(1).notNull(),
  recoveryThreshold: integer('recovery_threshold').default(1).notNull(),
  customMessage: text('custom_message'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/* ================================
   ZOD SCHEMAS
   -------------------------------
   Export Zod schemas for validation and type inference.
=================================== */

export const testsInsertSchema = createInsertSchema(tests);
export const testsUpdateSchema = createUpdateSchema(tests);
export const testsSelectSchema = createSelectSchema(tests);

export const jobsInsertSchema = createInsertSchema(jobs);
export const jobsUpdateSchema = createUpdateSchema(jobs);
export const jobsSelectSchema = createSelectSchema(jobs);

export const alertSchema = createSelectSchema(alerts);
export type Alert = z.infer<typeof alertSchema>;
export const insertAlertSchema = createInsertSchema(alerts);

export const monitorsInsertSchema = createInsertSchema(monitors);
export const monitorsUpdateSchema = createUpdateSchema(monitors);
export const monitorsSelectSchema = createSelectSchema(monitors);

export const monitorResultsInsertSchema = createInsertSchema(monitorResults);
export const monitorResultsSelectSchema = createSelectSchema(monitorResults);

export const tagsInsertSchema = createInsertSchema(tags);
export const tagsSelectSchema = createSelectSchema(tags);

export const testTagsInsertSchema = createInsertSchema(testTags);
export const testTagsSelectSchema = createSelectSchema(testTags);

export const notificationProvidersInsertSchema = createInsertSchema(
  notificationProviders,
);
export const notificationProvidersSelectSchema = createSelectSchema(
  notificationProviders,
);

/**
 * Stores variables and secrets for projects
 */
export const projectVariables = pgTable(
  'project_variables',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 255 }).notNull(),
    value: text('value').notNull(), // Encrypted for secrets
    encryptedValue: text('encrypted_value'), // Base64 encrypted value for secrets
    isSecret: boolean('is_secret').default(false).notNull(),
    description: text('description'),
    createdByUserId: uuid('created_by_user_id').references(() => user.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueKeyPerProject: unique().on(table.projectId, table.key),
  }),
);

export const projectsInsertSchema = createInsertSchema(projects);
export const projectsSelectSchema = createSelectSchema(projects);
export const projectsUpdateSchema = createUpdateSchema(projects);

export const projectVariablesInsertSchema =
  createInsertSchema(projectVariables);
export const projectVariablesSelectSchema =
  createSelectSchema(projectVariables);
export const projectVariablesUpdateSchema =
  createUpdateSchema(projectVariables);

export const runsInsertSchema = createInsertSchema(runs);
export const runsSelectSchema = createSelectSchema(runs);
export type Run = z.infer<typeof runsSelectSchema>;

export const auditLogsInsertSchema = createInsertSchema(auditLogs);
export const auditLogsSelectSchema = createSelectSchema(auditLogs);

export const notificationsInsertSchema = createInsertSchema(notifications);
export const notificationsSelectSchema = createSelectSchema(notifications);

/* ================================
   STATUS PAGE SCHEMA
   -------------------------------
   Tables for status page functionality.
=================================== */

export type StatusPageStatus = 'draft' | 'published' | 'archived';
export type ComponentStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'under_maintenance';
export type IncidentStatus =
  | 'investigating'
  | 'identified'
  | 'monitoring'
  | 'resolved'
  | 'scheduled';
export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';
export type SubscriberMode = 'email' | 'sms' | 'webhook';

/**
 * Stores status page configurations with UUID-based subdomains
 */
export const statusPages = pgTable('status_pages', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  subdomain: varchar('subdomain', { length: 36 }).unique().notNull(),
  status: varchar('status', { length: 50 })
    .$type<StatusPageStatus>()
    .notNull()
    .default('draft'),
  pageDescription: text('page_description'),
  headline: varchar('headline', { length: 255 }),
  supportUrl: varchar('support_url', { length: 500 }),
  hiddenFromSearch: boolean('hidden_from_search').default(false),
  allowPageSubscribers: boolean('allow_page_subscribers').default(true),
  allowIncidentSubscribers: boolean('allow_incident_subscribers').default(true),
  allowEmailSubscribers: boolean('allow_email_subscribers').default(true),
  allowSmsSubscribers: boolean('allow_sms_subscribers').default(false),
  allowWebhookSubscribers: boolean('allow_webhook_subscribers').default(true),
  notificationsFromEmail: varchar('notifications_from_email', { length: 255 }),
  notificationsEmailFooter: text('notifications_email_footer'),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  // Branding
  cssBodyBackgroundColor: varchar('css_body_background_color', {
    length: 7,
  }).default('#ffffff'),
  cssFontColor: varchar('css_font_color', { length: 7 }).default('#333333'),
  cssLightFontColor: varchar('css_light_font_color', { length: 7 }).default(
    '#666666',
  ),
  cssGreens: varchar('css_greens', { length: 7 }).default('#2ecc71'),
  cssYellows: varchar('css_yellows', { length: 7 }).default('#f1c40f'),
  cssOranges: varchar('css_oranges', { length: 7 }).default('#e67e22'),
  cssBlues: varchar('css_blues', { length: 7 }).default('#3498db'),
  cssReds: varchar('css_reds', { length: 7 }).default('#e74c3c'),
  cssBorderColor: varchar('css_border_color', { length: 7 }).default('#ecf0f1'),
  cssGraphColor: varchar('css_graph_color', { length: 7 }).default('#3498db'),
  cssLinkColor: varchar('css_link_color', { length: 7 }).default('#3498db'),
  cssNoData: varchar('css_no_data', { length: 7 }).default('#bdc3c7'),
  faviconLogo: varchar('favicon_logo', { length: 500 }),
  transactionalLogo: varchar('transactional_logo', { length: 500 }),
  heroCover: varchar('hero_cover', { length: 500 }),
  emailLogo: varchar('email_logo', { length: 500 }),
  twitterLogo: varchar('twitter_logo', { length: 500 }),
  customDomain: varchar('custom_domain', { length: 255 }),
  customDomainVerified: boolean('custom_domain_verified').default(false),
  theme: jsonb('theme').default({}),
  brandingSettings: jsonb('branding_settings').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Component groups for organizing status page components
 */
export const statusPageComponentGroups = pgTable(
  'status_page_component_groups',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    statusPageId: uuid('status_page_id')
      .notNull()
      .references(() => statusPages.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    position: integer('position').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
);

/**
 * Status page components linked to monitors
 */
export const statusPageComponents = pgTable('status_page_components', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  statusPageId: uuid('status_page_id')
    .notNull()
    .references(() => statusPages.id, { onDelete: 'cascade' }),
  componentGroupId: uuid('component_group_id').references(
    () => statusPageComponentGroups.id,
    { onDelete: 'set null' },
  ),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 })
    .$type<ComponentStatus>()
    .notNull()
    .default('operational'),
  showcase: boolean('showcase').default(true),
  onlyShowIfDegraded: boolean('only_show_if_degraded').default(false),
  automationEmail: varchar('automation_email', { length: 255 }),
  startDate: timestamp('start_date'),
  position: integer('position').default(0),
  // Aggregation settings for multiple monitors
  aggregationMethod: varchar('aggregation_method', { length: 50 })
    .default('worst_case')
    .notNull(),
  failureThreshold: integer('failure_threshold').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Join table to link status page components with multiple monitors
 */
export const statusPageComponentMonitors = pgTable(
  'status_page_component_monitors',
  {
    componentId: uuid('component_id')
      .notNull()
      .references(() => statusPageComponents.id, { onDelete: 'cascade' }),
    monitorId: uuid('monitor_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    weight: integer('weight').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.componentId, table.monitorId] }),
  }),
);

/**
 * Incidents with workflow support
 */
export const incidents = pgTable('incidents', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  statusPageId: uuid('status_page_id')
    .notNull()
    .references(() => statusPages.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 })
    .$type<IncidentStatus>()
    .notNull()
    .default('investigating'),
  impact: varchar('impact', { length: 50 })
    .$type<IncidentImpact>()
    .notNull()
    .default('minor'),
  impactOverride: varchar('impact_override', { length: 50 }),
  body: text('body'),
  scheduledFor: timestamp('scheduled_for'),
  scheduledUntil: timestamp('scheduled_until'),
  scheduledRemindPrior: boolean('scheduled_remind_prior').default(true),
  autoTransitionToMaintenanceState: boolean(
    'auto_transition_to_maintenance_state',
  ).default(true),
  autoTransitionToOperationalState: boolean(
    'auto_transition_to_operational_state',
  ).default(true),
  scheduledAutoInProgress: boolean('scheduled_auto_in_progress').default(true),
  scheduledAutoCompleted: boolean('scheduled_auto_completed').default(true),
  autoTransitionDeliverNotificationsAtStart: boolean(
    'auto_transition_deliver_notifications_at_start',
  ).default(true),
  autoTransitionDeliverNotificationsAtEnd: boolean(
    'auto_transition_deliver_notifications_at_end',
  ).default(true),
  reminderIntervals: varchar('reminder_intervals', { length: 100 }).default(
    '[3,6,12,24]',
  ),
  metadata: jsonb('metadata').default({}),
  deliverNotifications: boolean('deliver_notifications').default(true),
  backfillDate: timestamp('backfill_date'),
  backfilled: boolean('backfilled').default(false),
  monitoringAt: timestamp('monitoring_at'),
  resolvedAt: timestamp('resolved_at'),
  shortlink: varchar('shortlink', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Incident updates with notification controls
 */
export const incidentUpdates = pgTable('incident_updates', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  body: text('body').notNull(),
  status: varchar('status', { length: 50 })
    .$type<IncidentStatus>()
    .notNull()
    .default('investigating'),
  deliverNotifications: boolean('deliver_notifications').default(true),
  displayAt: timestamp('display_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Affected components for incidents
 */
export const incidentComponents = pgTable('incident_components', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  incidentId: uuid('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  componentId: uuid('component_id')
    .notNull()
    .references(() => statusPageComponents.id, { onDelete: 'cascade' }),
  oldStatus: varchar('old_status', { length: 50 }),
  newStatus: varchar('new_status', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Incident templates for common issues
 */
export const incidentTemplates = pgTable('incident_templates', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  statusPageId: uuid('status_page_id')
    .notNull()
    .references(() => statusPages.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => user.id, {
    onDelete: 'no action',
  }),
  name: varchar('name', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  componentGroupId: uuid('component_group_id').references(
    () => statusPageComponentGroups.id,
  ),
  updateStatus: varchar('update_status', { length: 50 }).default(
    'investigating',
  ),
  shouldSendNotifications: boolean('should_send_notifications').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Template component associations
 */
export const incidentTemplateComponents = pgTable(
  'incident_template_components',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    templateId: uuid('template_id')
      .notNull()
      .references(() => incidentTemplates.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => statusPageComponents.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
);

/**
 * Subscribers with enhanced preferences
 */
export const statusPageSubscribers = pgTable('status_page_subscribers', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => sql`uuidv7()`),
  statusPageId: uuid('status_page_id')
    .notNull()
    .references(() => statusPages.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 50 }),
  phoneCountry: varchar('phone_country', { length: 2 }).default('US'),
  endpoint: varchar('endpoint', { length: 500 }),
  mode: varchar('mode', { length: 50 }).$type<SubscriberMode>().notNull(),
  skipConfirmationNotification: boolean(
    'skip_confirmation_notification',
  ).default(false),
  quarantinedAt: timestamp('quarantined_at'),
  purgeAt: timestamp('purge_at'),
  verifiedAt: timestamp('verified_at'),
  verificationToken: varchar('verification_token', { length: 255 }),
  unsubscribeToken: varchar('unsubscribe_token', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Component-specific subscriptions
 */
export const statusPageComponentSubscriptions = pgTable(
  'status_page_component_subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => statusPageSubscribers.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => statusPageComponents.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
);

/**
 * Incident-specific subscriptions
 */
export const statusPageIncidentSubscriptions = pgTable(
  'status_page_incident_subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => statusPageSubscribers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
);

/**
 * Status page metrics with detailed tracking
 */
export const statusPageMetrics = pgTable(
  'status_page_metrics',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    statusPageId: uuid('status_page_id')
      .notNull()
      .references(() => statusPages.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').references(
      () => statusPageComponents.id,
      { onDelete: 'cascade' },
    ),
    date: timestamp('date').notNull(),
    uptimePercentage: varchar('uptime_percentage', { length: 10 }),
    totalChecks: integer('total_checks').default(0),
    successfulChecks: integer('successful_checks').default(0),
    failedChecks: integer('failed_checks').default(0),
    averageResponseTimeMs: integer('average_response_time_ms'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    dateIdx: uniqueIndex('status_page_metrics_date_component_idx').on(
      table.statusPageId,
      table.componentId,
      table.date,
    ),
  }),
);

/**
 * Postmortems for incident analysis
 */
export const postmortems = pgTable(
  'postmortems',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => sql`uuidv7()`),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => user.id, {
      onDelete: 'no action',
    }),
    body: text('body').notNull(),
    bodyLastUpdatedAt: timestamp('body_last_updated_at').defaultNow(),
    ignored: boolean('ignored').default(false),
    notifiedSubscribers: boolean('notified_subscribers').default(false),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    incidentIdx: uniqueIndex('postmortems_incident_idx').on(table.incidentId),
  }),
);

/* ================================
   STATUS PAGE RELATIONS
   -------------------------------
   Define Drizzle ORM relations for status pages
=================================== */

// Incidents relations
export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  statusPage: one(statusPages, {
    fields: [incidents.statusPageId],
    references: [statusPages.id],
  }),
  updates: many(incidentUpdates),
  affectedComponents: many(incidentComponents),
  postmortem: one(postmortems),
}));

// Incident Updates relations
export const incidentUpdatesRelations = relations(
  incidentUpdates,
  ({ one }) => ({
    incident: one(incidents, {
      fields: [incidentUpdates.incidentId],
      references: [incidents.id],
    }),
  }),
);

// Incident Components relations
export const incidentComponentsRelations = relations(
  incidentComponents,
  ({ one }) => ({
    incident: one(incidents, {
      fields: [incidentComponents.incidentId],
      references: [incidents.id],
    }),
    component: one(statusPageComponents, {
      fields: [incidentComponents.componentId],
      references: [statusPageComponents.id],
    }),
  }),
);

// Status Page Components relations
export const statusPageComponentsRelations = relations(
  statusPageComponents,
  ({ one, many }) => ({
    statusPage: one(statusPages, {
      fields: [statusPageComponents.statusPageId],
      references: [statusPages.id],
    }),
    monitors: many(statusPageComponentMonitors),
    componentGroup: one(statusPageComponentGroups, {
      fields: [statusPageComponents.componentGroupId],
      references: [statusPageComponentGroups.id],
    }),
    incidents: many(incidentComponents),
  }),
);

// Status Page Component Monitors relations
export const statusPageComponentMonitorsRelations = relations(
  statusPageComponentMonitors,
  ({ one }) => ({
    component: one(statusPageComponents, {
      fields: [statusPageComponentMonitors.componentId],
      references: [statusPageComponents.id],
    }),
    monitor: one(monitors, {
      fields: [statusPageComponentMonitors.monitorId],
      references: [monitors.id],
    }),
  }),
);

// Status Page Subscribers relations
export const statusPageSubscribersRelations = relations(
  statusPageSubscribers,
  ({ one }) => ({
    statusPage: one(statusPages, {
      fields: [statusPageSubscribers.statusPageId],
      references: [statusPages.id],
    }),
  }),
);

// Zod Schemas for Status Pages
export const statusPagesInsertSchema = createInsertSchema(statusPages);
export const statusPagesSelectSchema = createSelectSchema(statusPages);
export const statusPagesUpdateSchema = createUpdateSchema(statusPages);

export const statusPageComponentGroupsInsertSchema = createInsertSchema(
  statusPageComponentGroups,
);
export const statusPageComponentGroupsSelectSchema = createSelectSchema(
  statusPageComponentGroups,
);

export const statusPageComponentsInsertSchema =
  createInsertSchema(statusPageComponents);
export const statusPageComponentsSelectSchema =
  createSelectSchema(statusPageComponents);

export const statusPageComponentMonitorsInsertSchema = createInsertSchema(
  statusPageComponentMonitors,
);
export const statusPageComponentMonitorsSelectSchema = createSelectSchema(
  statusPageComponentMonitors,
);

export const incidentsInsertSchema = createInsertSchema(incidents);
export const incidentsSelectSchema = createSelectSchema(incidents);
export const incidentsUpdateSchema = createUpdateSchema(incidents);

export const incidentUpdatesInsertSchema = createInsertSchema(incidentUpdates);
export const incidentUpdatesSelectSchema = createSelectSchema(incidentUpdates);

export const incidentTemplatesInsertSchema =
  createInsertSchema(incidentTemplates);
export const incidentTemplatesSelectSchema =
  createSelectSchema(incidentTemplates);

export const statusPageSubscribersInsertSchema = createInsertSchema(
  statusPageSubscribers,
);
export const statusPageSubscribersSelectSchema = createSelectSchema(
  statusPageSubscribers,
);

export const statusPageMetricsInsertSchema =
  createInsertSchema(statusPageMetrics);
export const statusPageMetricsSelectSchema =
  createSelectSchema(statusPageMetrics);

export const postmortemsInsertSchema = createInsertSchema(postmortems);
export const postmortemsSelectSchema = createSelectSchema(postmortems);

/* ================================
   AUTH SCHEMA EXPORT
   -------------------------------
   Object containing all tables required by the better-auth drizzle adapter.
=================================== */
export const authSchema = {
  user,
  organization,
  member,
  invitation,
  session,
  account,
  verification,
  apikey,
};
