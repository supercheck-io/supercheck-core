// seed.ts
import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";

// Import your Drizzle tables from the schema file
import {
  // core tables
  users,
  organizations,
  organizationMembers,
  projects,
  testCases,
  jobs,
  jobTestCases,
  testRuns,
  reports,
  auditLogs,
  notifications,
  integrations,
} from "./schema";

// If you need random UUIDs for referencing in SQLite, you can use crypto.randomUUID():
import crypto from "node:crypto";

/**
 * 1) Create the libsql client
 *    This can be a file-based SQLite or a hosted Turso URL,
 *    depending on what you set in .env / DB_FILE_NAME
 */
const client = createClient({
  url: process.env.DB_FILE_NAME!, // e.g. "file:./dev.sqlite"
});

/**
 * 2) Initialize Drizzle with the schema
 */
const db = drizzle(client);

async function main() {
  //
  // 1. Create a user
  //
  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Johnson",
    // createdAt, updatedAt default to CURRENT_TIMESTAMP
  });
  console.log("Inserted user:", userId);

  //
  // 2. Create an organization referencing that user as owner
  //
  const orgId = crypto.randomUUID();
  await db.insert(organizations).values({
    id: orgId,
    name: "Example Org",
    ownerId: userId,
    billingPlan: "free",
    status: "active",
  });
  console.log("Inserted org:", orgId);

  //
  // 3. Create an organization_member entry to show membership
  //
  await db.insert(organizationMembers).values({
    userId,
    organizationId: orgId,
    role: "admin", 
    invitedBy: null,
  });
  console.log("Inserted org membership for user -> org");

  //
  // 4. Create a project referencing that organization
  //
  const projectId = crypto.randomUUID();
  await db.insert(projects).values({
    id: projectId,
    organizationId: orgId,
    name: "Sample Project",
    status: "active",
  });
  console.log("Inserted project:", projectId);

  //
  // 5. Create a test case referencing the project + created_by, updated_by = user
  //
  const testCaseId = crypto.randomUUID();
  await db.insert(testCases).values({
    id: testCaseId,
    projectId,
    title: "User can log in",
    playwrightScript: "test('User login', async () => { /* ... */ });",
    priority: "medium",
    type: "browser",
    tags: sql`json('[\"login\", \"smoke\"]')`,
    createdBy: userId,
    updatedBy: userId,
  });
  console.log("Inserted test case:", testCaseId);

  //
  // 6. Create a job referencing the project
  //
  const jobId = crypto.randomUUID();
  await db.insert(jobs).values({
    id: jobId,
    projectId,
    name: "Nightly Regression",
    cronSchedule: "0 2 * * *", // runs at 2 AM daily
    status: "pending",
  });
  console.log("Inserted job:", jobId);

  //
  // 7. Link the job + test case (many-to-many)
  //
  await db.insert(jobTestCases).values({
    jobId,
    testCaseId,
    orderPosition: 1,
  });
  console.log("Linked job to test case");

  //
  // 8. Create a test run referencing the same job + test case
  //
  const testRunId = crypto.randomUUID();
  await db.insert(testRuns).values({
    id: testRunId,
    jobId,
    testCaseId,
    status: "pending",
  });
  console.log("Inserted test run:", testRunId);

  //
  // 9. Create a report referencing the job
  //
  const reportId = crypto.randomUUID();
  await db.insert(reports).values({
    id: reportId,
    jobId,
    totalTests: 1,
    passedTests: 0,
    failedTests: 1,
    duration: "5 minutes",
  });
  console.log("Inserted report:", reportId);

  //
  // 10. Create an audit log referencing the user + org
  //
  const auditLogId = crypto.randomUUID();
  await db.insert(auditLogs).values({
    id: auditLogId,
    userId,
    organizationId: orgId,
    action: "CREATE_PROJECT",
    details: sql`json('{ "projectName": "Sample Project" }')`,
  });
  console.log("Inserted audit log:", auditLogId);

  //
  // 11. Create a notification referencing the user
  //
  const notificationId = crypto.randomUUID();
  await db.insert(notifications).values({
    id: notificationId,
    userId,
    type: "email",
    content: sql`json('{ "subject": "Build Failed", "body": "Test run failed" }')`,
    status: "pending",
  });
  console.log("Inserted notification:", notificationId);

  //
  // 12. Create an integration referencing the project
  //
  const integrationId = crypto.randomUUID();
  await db.insert(integrations).values({
    id: integrationId,
    projectId,
    serviceName: "Slack",
    config: sql`json('{ "webhookUrl": "https://hooks.slack.com/..." }')`,
  });
  console.log("Inserted integration:", integrationId);

  //
  // Finally, query something if you want to verify
  //
  const allProjects = await db.select().from(projects);
  console.log("All projects after seeding:", allProjects);

  console.log("Seed data inserted successfully!");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
