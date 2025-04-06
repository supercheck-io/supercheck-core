import {
  int,
  sqliteTable,
  text,
  // blob,
  primaryKey,
  // uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import crypto from "crypto";
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
// export const users = sqliteTable("users", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   email: text("email").notNull(),
//   firstName: text("first_name"),
//   lastName: text("last_name"),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
//   updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
//   lastLogin: text("last_login"),
// });
// export const usersEmailIdx = uniqueIndex("users_email_idx").on(users.email);

/* ================================
   ORGANIZATIONS TABLE
   -------------------------------
   Represents organizations owned by users. Each organization is linked
   to a user (ownerId) and includes metadata for custom fields and settings,
   billing information, status, quotas, and timestamps.
=================================== */
// export type OrganizationMetadata = {
//   customFields?: Record<string, string>;
//   settings?: Record<string, unknown>;
// };
// export const organizations = sqliteTable("organizations", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   name: text("name").notNull(),
//   ownerId: text("owner_id")
//     .notNull()
//     .references(() => users.id),
//   metadata: text("metadata", { mode: "json" }).$type<OrganizationMetadata>(),
//   billingPlan: text("billing_plan").notNull().default("free"),
//   status: text("status").notNull().default("active"),
//   subscriptionExpiresAt: text("subscription_expires_at"),
//   testQuota: int("test_quota").default(100),
//   maxParallelJobs: int("max_parallel_jobs").default(5),
//   retentionDays: int("retention_days").default(30),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
//   updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
// });
// export const organizationsOwnerIdx = uniqueIndex("organizations_owner_idx").on(
//   organizations.ownerId
// );
// export const organizationsNameIdx = index("organizations_name_idx").on(
//   organizations.name
// );
// export const organizationsStatusIdx = index("organizations_status_idx").on(
//   organizations.status
// );

/* ================================
   ORGANIZATION MEMBERS TABLE
   -------------------------------
   Maintains a many‑to‑many relationship between users and organizations.
   Tracks membership roles (admin, member, read‑only), who invited the member,
   and when the membership was established.
   Uses a composite primary key on (userId, organizationId).
=================================== */
// export type MemberRole = "admin" | "member" | "read-only";
// export const organizationMembers = sqliteTable(
//   "organization_members",
//   {
//     userId: text("user_id")
//       .notNull()
//       .references(() => users.id),
//     organizationId: text("organization_id")
//       .notNull()
//       .references(() => organizations.id),
//     role: text("role").$type<MemberRole>().notNull().default("read-only"),
//     invitedBy: text("invited_by").references(() => users.id),
//     joinedAt: text("joined_at").default(sql`CURRENT_TIMESTAMP`),
//   },
//   (table) => {
//     return {
//       pk: primaryKey(table.userId, table.organizationId),
//     };
//   }
// );
// export const organizationMembersUserIdIdx = index("org_members_user_id_idx").on(
//   organizationMembers.userId
// );
// export const organizationMembersOrgIdIdx = index("org_members_org_id_idx").on(
//   organizationMembers.organizationId
// );

/* ================================
   PROJECTS TABLE
   -------------------------------
   Contains projects that belong to organizations.
   Each project includes details such as its name, description,
   status (active, archived, or deleted), and timestamps.
=================================== */
// export const projects = sqliteTable("projects", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   organizationId: text("organization_id")
//     .notNull()
//     .references(() => organizations.id),
//   name: text("name").notNull(),
//   description: text("description"),
//   status: text("status")
//     .$type<"active" | "archived" | "deleted">()
//     .notNull()
//     .default("active"),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
//   updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
// });
// export const projectsOrgIdIdx = index("projects_org_id_idx").on(
//   projects.organizationId
// );
// export const projectsNameIdx = index("projects_name_idx").on(projects.name);
// export const projectsStatusIdx = index("projects_status_idx").on(
//   projects.status
// );

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
export const tests = sqliteTable("tests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // projectId: text("project_id")
  //   .notNull()
  //   .references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  script: text("script").notNull().default(""), // Store Base64-encoded script content
  priority: text("priority").$type<TestPriority>().notNull().default("medium"),
  type: text("type").$type<TestType>().notNull().default("browser"),
  // tags: text("tags", { mode: "json" })
  //   .$type<string[]>()
  //   .default(sql`'[]'`),
  // createdBy: text("created_by")
  //   .notNull()
  //   .references(() => users.id),
  // updatedBy: text("updated_by")
  //   .notNull()
  //   .references(() => users.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
// export const testsProjectIdIdx = index("tests_project_id_idx").on(
//   tests.projectId
// );
export const testsTitleIdx = index("tests_title_idx").on(tests.title);
export const testsTypeIdx = index("tests_type_idx").on(tests.type);
export const testsPriorityIdx = index("tests_priority_idx").on(tests.priority);

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
  | "completed"
  | "failed"
  | "cancelled";
export type JobConfig = {
  environment?: string;
  variables?: Record<string, string>;
  retryStrategy?: {
    maxRetries: number;
    backoffFactor: number;
  };
};
export const jobs = sqliteTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // projectId: text("project_id")
  //   .notNull()
  //   .references(() => projects.id),
  name: text("name").notNull(),
  description: text("description"),
  cronSchedule: text("cron_schedule"),
  status: text("status").$type<JobStatus>().notNull().default("pending"),
  // config: text("config", { mode: "json" }).$type<JobConfig>(),
  // retryCount: int("retry_count").default(0),
  // timeoutSeconds: int("timeout_seconds").default(600),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
// export const jobsProjectIdIdx = index("jobs_project_id_idx").on(jobs.projectId);
export const jobsNameIdx = index("jobs_name_idx").on(jobs.name);
export const jobsStatusIdx = index("jobs_status_idx").on(jobs.status);
export const jobsNextRunAtIdx = index("jobs_next_run_at_idx").on(
  jobs.nextRunAt
);

/* ================================
   JOB TEST CASES TABLE
   -------------------------------
   Maps test cases to jobs (many‑to‑many relationship) with an optional order
   field to define the sequence in which test cases should be executed.
=================================== */
export const jobTests = sqliteTable(
  "job_tests",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    testId: text("test_case_id")
      .notNull()
      .references(() => tests.id),
    orderPosition: int("order_position"),
  },
  (table) => [
    primaryKey({
      name: "job_test_cases_pk",
      columns: [table.jobId, table.testId],
    }),
  ]
);
export const jobTestsJobIdIdx = index("job_tests_job_id_idx").on(
  jobTests.jobId
);
export const jobTestsTestIdIdx = index("job_tests_test_id_idx").on(
  jobTests.testId
);

/* ================================
   TEST RUNS TABLE
   -------------------------------
   Stores execution records for each test run linked to a job and a test case.
   Captures run status, duration, start/completion times, artifact paths, logs,
   error details, video URL, and screenshot URLs.
=================================== */
export type TestRunStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "error";
export type ArtifactPaths = {
  logs?: string;
  video?: string;
  screenshots?: string[];
};
export const testRuns = sqliteTable("test_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  status: text("status").$type<TestRunStatus>().notNull().default("pending"),
  duration: text("duration"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  artifactPaths: text("artifact_paths", {
    mode: "json",
  }).$type<ArtifactPaths>(),
  logs: text("logs"),
  errorDetails: text("error_details"),
});
export const testRunsJobIdIdx = index("test_runs_job_id_idx").on(
  testRuns.jobId
);
// export const testRunsTestIdIdx = index("test_runs_test_id_idx").on(
//   testRuns.testId
// );
export const testRunsStatusIdx = index("test_runs_status_idx").on(
  testRuns.status
);
export const testRunsStartedAtIdx = index("test_runs_started_at_idx").on(
  testRuns.startedAt
);
export const testRunsCompletedAtIdx = index("test_runs_completed_at_idx").on(
  testRuns.completedAt
);

/* ================================
   REPORTS TABLE
   -------------------------------
   Provides a summary report of test job outcomes including counts of total,
   passed, failed, skipped, and flaky tests, duration, and browser performance
   metrics (stored as JSON). Tracks the report creation timestamp.
=================================== */
// export type BrowserMetrics = {
//   performance?: Record<string, number>;
//   memory?: Record<string, number>;
//   timing?: Record<string, number>;
// };
// export const reports = sqliteTable("reports", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   jobId: text("job_id")
//     .notNull()
//     .references(() => jobs.id),
//   totalTests: int("total_tests").notNull(),
//   passedTests: int("passed_tests").notNull(),
//   failedTests: int("failed_tests").notNull(),
//   skippedTests: int("skipped_tests").default(0),
//   flakyTests: int("flaky_tests").default(0),
//   duration: text("duration").notNull(),
//   browserMetrics: text("browser_metrics", {
//     mode: "json",
//   }).$type<BrowserMetrics>(),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
// });
// export const reportsJobIdIdx = index("reports_job_id_idx").on(reports.jobId);
// export const reportsCreatedAtIdx = index("reports_created_at_idx").on(
//   reports.createdAt
// );

/* ================================
   AUDIT LOGS TABLE
   -------------------------------
   Records audit logs for critical system actions performed by users.
   Includes details on the action, affected resource, changes made, and a
   timestamp of when the action occurred.
=================================== */
// export type AuditDetails = {
//   resource?: string;
//   resourceId?: string;
//   changes?: Record<string, { before: unknown; after: unknown }>;
//   metadata?: Record<string, unknown>;
// };
// export const auditLogs = sqliteTable("audit_logs", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   userId: text("user_id").references(() => users.id),
//   organizationId: text("organization_id").references(() => organizations.id),
//   action: text("action").notNull(),
//   details: text("details", { mode: "json" }).$type<AuditDetails>(),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
// });
// export const auditLogsUserIdIdx = index("audit_logs_user_id_idx").on(
//   auditLogs.userId
// );
// export const auditLogsOrgIdIdx = index("audit_logs_org_id_idx").on(
//   auditLogs.organizationId
// );
// export const auditLogsActionIdx = index("audit_logs_action_idx").on(
//   auditLogs.action
// );
// export const auditLogsCreatedAtIdx = index("audit_logs_created_at_idx").on(
//   auditLogs.createdAt
// );

/* ================================
   NOTIFICATIONS TABLE
   -------------------------------
   Contains notifications sent to users.
   Supports various types (email, slack, webhook, in‑app) and tracks
   notification content, status, and the time the notification was sent.
=================================== */
// export type NotificationType = "email" | "slack" | "webhook" | "in-app";
// export type NotificationStatus = "pending" | "sent" | "failed" | "cancelled";
// export type NotificationContent = {
//   subject?: string;
//   body: string;
//   data?: Record<string, unknown>;
// };
// export const notifications = sqliteTable("notifications", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   userId: text("user_id")
//     .notNull()
//     .references(() => users.id),
//   type: text("type").$type<NotificationType>().notNull().default("email"),
//   content: text("content", { mode: "json" })
//     .$type<NotificationContent>()
//     .notNull(),
//   status: text("status")
//     .$type<NotificationStatus>()
//     .notNull()
//     .default("pending"),
//   sentAt: text("sent_at"),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
// });
// export const notificationsUserIdIdx = index("notifications_user_id_idx").on(
//   notifications.userId
// );
// export const notificationsStatusIdx = index("notifications_status_idx").on(
//   notifications.status
// );
// export const notificationsTypeIdx = index("notifications_type_idx").on(
//   notifications.type
// );
// export const notificationsCreatedAtIdx = index(
//   "notifications_created_at_idx"
// ).on(notifications.createdAt);

/* ================================
   INTEGRATIONS TABLE
   -------------------------------
   Manages integrations with external services for projects.
   Includes service configuration (stored as JSON), encrypted API tokens,
   and timestamps indicating when the integration was last used, created,
   or updated.
=================================== */
// export type IntegrationConfig = {
//   webhookUrl?: string;
//   apiEndpoint?: string;
//   settings?: Record<string, unknown>;
// };
// export const integrations = sqliteTable("integrations", {
//   id: text("id")
//     .primaryKey()
//     .$defaultFn(() => crypto.randomUUID()),
//   projectId: text("project_id")
//     .notNull()
//     .references(() => projects.id),
//   serviceName: text("service_name").notNull(),
//   config: text("config", { mode: "json" }).$type<IntegrationConfig>().notNull(),
//   encryptedApiToken: blob("encrypted_api_token"),
//   lastUsedAt: text("last_used_at"),
//   createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
//   updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
// });
// export const integrationsProjectIdIdx = index("integrations_project_id_idx").on(
//   integrations.projectId
// );
// export const integrationsServiceNameIdx = index(
//   "integrations_service_name_idx"
// ).on(integrations.serviceName);

export const testsInsertSchema = createInsertSchema(tests);
export const testsUpdateSchema = createUpdateSchema(tests);
export const testsSelectSchema = createSelectSchema(tests);

export const jobsInsertSchema = createInsertSchema(jobs);
export const jobsUpdateSchema = createUpdateSchema(jobs);
export const jobsSelectSchema = createSelectSchema(jobs);
