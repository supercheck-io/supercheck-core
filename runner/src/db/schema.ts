import {
  integer,
  pgTable,
  text,
  varchar,
  primaryKey,
  timestamp,
  jsonb,
  uuid,
  customType,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";

/* ================================
   USERS TABLE
   -------------------------------
   Stores user account details. Each user has a pseudo‑UUID id,
   an email (with a unique index), name fields, and timestamps
   for creation, update, and last login.
=================================== */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastLogin: timestamp("last_login"),
});

/* ================================
   ORGANIZATIONS TABLE
   -------------------------------
   Represents organizations owned by users. Each organization is linked
   to a user (ownerId) and includes metadata for custom fields and settings,
   billing information, status, quotas, and timestamps.
=================================== */
export type OrganizationMetadata = {
  customFields?: Record<string, string>;
  settings?: Record<string, unknown>;
};
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  metadata: jsonb("metadata").$type<OrganizationMetadata>(),
  billingPlan: varchar("billing_plan", { length: 50 }).notNull().default("free"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  testQuota: integer("test_quota").default(100),
  maxParallelJobs: integer("max_parallel_jobs").default(5),
  retentionDays: integer("retention_days").default(30),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   ORGANIZATION MEMBERS TABLE
   -------------------------------
   Maintains a many‑to‑many relationship between users and organizations.
   Tracks membership roles (admin, member, read‑only), who invited the member,
   and when the membership was established.
   Uses a composite primary key on (userId, organizationId).
=================================== */
export type MemberRole = "admin" | "member" | "read-only";
export const organizationMembers = pgTable(
  "organization_members",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: varchar("role", { length: 50 }).$type<MemberRole>().notNull().default("read-only"),
    invitedBy: uuid("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.userId, table.organizationId] }),
    };
  }
);

/* ================================
   PROJECTS TABLE
   -------------------------------
   Contains projects that belong to organizations.
   Each project includes details such as its name, description,
   status (active, archived, or deleted), and timestamps.
=================================== */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 })
    .$type<"active" | "archived" | "deleted">()
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   TEST CASES TABLE
   -------------------------------
   Stores automated test cases associated with projects.
   Includes details such as the test title, description, automation script,
   priority level, test type, tags (stored as JSON), and audit fields for
   who created and last updated the test case.
=================================== */
export type TestPriority = "low" | "medium" | "high";
export type TestType = "browser" | "api" | "multistep" | "database";
export const tests = pgTable("tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  script: text("script").notNull().default(""), // Store Base64-encoded script content
  priority: varchar("priority", { length: 50 }).$type<TestPriority>().notNull().default("medium"),
  type: varchar("type", { length: 50 }).$type<TestType>().notNull().default("browser"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   JOBS TABLE
   -------------------------------
   Defines scheduled jobs for executing tests. Each job is linked to a project
   and includes details such as a cron schedule, current status, configuration
   (stored as JSON), retry count, timeout settings, and timestamps.
=================================== */
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
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 50 }).$type<JobStatus>().notNull().default("pending"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   JOB TEST CASES TABLE
   -------------------------------
   Maps test cases to jobs (many‑to‑many relationship) with an optional order
   field to define the sequence in which test cases should be executed.
=================================== */
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

/* ================================
   TEST RUNS TABLE
   -------------------------------
   Stores execution records for each test run linked to a job and a test case.
   Captures run status, duration, start/completion times, artifact paths, logs,
   error details, video URL, and screenshot URLs.
=================================== */
export type TestRunStatus =
  | "running"
  | "passed"
  | "failed"
  | "error";
export type ArtifactPaths = {
  logs?: string;
  video?: string;
  screenshots?: string[];
};
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  status: varchar("status", { length: 50 }).$type<TestRunStatus>().notNull().default("running"),
  duration: varchar("duration", { length: 100 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  artifactPaths: jsonb("artifact_paths").$type<ArtifactPaths>(),
  logs: text("logs"),
  errorDetails: text("error_details"),
});

/* ================================
   MONITORS TABLE
   -------------------------------
   Stores the configuration for different types of monitors (e.g., HTTP, Ping).
   Includes details like name, type, target, frequency, current status,
   and specific configuration options.
=================================== */
export type MonitorType =
  | "http_request"    // Check HTTP/S endpoints (availability, status, response time)
  | "website"         // Monitor website availability and performance (HTTP GET) with optional SSL checking
  | "ping_host"       // ICMP ping to a host
  | "port_check"      // Check specific TCP or UDP port
  | "heartbeat"       // Passive monitoring expecting regular pings


export type MonitorStatus =
  | "up"
  | "down"
  | "paused"
  | "pending"
  | "maintenance"
  | "error";

export type MonitorConfig = {
  // http_request specific
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>; 
  body?: string; 
  expectedStatusCodes?: string;
  keywordInBody?: string; 
  keywordInBodyShouldBePresent?: boolean; 
  responseBodyJsonPath?: { path: string; expectedValue: any }; 

  auth?: {
    type: "none" | "basic" | "bearer";
    username?: string; 
    password?: string; 
    token?: string;    
  };

  // port_check specific
  port?: number;
  protocol?: "tcp" | "udp";

  // heartbeat specific
  expectedIntervalMinutes?: number; // e.g., 5 (5 minutes)
  gracePeriodMinutes?: number; // e.g., 2 (2 minutes grace period)
  heartbeatUrl?: string; // Auto-generated unique URL for receiving pings
  lastPingAt?: string; // ISO string of last received ping

  // ssl_check specific (target is domain name) - for future use
  checkExpiration?: boolean;
  daysUntilExpirationWarning?: number; 
  checkRevocation?: boolean; 

  // Common configuration applicable to many types
  timeoutSeconds?: number; 
  regions?: string[]; 
  retryStrategy?: {
    maxRetries: number; 
    backoffFactor: number; 
  };
  alertChannels?: string[]; 
  
  [key: string]: any; 
};

export const monitors = pgTable("monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id"),
  createdByUserId: text("created_by_user_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).$type<MonitorType>().notNull(),
  target: varchar("target", { length: 2048 }).notNull(),
  frequencyMinutes: integer("frequency_minutes").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
  status: varchar("status", { length: 50 }).$type<MonitorStatus>().notNull().default("pending"),
  config: jsonb("config").$type<MonitorConfig>(),
  lastCheckAt: timestamp("last_check_at"),
  lastStatusChangeAt: timestamp("last_status_change_at"),
  mutedUntil: timestamp("muted_until"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   MONITOR RESULTS TABLE
   -------------------------------
   Stores the results of each individual check performed on a monitor.
   Includes status, response time, and any specific details or errors.
=================================== */
export type MonitorResultStatus = "up" | "down" | "error" | "timeout";
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
  [key: string]: any; 
};

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
});

/* ================================
   REPORTS TABLE
   -------------------------------
   Provides a summary report of test job outcomes including counts of total,
   passed, failed, skipped, and flaky tests, duration, and browser performance
   metrics (stored as JSON). Tracks the report creation timestamp.
=================================== */
export type BrowserMetrics = {
  performance?: Record<string, number>;
  memory?: Record<string, number>;
  timing?: Record<string, number>;
};
export const jobsInsertSchema = createInsertSchema(jobs);
export const jobsUpdateSchema = createUpdateSchema(jobs);
export const jobsSelectSchema = createSelectSchema(jobs);

// Export ReportType before using it in the reports table definition
export type ReportType = "test" | "job";
export const reports = pgTable(
  "reports", 
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 50 }).$type<ReportType>().notNull(),
    entityId: uuid("entity_id").notNull(),
    reportPath: varchar("report_path", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("passed"),
    s3Url: varchar("s3_url", { length: 1024 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    // Add a unique constraint on entityType and entityId to prevent duplicates
    typeIdUnique: uniqueIndex("reports_entity_type_id_idx").on(
      table.entityType, 
      table.entityId
    ),
  })
);

/* ================================
   NOTIFICATION PROVIDERS TABLE
   -------------------------------
   Stores configuration for notification providers (email, Slack, etc.)
   that can be used to send alerts for monitors and jobs.
=================================== */
export type NotificationProviderType = "email" | "slack" | "webhook" | "telegram" | "discord";
export type NotificationProviderConfig = {
  // Email configuration
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  fromEmail?: string;
  toEmail?: string;

  // Slack configuration
  webhookUrl?: string;
  channel?: string;

  // Webhook configuration
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;

  // Telegram configuration
  botToken?: string;
  chatId?: string;

  // Discord configuration
  discordWebhookUrl?: string;

  [key: string]: any;
};

export const notificationProviders = pgTable("notification_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).$type<NotificationProviderType>().notNull(),
  config: jsonb("config").$type<NotificationProviderConfig>().notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  organizationId: uuid("organization_id").references(() => organizations.id),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   AUDIT LOGS TABLE
   -------------------------------
   Records audit logs for critical system actions performed by users.
   Includes details on the action, affected resource, changes made, and a
   timestamp of when the action occurred.
=================================== */
export type AuditDetails = {
  resource?: string;
  resourceId?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
};
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  action: varchar("action", { length: 255 }).notNull(),
  details: jsonb("details").$type<AuditDetails>(),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ================================
   NOTIFICATIONS TABLE
   -------------------------------
   Contains notifications sent to users.
   Supports various types (email, slack, webhook, in‑app) and tracks
   notification content, status, and the time the notification was sent.
=================================== */
export type NotificationType = "email" | "slack" | "webhook" | "in-app";
export type NotificationStatus = "pending" | "sent" | "failed" | "cancelled";
export type NotificationContent = {
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
};
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 50 }).$type<NotificationType>().notNull().default("email"),
  content: jsonb("content").$type<NotificationContent>().notNull(),
  status: varchar("status", { length: 50 })
    .$type<NotificationStatus>()
    .notNull()
    .default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ================================
   INTEGRATIONS TABLE
   -------------------------------
   Manages integrations with external services for projects.
   Includes service configuration (stored as JSON), encrypted API tokens,
   and timestamps indicating when the integration was last used, created,
   or updated.
=================================== */
export type IntegrationConfig = {
  webhookUrl?: string;
  apiEndpoint?: string;
  settings?: Record<string, unknown>;
};

// Define custom type for bytea
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  config: jsonb("config").$type<IntegrationConfig>().notNull(),
  encryptedApiToken: bytea("encrypted_api_token"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const testsInsertSchema = createInsertSchema(tests);
export const testsUpdateSchema = createUpdateSchema(tests);
export const testsSelectSchema = createSelectSchema(tests);

// Zod Schemas for 'users' table
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const updateUserSchema = createUpdateSchema(users, {
  // email is notNull in DB, make it optional for updates
  email: (fieldSchema) => fieldSchema.optional(), 
  // firstName and lastName are nullable in DB, so already optional in update schema
  // no need to customize them here unless other changes are needed.
});

// Zod Schemas for 'organizations' table
export const insertOrganizationSchema = createInsertSchema(organizations);
export const selectOrganizationSchema = createSelectSchema(organizations);
export const updateOrganizationSchema = createUpdateSchema(organizations, {
  // name and ownerId are notNull in DB, make them optional for updates
  name: (fieldSchema) => fieldSchema.optional(),
  ownerId: (fieldSchema) => fieldSchema.optional(),
  // Other fields are nullable or have defaults, so createUpdateSchema handles them
});

