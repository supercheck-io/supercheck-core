import { pgTable, uuid, text, timestamp, unique, boolean, foreignKey, varchar, integer, jsonb, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"



export const verification = pgTable("verification", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const user = pgTable("user", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	role: text(),
	banned: boolean(),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires", { mode: 'string' }),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: text("account_id"),
	providerId: text("provider_id").notNull(),
	userId: uuid("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const monitors = pgTable("monitors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	projectId: uuid("project_id"),
	createdByUserId: uuid("created_by_user_id"),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	type: varchar({ length: 50 }).notNull(),
	target: varchar({ length: 2048 }).notNull(),
	frequencyMinutes: integer("frequency_minutes").default(5).notNull(),
	enabled: boolean().default(true).notNull(),
	status: varchar({ length: 50 }).default('pending').notNull(),
	config: jsonb(),
	alertConfig: jsonb("alert_config"),
	lastCheckAt: timestamp("last_check_at", { mode: 'string' }),
	lastStatusChangeAt: timestamp("last_status_change_at", { mode: 'string' }),
	mutedUntil: timestamp("muted_until", { mode: 'string' }),
	scheduledJobId: varchar("scheduled_job_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "monitors_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "monitors_project_id_projects_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "monitors_created_by_user_id_user_id_fk"
		}),
]);

export const alertHistory = pgTable("alert_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	message: text().notNull(),
	type: varchar({ length: 50 }).notNull(),
	target: varchar({ length: 255 }).notNull(),
	targetType: varchar("target_type", { length: 50 }).notNull(),
	monitorId: uuid("monitor_id"),
	jobId: uuid("job_id"),
	provider: varchar({ length: 100 }).notNull(),
	status: varchar({ length: 50 }).default('pending').notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow(),
	errorMessage: text("error_message"),
}, (table) => [
	foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitors.id],
			name: "alert_history_monitor_id_monitors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "alert_history_job_id_jobs_id_fk"
		}).onDelete("cascade"),
]);

export const jobs = pgTable("jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	projectId: uuid("project_id"),
	createdByUserId: uuid("created_by_user_id"),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	cronSchedule: varchar("cron_schedule", { length: 100 }),
	status: varchar({ length: 50 }).default('pending').notNull(),
	alertConfig: jsonb("alert_config"),
	lastRunAt: timestamp("last_run_at", { mode: 'string' }),
	nextRunAt: timestamp("next_run_at", { mode: 'string' }),
	scheduledJobId: varchar("scheduled_job_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "jobs_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "jobs_project_id_projects_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "jobs_created_by_user_id_user_id_fk"
		}),
]);

export const organization = pgTable("organization", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text(),
	logo: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	metadata: text(),
}, (table) => [
	unique("organization_slug_unique").on(table.slug),
]);

export const alerts = pgTable("alerts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	monitorId: uuid("monitor_id"),
	enabled: boolean().default(true).notNull(),
	notificationProviders: jsonb("notification_providers"),
	alertOnFailure: boolean("alert_on_failure").default(true).notNull(),
	alertOnRecovery: boolean("alert_on_recovery").default(true),
	alertOnSslExpiration: boolean("alert_on_ssl_expiration").default(false),
	alertOnSuccess: boolean("alert_on_success").default(false),
	alertOnTimeout: boolean("alert_on_timeout").default(false),
	failureThreshold: integer("failure_threshold").default(1).notNull(),
	recoveryThreshold: integer("recovery_threshold").default(1).notNull(),
	customMessage: text("custom_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "alerts_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitors.id],
			name: "alerts_monitor_id_monitors_id_fk"
		}).onDelete("cascade"),
]);

export const apikey = pgTable("apikey", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text(),
	start: text(),
	prefix: text(),
	key: text().notNull(),
	userId: uuid("user_id").notNull(),
	jobId: uuid("job_id"),
	projectId: uuid("project_id"),
	refillInterval: text("refill_interval"),
	refillAmount: text("refill_amount"),
	lastRefillAt: timestamp("last_refill_at", { mode: 'string' }),
	enabled: boolean().default(true),
	rateLimitEnabled: boolean("rate_limit_enabled").default(true),
	rateLimitTimeWindow: text("rate_limit_time_window").default('60'),
	rateLimitMax: text("rate_limit_max").default('100'),
	requestCount: text("request_count"),
	remaining: text(),
	lastRequest: timestamp("last_request", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	permissions: text(),
	metadata: text(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "apikey_user_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "apikey_job_id_jobs_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "apikey_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const projects = pgTable("projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }),
	description: text(),
	isDefault: boolean("is_default").default(false).notNull(),
	status: varchar({ length: 50 }).default('active').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "projects_organization_id_organization_id_fk"
		}),
	unique("projects_slug_unique").on(table.slug),
]);

export const auditLogs = pgTable("audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	organizationId: uuid("organization_id"),
	action: varchar({ length: 255 }).notNull(),
	details: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "audit_logs_user_id_user_id_fk"
		}),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "audit_logs_organization_id_organization_id_fk"
		}),
]);

export const integrations = pgTable("integrations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	serviceName: varchar("service_name", { length: 255 }).notNull(),
	config: jsonb().notNull(),
	// TODO: failed to parse database type 'bytea' - using text as fallback
	encryptedApiToken: text("encrypted_api_token"),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "integrations_project_id_projects_id_fk"
		}),
]);

export const invitation = pgTable("invitation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	email: text().notNull(),
	role: text(),
	status: text().default('pending').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	inviterId: uuid("inviter_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "invitation_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inviterId],
			foreignColumns: [user.id],
			name: "invitation_inviter_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const notificationProviders = pgTable("notification_providers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	projectId: uuid("project_id"),
	createdByUserId: uuid("created_by_user_id"),
	name: varchar({ length: 255 }).notNull(),
	type: varchar({ length: 50 }).notNull(),
	config: jsonb().notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "notification_providers_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "notification_providers_project_id_projects_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "notification_providers_created_by_user_id_user_id_fk"
		}),
]);

export const tests = pgTable("tests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	projectId: uuid("project_id"),
	createdByUserId: uuid("created_by_user_id"),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	script: text().default('').notNull(),
	priority: varchar({ length: 50 }).default('medium').notNull(),
	type: varchar({ length: 50 }).default('browser').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "tests_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "tests_project_id_projects_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "tests_created_by_user_id_user_id_fk"
		}),
]);

export const maintenanceWindows = pgTable("maintenance_windows", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	createdByUserId: uuid("created_by_user_id"),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	startTime: timestamp("start_time", { mode: 'string' }).notNull(),
	endTime: timestamp("end_time", { mode: 'string' }).notNull(),
	timezone: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "maintenance_windows_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "maintenance_windows_created_by_user_id_user_id_fk"
		}),
]);

export const member = pgTable("member", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: text().default('member').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "member_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "member_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const monitorResults = pgTable("monitor_results", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	monitorId: uuid("monitor_id").notNull(),
	checkedAt: timestamp("checked_at", { mode: 'string' }).defaultNow().notNull(),
	status: varchar({ length: 50 }).notNull(),
	responseTimeMs: integer("response_time_ms"),
	details: jsonb(),
	isUp: boolean("is_up").notNull(),
	isStatusChange: boolean("is_status_change").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitors.id],
			name: "monitor_results_monitor_id_monitors_id_fk"
		}).onDelete("cascade"),
]);

export const tags = pgTable("tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	createdByUserId: uuid("created_by_user_id"),
	name: varchar({ length: 100 }).notNull(),
	color: varchar({ length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("tags_organization_name_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "tags_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "tags_created_by_user_id_user_id_fk"
		}),
]);

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: varchar({ length: 50 }).default('email').notNull(),
	content: jsonb().notNull(),
	status: varchar({ length: 50 }).default('pending').notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "notifications_user_id_user_id_fk"
		}),
]);

export const projectMembers = pgTable("project_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	projectId: uuid("project_id").notNull(),
	role: varchar({ length: 50 }).default('member').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "project_members_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_members_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const reports = pgTable("reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	createdByUserId: uuid("created_by_user_id"),
	entityType: varchar("entity_type", { length: 50 }).notNull(),
	entityId: uuid("entity_id").notNull(),
	reportPath: varchar("report_path", { length: 255 }).notNull(),
	status: varchar({ length: 50 }).default('passed').notNull(),
	s3Url: varchar("s3_url", { length: 1024 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("reports_entity_type_id_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "reports_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [user.id],
			name: "reports_created_by_user_id_user_id_fk"
		}),
]);

export const runs = pgTable("runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	projectId: uuid("project_id"),
	status: varchar({ length: 50 }).default('running').notNull(),
	duration: varchar({ length: 100 }),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	artifactPaths: jsonb("artifact_paths"),
	logs: text(),
	errorDetails: text("error_details"),
	trigger: varchar({ length: 50 }).default('manual').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "runs_job_id_jobs_id_fk"
		}),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "runs_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: uuid("user_id").notNull(),
	activeOrganizationId: uuid("active_organization_id"),
	activeProjectId: uuid("active_project_id"),
	impersonatedBy: text("impersonated_by"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.activeOrganizationId],
			foreignColumns: [organization.id],
			name: "session_active_organization_id_organization_id_fk"
		}),
	foreignKey({
			columns: [table.activeProjectId],
			foreignColumns: [projects.id],
			name: "session_active_project_id_projects_id_fk"
		}),
	unique("session_token_unique").on(table.token),
]);

export const jobNotificationSettings = pgTable("job_notification_settings", {
	jobId: uuid("job_id").notNull(),
	notificationProviderId: uuid("notification_provider_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "job_notification_settings_job_id_jobs_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.notificationProviderId],
			foreignColumns: [notificationProviders.id],
			name: "job_notification_settings_notification_provider_id_notification"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.jobId, table.notificationProviderId], name: "job_notification_settings_job_id_notification_provider_id_pk"}),
]);

export const jobTests = pgTable("job_tests", {
	jobId: uuid("job_id").notNull(),
	testCaseId: uuid("test_case_id").notNull(),
	orderPosition: integer("order_position"),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "job_tests_job_id_jobs_id_fk"
		}),
	foreignKey({
			columns: [table.testCaseId],
			foreignColumns: [tests.id],
			name: "job_tests_test_case_id_tests_id_fk"
		}),
	primaryKey({ columns: [table.jobId, table.testCaseId], name: "job_test_cases_pk"}),
]);

export const monitorMaintenanceWindows = pgTable("monitor_maintenance_windows", {
	maintenanceWindowId: uuid("maintenance_window_id").notNull(),
	monitorId: uuid("monitor_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.maintenanceWindowId],
			foreignColumns: [maintenanceWindows.id],
			name: "monitor_maintenance_windows_maintenance_window_id_maintenance_w"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitors.id],
			name: "monitor_maintenance_windows_monitor_id_monitors_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.maintenanceWindowId, table.monitorId], name: "monitor_maintenance_windows_maintenance_window_id_monitor_id_pk"}),
]);

export const monitorNotificationSettings = pgTable("monitor_notification_settings", {
	monitorId: uuid("monitor_id").notNull(),
	notificationProviderId: uuid("notification_provider_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitors.id],
			name: "monitor_notification_settings_monitor_id_monitors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.notificationProviderId],
			foreignColumns: [notificationProviders.id],
			name: "monitor_notification_settings_notification_provider_id_notifica"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.monitorId, table.notificationProviderId], name: "monitor_notification_settings_pk"}),
]);

export const monitorTags = pgTable("monitor_tags", {
	monitorId: uuid("monitor_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.monitorId],
			foreignColumns: [monitors.id],
			name: "monitor_tags_monitor_id_monitors_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "monitor_tags_tag_id_tags_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.monitorId, table.tagId], name: "monitor_tags_monitor_id_tag_id_pk"}),
]);

export const testTags = pgTable("test_tags", {
	testId: uuid("test_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.testId],
			foreignColumns: [tests.id],
			name: "test_tags_test_id_tests_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "test_tags_tag_id_tags_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.testId, table.tagId], name: "test_tags_test_id_tag_id_pk"}),
]);
