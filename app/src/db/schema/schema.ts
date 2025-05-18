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
  // tags: jsonb("tags")
  //   .$type<string[]>()
  //   .default([]),
  // createdBy: uuid("created_by")
  //   .notNull()
  //   .references(() => users.id),
  // updatedBy: uuid("updated_by")
  //   .notNull()
  //   .references(() => users.id),
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
  // config: jsonb("config").$type<JobConfig>(),
  // retryCount: integer("retry_count").default(0),
  // timeoutSeconds: integer("timeout_seconds").default(600),
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

