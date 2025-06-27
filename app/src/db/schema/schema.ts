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

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";

import { organization, user as authUser } from "./auth-schema"; // Import organization and user (aliased to authUser to avoid naming conflict if you have a local user concept)

/* ================================
   TESTS TABLE
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
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
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

export type AlertConfig = {
  enabled: boolean;
  notificationProviders: string[];
  alertOnFailure: boolean;
  alertOnRecovery?: boolean;
  alertOnSslExpiration?: boolean;
  alertOnSuccess?: boolean;
  alertOnTimeout?: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  customMessage?: string;
};
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
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
   REPORTS TABLE
   -------------------------------
   Provides a summary report of test job outcomes including counts of total,
   passed, failed, skipped, and flaky tests, duration, and browser performance
   metrics (stored as JSON). Tracks the report creation timestamp.
=================================== */

// Export ReportType before using it in the reports table definition
export type ReportType = "test" | "job";
export const reports = pgTable(
  "reports", 
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      // .notNull() // Ensured nullable for now
      .references(() => organization.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
    entityType: varchar("entity_type", { length: 50 }).$type<ReportType>().notNull(),
    entityId: uuid("entity_id").notNull(), // This ID should belong to an entity (test/job) within the same organizationId
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


export const testsInsertSchema = createInsertSchema(tests);
export const testsUpdateSchema = createUpdateSchema(tests);
export const testsSelectSchema = createSelectSchema(tests);

export const jobsInsertSchema = createInsertSchema(jobs);
export const jobsUpdateSchema = createUpdateSchema(jobs);
export const jobsSelectSchema = createSelectSchema(jobs);

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
  headers?: Record<string, string>; // This will be stored as a JSON string from the form
  body?: string; // Can be JSON string or other content types
  expectedStatusCodes?: string; // Changed from expectedStatusCode?: number to match runner and form
  keywordInBody?: string; 
  keywordInBodyShouldBePresent?: boolean; 
  responseBodyJsonPath?: { path: string; expectedValue: any };

  auth?: {
    type: "none" | "basic" | "bearer";
    username?: string; // For basic auth
    password?: string; // For basic auth - IMPORTANT: Consider secret management
    token?: string;    // For bearer token - IMPORTANT: Consider secret management
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
  daysUntilExpirationWarning?: number; // e.g., 30
  checkRevocation?: boolean; // (Advanced, might require OCSP/CRL checks)

  // Common configuration applicable to many types
  timeoutSeconds?: number; // e.g., 10
  regions?: string[]; // e.g., ["us-east-1", "eu-west-2"] (for distributed checks)
  retryStrategy?: {
    maxRetries: number; // e.g., 3
    backoffFactor: number; // e.g., 2 for exponential backoff
  };
  alertChannels?: string[]; // e.g., ["email:admin@example.com", "slack:channel-id"]
  
  [key: string]: any; // For other type-specific or future settings
};

export const monitors = pgTable("monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).$type<MonitorType>().notNull(),
  target: varchar("target", { length: 2048 }).notNull(), // URL, IP, cron expression, domain
  frequencyMinutes: integer("frequency_minutes").notNull().default(5), // Check interval in minutes
  enabled: boolean("enabled").notNull().default(true), // NEW: To enable/disable checks
  status: varchar("status", { length: 50 }).$type<MonitorStatus>().notNull().default("pending"),
  config: jsonb("config").$type<MonitorConfig>(),
  alertConfig: jsonb("alert_config").$type<AlertConfig>(),
  lastCheckAt: timestamp("last_check_at"),
  lastStatusChangeAt: timestamp("last_status_change_at"),
  mutedUntil: timestamp("muted_until"), // For temporary pausing of alerts
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // consecutiveFailures: integer("consecutive_failures").notNull().default(0), // Optional: for alerting
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
  responseBodySnippet?: string; // Store a small snippet for debugging
  ipAddress?: string; // Resolved IP for ping/http checks
  location?: string; // e.g., "us-east-1" if checked from a specific region
  sslCertificate?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysRemaining?: number;
  };
  [key: string]: any; // For other check-specific details
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
  isUp: boolean("is_up").notNull(), // Derived from status for easier querying/aggregation
  isStatusChange: boolean("is_status_change").notNull().default(false), // NEW: Flag if this result changed the monitor's overall status
});

/* ================================
   TAGS TABLE
   -------------------------------
   Stores tags that can be applied to monitors. Tags are now per-organization.
=================================== */
export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
  name: varchar("name", { length: 100 }).notNull(), // Unique constraint should be per-organization now
  color: varchar("color", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
},
(table) => ({
    organizationTagNameUnique: uniqueIndex("tags_organization_name_idx").on(
      table.organizationId, 
      table.name
    ),
  })
);

/* ================================
   MONITOR TAGS TABLE (Join Table)
   -------------------------------
   Maps monitors to tags (many-to-many relationship).
=================================== */
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

/* ================================
   NOTIFICATION PROVIDERS TABLE
   -------------------------------
   Notification providers are configured per-organization.
=================================== */
export type NotificationProviderType = "email" | "slack" | "webhook" | "telegram" | "discord"; // Add more as needed
export type NotificationProviderConfig = {
  // Common
  name: string; // User-defined name for this specific notification setup
  isDefault?: boolean; // If this is a default notification channel for new monitors

  // email specific
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string; // IMPORTANT: Manage secrets properly
  smtpSecure?: boolean;
  fromEmail?: string;
  toEmail?: string; // Can be comma-separated for multiple recipients

  // slack specific
  webhookUrl?: string; // Slack incoming webhook URL
  channel?: string; // e.g., #alerts

  // webhook specific
  url?: string;
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  bodyTemplate?: string; // JSON or text template for the webhook body

  // telegram specific
  botToken?: string;
  chatId?: string;

  // discord specific
  discordWebhookUrl?: string;

  [key: string]: any; // For other provider-specific settings
};

export const notificationProviders = pgTable("notification_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
  type: varchar("type", { length: 50 }).$type<NotificationProviderType>().notNull(),
  config: jsonb("config").$type<NotificationProviderConfig>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   ALERT HISTORY TABLE
   -------------------------------
   Stores the history of all alert notifications sent
=================================== */
export type AlertType = "monitor_failure" | "monitor_recovery" | "job_failed" | "job_success" | "job_timeout" | "ssl_expiring";
export type AlertStatus = "sent" | "failed" | "pending";

export const alertHistory = pgTable("alert_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).$type<AlertType>().notNull(),
  target: varchar("target", { length: 255 }).notNull(), // Monitor or job name
  targetType: varchar("target_type", { length: 50 }).notNull(), // "monitor" or "job"
  monitorId: uuid("monitor_id").references(() => monitors.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 100 }).notNull(), // Provider name for display
  status: varchar("status", { length: 50 }).$type<AlertStatus>().notNull().default("pending"),
  sentAt: timestamp("sent_at").defaultNow(),
  errorMessage: text("error_message"), // If status is "failed"
});

/* ================================
   MONITOR NOTIFICATIONS TABLE (Join Table)
   -------------------------------
   Links monitors to specific notification provider configurations.
   A monitor can have multiple notification channels.
=================================== */
export const monitorNotificationSettings = pgTable(
  "monitor_notification_settings",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    notificationProviderId: uuid("notification_provider_id")
      .notNull()
      .references(() => notificationProviders.id, { onDelete: "cascade" }),
    // Additional settings for this specific monitor-notification link, if needed
    // e.g., notifyOnUp: boolean("notify_on_up").default(true),
    //       notifyOnDown: boolean("notify_on_down").default(true),
    //       notifyOnReminders: boolean("notify_on_reminders").default(false),
    //       reminderIntervalMinutes: integer("reminder_interval_minutes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.monitorId, table.notificationProviderId] }),
  })
);

/* ================================
   JOB NOTIFICATIONS TABLE (Join Table)
   -------------------------------
   Links jobs to specific notification provider configurations.
   A job can have multiple notification channels.
=================================== */
export const jobNotificationSettings = pgTable(
  "job_notification_settings",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    notificationProviderId: uuid("notification_provider_id")
      .notNull()
      .references(() => notificationProviders.id, { onDelete: "cascade" }),
    // Additional settings for this specific job-notification link, if needed
    // e.g., notifyOnSuccess: boolean("notify_on_success").default(true),
    //       notifyOnFailure: boolean("notify_on_failure").default(true),
    //       notifyOnTimeout: boolean("notify_on_timeout").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.jobId, table.notificationProviderId] }),
  })
);

/* ================================
   STATUS PAGES TABLE
   -------------------------------
   Status pages are created per-organization.
=================================== */
export type StatusPageLayout = "list" | "grid"; // Example layouts
export const statusPages = pgTable("status_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
  slug: varchar("slug", { length: 100 }).notNull(), // Unique constraint should be per-organization now
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  customDomain: varchar("custom_domain", { length: 255 }),
  logoUrl: varchar("logo_url", { length: 2048 }),
  faviconUrl: varchar("favicon_url", { length: 2048 }),
  customCss: text("custom_css"),
  customHtmlHeader: text("custom_html_header"),
  customHtmlFooter: text("custom_html_footer"),
  isPublic: boolean("is_public").notNull().default(true),
  showTags: boolean("show_tags").notNull().default(false),
  layout: varchar("layout", { length: 50 }).$type<StatusPageLayout>().default("list"),
  passwordProtected: boolean("password_protected").notNull().default(false),
  passwordHash: varchar("password_hash", { length: 255 }), // Store hashed password if passwordProtected
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
},
(table) => ({
    organizationSlugUnique: uniqueIndex("status_page_organization_slug_idx").on(
      table.organizationId, 
      table.slug
    ),
  })
);

/* ================================
   STATUS PAGE MONITORS TABLE (Join Table)
   -------------------------------
   Defines which monitors are displayed on which status page, with ordering.
=================================== */
export const statusPageMonitors = pgTable(
  "status_page_monitors",
  {
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
    groupName: varchar("group_name", { length: 100 }), // Optional grouping on the status page
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.statusPageId, table.monitorId] }),
  })
);

/* ================================
   MAINTENANCE WINDOWS TABLE
   -------------------------------
   Maintenance windows are defined per-organization.
=================================== */
export const maintenanceWindows = pgTable("maintenance_windows", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    // .notNull() // Ensured nullable for now
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => authUser.id, { onDelete: "no action" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  // For recurring maintenance, you might add cron-like fields or iCalendar RRULE string
  // rrule: varchar("rrule", { length: 255 }),
  timezone: varchar("timezone", { length: 100 }), // e.g., "Europe/London"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ================================
   MONITOR MAINTENANCE WINDOWS TABLE (Join Table)
   -------------------------------
   Links specific monitors to maintenance windows.
   A monitor can be affected by multiple maintenance windows.
   A maintenance window can affect all monitors (if monitorId is null) or specific ones.
=================================== */
export const monitorMaintenanceWindows = pgTable(
  "monitor_maintenance_windows",
  {
    maintenanceWindowId: uuid("maintenance_window_id")
      .notNull()
      .references(() => maintenanceWindows.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.maintenanceWindowId, table.monitorId] }), 
  })
);


// Zod schemas for monitors
export const monitorsInsertSchema = createInsertSchema(monitors);
export const monitorsUpdateSchema = createUpdateSchema(monitors);
export const monitorsSelectSchema = createSelectSchema(monitors);

// Zod schemas for monitor_results
export const monitorResultsInsertSchema = createInsertSchema(monitorResults);
export const monitorResultsSelectSchema = createSelectSchema(monitorResults);

// Zod schemas for new tables
export const tagsInsertSchema = createInsertSchema(tags);
export const tagsSelectSchema = createSelectSchema(tags);

export const notificationProvidersInsertSchema = createInsertSchema(notificationProviders);
export const notificationProvidersSelectSchema = createSelectSchema(notificationProviders);

export const statusPagesInsertSchema = createInsertSchema(statusPages);
export const statusPagesSelectSchema = createSelectSchema(statusPages);

export const maintenanceWindowsInsertSchema = createInsertSchema(maintenanceWindows);
export const maintenanceWindowsSelectSchema = createSelectSchema(maintenanceWindows);

