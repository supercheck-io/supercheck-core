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
  // projectId: uuid("project_id")
  //   .notNull()
  //   .references(() => projects.id),
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
  // projectId: uuid("project_id")
  //   .notNull()
  //   .references(() => projects.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cronSchedule: varchar("cron_schedule", { length: 100 }),
  status: varchar("status", { length: 50 }).$type<JobStatus>().notNull().default("pending"),
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
  | "ping_host"       // ICMP ping to a host
  | "port_check"      // Check specific TCP or UDP port
  | "dns_check"       // DNS record validation (A, CNAME, MX, TXT, etc.)
  | "playwright_script"; // Execute an existing Playwright test script from the 'tests' table

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
  expectedStatusCode?: number; 
  keywordInBody?: string; 
  keywordInBodyShouldBePresent?: boolean; 
  responseBodyJsonPath?: { path: string; expectedValue: any }; 

  auth?: {
    type: "none" | "basic" | "bearer"; // Add more types like "apiKey" later if needed
    username?: string; // For basic auth
    password?: string; // For basic auth - IMPORTANT: Consider secret management
    token?: string;    // For bearer token - IMPORTANT: Consider secret management
  };

  // port_check specific
  port?: number;
  protocol?: "tcp" | "udp";

  // ssl_check specific (target is domain name)
  checkExpiration?: boolean;
  daysUntilExpirationWarning?: number; // e.g., 30
  checkRevocation?: boolean; // (Advanced, might require OCSP/CRL checks)

  // dns_check specific (target is domain name)
  recordType?: "A" | "AAAA" | "CNAME" | "MX" | "NS" | "PTR" | "SOA" | "SRV" | "TXT";
  expectedValue?: string; // e.g., IP address for A record, server for MX, text for TXT

  // playwright_script specific
  testId?: string; // UUID of the test case from the 'tests' table
  // Variables/Overrides for the script can be passed here if needed
  scriptVariables?: Record<string, any>; 

  // heartbeat specific (target is an expected unique identifier for the incoming ping)
  expectedIntervalSeconds?: number; // e.g., 300 (5 minutes)
  gracePeriodSeconds?: number; // e.g., 60

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
  // userId: uuid("user_id").references(() => users.id), // If monitors are user-specific
  // projectId: uuid("project_id").references(() => projects.id), // If monitors are project-specific
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).$type<MonitorType>().notNull(),
  target: varchar("target", { length: 2048 }).notNull(), // URL, IP, cron expression, domain
  frequencyMinutes: integer("frequency_minutes").notNull().default(5), // Check interval in minutes
  status: varchar("status", { length: 50 }).$type<MonitorStatus>().notNull().default("pending"),
  config: jsonb("config").$type<MonitorConfig>(),
  lastCheckAt: timestamp("last_check_at"),
  lastStatusChangeAt: timestamp("last_status_change_at"),
  mutedUntil: timestamp("muted_until"), // For temporary pausing of alerts
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
});

// Zod schemas for monitors
export const monitorsInsertSchema = createInsertSchema(monitors);
export const monitorsUpdateSchema = createUpdateSchema(monitors);
export const monitorsSelectSchema = createSelectSchema(monitors);

// Zod schemas for monitor_results
export const monitorResultsInsertSchema = createInsertSchema(monitorResults);
export const monitorResultsSelectSchema = createSelectSchema(monitorResults);

