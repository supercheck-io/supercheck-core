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
} from "drizzle-orm/pg-core";

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

/* ================================
   AUTH SCHEMA
   -------------------------------
   Tables required by better-auth, modified to use UUIDs.
=================================== */

/**
 * Stores user information for authentication and identification.
 */
export const user = pgTable("user", {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	role: text('role'),
	banned: boolean('banned'),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires')
});

/**
 * Represents an organization or a company account.
 */
export const organization = pgTable("organization", {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	slug: text('slug').unique(),
	logo: text('logo'),
	createdAt: timestamp('created_at').notNull(),
	metadata: text('metadata')
});

/**
 * Maps users to organizations, defining their roles.
 */
export const member = pgTable("member", {
	id: uuid('id').primaryKey().defaultRandom(),
	organizationId: uuid('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	role: text('role').default('project_viewer').notNull(),
	createdAt: timestamp('created_at').notNull()
}, (table) => ({
	uniqueUserOrg: unique().on(table.userId, table.organizationId),
}));

/**
 * Stores pending invitations for users to join an organization.
 */
export const invitation = pgTable("invitation", {
	id: uuid('id').primaryKey().defaultRandom(),
	organizationId: uuid('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
	email: text('email').notNull(),
	role: text('role'),
	status: text('status').default('pending').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	inviterId: uuid('inviter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	selectedProjects: text('selected_projects') // JSON array of project IDs
});

/**
 * Manages user sessions for authentication.
 */
export const session = pgTable("session", {
	id: uuid('id').primaryKey().defaultRandom(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	activeOrganizationId: uuid('active_organization_id').references(() => organization.id),
	activeProjectId: uuid('active_project_id').references(() => projects.id),
	impersonatedBy: text('impersonated_by')
});

/**
 * Stores provider-specific account information for OAuth.
 */
export const account = pgTable("account", {
	id: uuid('id').primaryKey().defaultRandom(),
	accountId: text('account_id'),
	providerId: text('provider_id').notNull(),
	userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

/**
 * Stores tokens for email verification or password resets.
 */
export const verification = pgTable("verification", {
	id: uuid('id').primaryKey().defaultRandom(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

/**
 * Manages API keys for programmatic access.
 */
export const apikey = pgTable("apikey", {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name'),
	start: text('start'),
	prefix: text('prefix'),
	key: text('key').notNull(),
	userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'no action' }),
	jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
	projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
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
	metadata: text('metadata')
});

/* ================================
   APPLICATION SCHEMA
   -------------------------------
   Application-specific tables.
=================================== */



/**
 * Represents a project within an organization.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  status: varchar("status", { length: 50 })
    .$type<"active" | "archived" | "deleted">()
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Maps users to projects, defining their roles within a project.
 */
export const projectMembers = pgTable("project_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: varchar("role", { length: 50 }).default('project_viewer').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserProject: unique().on(table.userId, table.projectId),
}));

export type TestPriority = "low" | "medium" | "high";
export type TestType = "browser" | "api" |  "database" | "custom" ;
/**
 * Stores test definitions and scripts.
 */
export const tests = pgTable("tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "no action" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  script: text("script").notNull().default(""), // Store Base64-encoded script content
  priority: varchar("priority", { length: 50 }).$type<TestPriority>().notNull().default("medium"),
  type: varchar("type", { length: 50 }).$type<TestType>().notNull().default("browser"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type JobStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "error";
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
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "no action" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 50 }).$type<JobStatus>().notNull().default("pending"),
  alertConfig: jsonb("alert_config").$type<AlertConfig>(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  scheduledJobId: varchar("scheduled_job_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * A join table linking jobs to the tests they include.
 */
export const jobTests = pgTable(
  "job_tests",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    testId: uuid("test_case_id")
      .notNull()
      .references(() => tests.id),
    orderPosition: integer("order_position"),
  },
  (table) => ({
    pk: primaryKey({
      name: "job_test_cases_pk",
      columns: [table.jobId, table.testId],
    }),
  })
);



export type TestRunStatus =
  | "running"
  | "passed"
  | "failed"
  | "error";

export type JobTrigger = 
  | "manual"
  | "remote" 
  | "schedule";

export type ArtifactPaths = {
  logs?: string;
  video?: string;
  screenshots?: string[];
};

/**
 * Records the execution history and results of a job run.
 */
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).$type<TestRunStatus>().notNull().default("running"),
  duration: varchar("duration", { length: 100 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  artifactPaths: jsonb("artifact_paths").$type<ArtifactPaths>(),
  logs: text("logs"),
  errorDetails: text("error_details"),
  trigger: varchar("trigger", { length: 50 }).$type<JobTrigger>().notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ReportType = "test" | "job";
/**
 * Stores information about generated reports for tests or jobs.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "no action" }),
    entityType: varchar("entity_type", { length: 50 }).$type<ReportType>().notNull(),
    entityId: uuid("entity_id").notNull(),
    reportPath: varchar("report_path", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("passed"),
    s3Url: varchar("s3_url", { length: 1024 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    typeIdUnique: uniqueIndex("reports_entity_type_id_idx").on(
      table.entityType,
      table.entityId
    ),
  })
);

export type MonitorType =
  | "http_request"
  | "website"
  | "ping_host"
  | "port_check";

/**
 * Represents the current status of a monitor.
 */
export type MonitorStatus =
  | "up"
  | "down"
  | "paused"
  | "pending"
  | "maintenance"
  | "error";

/**
 * Defines the configuration for a monitor, with settings specific to its type.
 */
export type MonitorConfig = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string;
  expectedStatusCodes?: string;
  keywordInBody?: string;
  keywordInBodyShouldBePresent?: boolean;
  responseBodyJsonPath?: { path: string; expectedValue: unknown };
  auth?: {
    type: "none" | "basic" | "bearer";
    username?: string;
    password?: string;
    token?: string;
  };
  port?: number;
  protocol?: "tcp" | "udp";
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
  [key: string]: unknown;
};

/**
 * Defines monitoring configurations for services or endpoints.
 */
export const monitors = pgTable("monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "no action" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).$type<MonitorType>().notNull(),
  target: varchar("target", { length: 2048 }).notNull(),
  frequencyMinutes: integer("frequency_minutes").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
  status: varchar("status", { length: 50 }).$type<MonitorStatus>().notNull().default("pending"),
  config: jsonb("config").$type<MonitorConfig>(),
  alertConfig: jsonb("alert_config").$type<AlertConfig>(),
  lastCheckAt: timestamp("last_check_at"),
  lastStatusChangeAt: timestamp("last_status_change_at"),
  mutedUntil: timestamp("muted_until"),
  scheduledJobId: varchar("scheduled_job_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MonitorResultStatus = "up" | "down" | "error" | "timeout";
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
export const monitorResults = pgTable("monitor_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  monitorId: uuid("monitor_id")
    .notNull()
    .references(() => monitors.id, { onDelete: "cascade" }),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
  status: varchar("status", { length: 50 }).$type<MonitorResultStatus>().notNull(),
  responseTimeMs: integer("response_time_ms"),
  details: jsonb("details").$type<MonitorResultDetails>(),
  isUp: boolean("is_up").notNull(),
  isStatusChange: boolean("is_status_change").notNull().default(false),
  consecutiveFailureCount: integer("consecutive_failure_count").notNull().default(0),
  alertsSentForFailure: integer("alerts_sent_for_failure").notNull().default(0),
});

/**
 * A table for tags that can be applied to monitors for organization and filtering.
 */
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "no action" }),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
},
(table) => ({
    projectTagNameUnique: uniqueIndex("tags_project_name_idx").on(
      table.projectId,
      table.name
    ),
  })
);

/**
 * A join table linking monitors to tags.
 */
export const monitorTags = pgTable(
  "monitor_tags",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.monitorId, table.tagId] }),
  })
);

/**
 * A join table linking tests to tags.
 */
export const testTags = pgTable(
  "test_tags",
  {
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.testId, table.tagId] }),
  })
);

export type NotificationProviderType = "email" | "slack" | "webhook" | "telegram" | "discord" | "teams";
/**
 * Holds the configuration details for different notification provider types.
 */
export type NotificationProviderConfig = {
  name?: string;
  isDefault?: boolean;
  
  // Email configuration - simplified field using environment variables for SMTP
  emails?: string;
  
  // Slack configuration
  webhookUrl?: string;
  channel?: string;
  
  // Webhook configuration
  url?: string;
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  bodyTemplate?: string;
  
  // Telegram configuration
  botToken?: string;
  chatId?: string;
  
  // Discord configuration
  discordWebhookUrl?: string;
  
  // Microsoft Teams configuration
  teamsWebhookUrl?: string;
  
  [key: string]: unknown;
};

/**
 * Configures different channels for sending alerts (e.g., email, Slack).
 */
export const notificationProviders = pgTable("notification_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "no action" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).$type<NotificationProviderType>().notNull(),
  config: jsonb("config").$type<NotificationProviderConfig>().notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AlertType = "monitor_failure" | "monitor_recovery" | "job_failed" | "job_success" | "job_timeout" | "ssl_expiring";
export type AlertStatus = "sent" | "failed" | "pending";

/**
 * Logs the history of alerts that have been sent.
 */
export const alertHistory = pgTable("alert_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).$type<AlertType>().notNull(),
  target: varchar("target", { length: 255 }).notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  monitorId: uuid("monitor_id").references(() => monitors.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).$type<AlertStatus>().notNull().default("pending"),
  sentAt: timestamp("sent_at").defaultNow(),
  errorMessage: text("error_message"),
});

/**
 * Join table to link monitors with specific notification providers.
 */
export const monitorNotificationSettings = pgTable(
  "monitor_notification_settings",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    notificationProviderId: uuid("notification_provider_id")
      .notNull()
      .references(() => notificationProviders.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ name: "monitor_notification_settings_pk", columns: [table.monitorId, table.notificationProviderId] }),
  })
);

/**
 * Join table to link jobs with specific notification providers.
 */
export const jobNotificationSettings = pgTable(
  "job_notification_settings",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    notificationProviderId: uuid("notification_provider_id")
      .notNull()
      .references(() => notificationProviders.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.jobId, table.notificationProviderId] }),
  })
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
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => user.id),
  organizationId: uuid("organization_id").references(() => organization.id),
  action: varchar("action", { length: 255 }).notNull(),
  details: jsonb("details").$type<AuditDetails>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type NotificationType = "email" | "slack" | "webhook" | "in-app";
export type NotificationStatus = "pending" | "sent" | "failed" | "cancelled";
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
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  type: varchar("type", { length: 50 }).$type<NotificationType>().notNull().default("email"),
  content: jsonb("content").$type<NotificationContent>().notNull(),
  status: varchar("status", { length: 50 })
    .$type<NotificationStatus>()
    .notNull()
    .default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});


/**
 * Configures alert settings for monitors.
 */
export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organization.id, { onDelete: "cascade" }),
  monitorId: uuid("monitor_id").references(() => monitors.id, { onDelete: 'cascade' }),
  enabled: boolean("enabled").default(true).notNull(),
  notificationProviders: jsonb("notification_providers").$type<string[]>(),
  alertOnFailure: boolean("alert_on_failure").default(true).notNull(),
  alertOnRecovery: boolean("alert_on_recovery").default(true),
  alertOnSslExpiration: boolean("alert_on_ssl_expiration").default(false),
  alertOnSuccess: boolean("alert_on_success").default(false),
  alertOnTimeout: boolean("alert_on_timeout").default(false),
  failureThreshold: integer("failure_threshold").default(1).notNull(),
  recoveryThreshold: integer("recovery_threshold").default(1).notNull(),
  customMessage: text("custom_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
export type Alert = z.infer<typeof alertSchema>
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

export const notificationProvidersInsertSchema = createInsertSchema(notificationProviders);
export const notificationProvidersSelectSchema = createSelectSchema(notificationProviders);




/**
 * Stores variables and secrets for projects
 */
export const projectVariables = pgTable("project_variables", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 255 }).notNull(),
  value: text("value").notNull(), // Encrypted for secrets
  encryptedValue: text("encrypted_value"), // Base64 encrypted value for secrets
  isSecret: boolean("is_secret").default(false).notNull(),
  description: text("description"),
  createdByUserId: uuid("created_by_user_id").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueKeyPerProject: unique().on(table.projectId, table.key),
}));

export const projectsInsertSchema = createInsertSchema(projects);
export const projectsSelectSchema = createSelectSchema(projects);
export const projectsUpdateSchema = createUpdateSchema(projects);

export const projectVariablesInsertSchema = createInsertSchema(projectVariables);
export const projectVariablesSelectSchema = createSelectSchema(projectVariables);
export const projectVariablesUpdateSchema = createUpdateSchema(projectVariables);

export const runsInsertSchema = createInsertSchema(runs);  
export const runsSelectSchema = createSelectSchema(runs);
export type Run = z.infer<typeof runsSelectSchema>;

export const auditLogsInsertSchema = createInsertSchema(auditLogs);
export const auditLogsSelectSchema = createSelectSchema(auditLogs);

export const notificationsInsertSchema = createInsertSchema(notifications);
export const notificationsSelectSchema = createSelectSchema(notifications);


/* ================================
   AUTH SCHEMA EXPORT
   -------------------------------
   Object containing all tables required by the better-auth drizzle adapter.
=================================== */
export const authSchema = { user, organization, member, invitation, session, account, verification, apikey };