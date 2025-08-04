import { relations } from "drizzle-orm/relations";
import { user, account, organization, monitors, projects, alertHistory, jobs, alerts, apikey, auditLogs, integrations, invitation, notificationProviders, tests, maintenanceWindows, member, monitorResults, tags, notifications, projectMembers, reports, runs, session, jobNotificationSettings, jobTests, monitorMaintenanceWindows, monitorNotificationSettings, monitorTags, testTags } from "./schema";

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	monitors: many(monitors),
	jobs: many(jobs),
	apikeys: many(apikey),
	auditLogs: many(auditLogs),
	invitations: many(invitation),
	notificationProviders: many(notificationProviders),
	tests: many(tests),
	maintenanceWindows: many(maintenanceWindows),
	members: many(member),
	tags: many(tags),
	notifications: many(notifications),
	projectMembers: many(projectMembers),
	reports: many(reports),
	sessions: many(session),
}));

export const monitorsRelations = relations(monitors, ({one, many}) => ({
	organization: one(organization, {
		fields: [monitors.organizationId],
		references: [organization.id]
	}),
	project: one(projects, {
		fields: [monitors.projectId],
		references: [projects.id]
	}),
	user: one(user, {
		fields: [monitors.createdByUserId],
		references: [user.id]
	}),
	alertHistories: many(alertHistory),
	alerts: many(alerts),
	monitorResults: many(monitorResults),
	monitorMaintenanceWindows: many(monitorMaintenanceWindows),
	monitorNotificationSettings: many(monitorNotificationSettings),
	monitorTags: many(monitorTags),
}));

export const organizationRelations = relations(organization, ({many}) => ({
	monitors: many(monitors),
	jobs: many(jobs),
	alerts: many(alerts),
	projects: many(projects),
	auditLogs: many(auditLogs),
	invitations: many(invitation),
	notificationProviders: many(notificationProviders),
	tests: many(tests),
	maintenanceWindows: many(maintenanceWindows),
	members: many(member),
	tags: many(tags),
	reports: many(reports),
	sessions: many(session),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	monitors: many(monitors),
	jobs: many(jobs),
	apikeys: many(apikey),
	organization: one(organization, {
		fields: [projects.organizationId],
		references: [organization.id]
	}),
	integrations: many(integrations),
	notificationProviders: many(notificationProviders),
	tests: many(tests),
	projectMembers: many(projectMembers),
	runs: many(runs),
	sessions: many(session),
}));

export const alertHistoryRelations = relations(alertHistory, ({one}) => ({
	monitor: one(monitors, {
		fields: [alertHistory.monitorId],
		references: [monitors.id]
	}),
	job: one(jobs, {
		fields: [alertHistory.jobId],
		references: [jobs.id]
	}),
}));

export const jobsRelations = relations(jobs, ({one, many}) => ({
	alertHistories: many(alertHistory),
	organization: one(organization, {
		fields: [jobs.organizationId],
		references: [organization.id]
	}),
	project: one(projects, {
		fields: [jobs.projectId],
		references: [projects.id]
	}),
	user: one(user, {
		fields: [jobs.createdByUserId],
		references: [user.id]
	}),
	apikeys: many(apikey),
	runs: many(runs),
	jobNotificationSettings: many(jobNotificationSettings),
	jobTests: many(jobTests),
}));

export const alertsRelations = relations(alerts, ({one}) => ({
	organization: one(organization, {
		fields: [alerts.organizationId],
		references: [organization.id]
	}),
	monitor: one(monitors, {
		fields: [alerts.monitorId],
		references: [monitors.id]
	}),
}));

export const apikeyRelations = relations(apikey, ({one}) => ({
	user: one(user, {
		fields: [apikey.userId],
		references: [user.id]
	}),
	job: one(jobs, {
		fields: [apikey.jobId],
		references: [jobs.id]
	}),
	project: one(projects, {
		fields: [apikey.projectId],
		references: [projects.id]
	}),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(user, {
		fields: [auditLogs.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [auditLogs.organizationId],
		references: [organization.id]
	}),
}));

export const integrationsRelations = relations(integrations, ({one}) => ({
	project: one(projects, {
		fields: [integrations.projectId],
		references: [projects.id]
	}),
}));

export const invitationRelations = relations(invitation, ({one}) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id]
	}),
}));

export const notificationProvidersRelations = relations(notificationProviders, ({one, many}) => ({
	organization: one(organization, {
		fields: [notificationProviders.organizationId],
		references: [organization.id]
	}),
	project: one(projects, {
		fields: [notificationProviders.projectId],
		references: [projects.id]
	}),
	user: one(user, {
		fields: [notificationProviders.createdByUserId],
		references: [user.id]
	}),
	jobNotificationSettings: many(jobNotificationSettings),
	monitorNotificationSettings: many(monitorNotificationSettings),
}));

export const testsRelations = relations(tests, ({one, many}) => ({
	organization: one(organization, {
		fields: [tests.organizationId],
		references: [organization.id]
	}),
	project: one(projects, {
		fields: [tests.projectId],
		references: [projects.id]
	}),
	user: one(user, {
		fields: [tests.createdByUserId],
		references: [user.id]
	}),
	jobTests: many(jobTests),
	testTags: many(testTags),
}));

export const maintenanceWindowsRelations = relations(maintenanceWindows, ({one, many}) => ({
	organization: one(organization, {
		fields: [maintenanceWindows.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [maintenanceWindows.createdByUserId],
		references: [user.id]
	}),
	monitorMaintenanceWindows: many(monitorMaintenanceWindows),
}));

export const memberRelations = relations(member, ({one}) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id]
	}),
}));

export const monitorResultsRelations = relations(monitorResults, ({one}) => ({
	monitor: one(monitors, {
		fields: [monitorResults.monitorId],
		references: [monitors.id]
	}),
}));

export const tagsRelations = relations(tags, ({one, many}) => ({
	organization: one(organization, {
		fields: [tags.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [tags.createdByUserId],
		references: [user.id]
	}),
	monitorTags: many(monitorTags),
	testTags: many(testTags),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(user, {
		fields: [notifications.userId],
		references: [user.id]
	}),
}));

export const projectMembersRelations = relations(projectMembers, ({one}) => ({
	user: one(user, {
		fields: [projectMembers.userId],
		references: [user.id]
	}),
	project: one(projects, {
		fields: [projectMembers.projectId],
		references: [projects.id]
	}),
}));

export const reportsRelations = relations(reports, ({one}) => ({
	organization: one(organization, {
		fields: [reports.organizationId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [reports.createdByUserId],
		references: [user.id]
	}),
}));

export const runsRelations = relations(runs, ({one}) => ({
	job: one(jobs, {
		fields: [runs.jobId],
		references: [jobs.id]
	}),
	project: one(projects, {
		fields: [runs.projectId],
		references: [projects.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
	organization: one(organization, {
		fields: [session.activeOrganizationId],
		references: [organization.id]
	}),
	project: one(projects, {
		fields: [session.activeProjectId],
		references: [projects.id]
	}),
}));

export const jobNotificationSettingsRelations = relations(jobNotificationSettings, ({one}) => ({
	job: one(jobs, {
		fields: [jobNotificationSettings.jobId],
		references: [jobs.id]
	}),
	notificationProvider: one(notificationProviders, {
		fields: [jobNotificationSettings.notificationProviderId],
		references: [notificationProviders.id]
	}),
}));

export const jobTestsRelations = relations(jobTests, ({one}) => ({
	job: one(jobs, {
		fields: [jobTests.jobId],
		references: [jobs.id]
	}),
	test: one(tests, {
		fields: [jobTests.testCaseId],
		references: [tests.id]
	}),
}));

export const monitorMaintenanceWindowsRelations = relations(monitorMaintenanceWindows, ({one}) => ({
	maintenanceWindow: one(maintenanceWindows, {
		fields: [monitorMaintenanceWindows.maintenanceWindowId],
		references: [maintenanceWindows.id]
	}),
	monitor: one(monitors, {
		fields: [monitorMaintenanceWindows.monitorId],
		references: [monitors.id]
	}),
}));

export const monitorNotificationSettingsRelations = relations(monitorNotificationSettings, ({one}) => ({
	monitor: one(monitors, {
		fields: [monitorNotificationSettings.monitorId],
		references: [monitors.id]
	}),
	notificationProvider: one(notificationProviders, {
		fields: [monitorNotificationSettings.notificationProviderId],
		references: [notificationProviders.id]
	}),
}));

export const monitorTagsRelations = relations(monitorTags, ({one}) => ({
	monitor: one(monitors, {
		fields: [monitorTags.monitorId],
		references: [monitors.id]
	}),
	tag: one(tags, {
		fields: [monitorTags.tagId],
		references: [tags.id]
	}),
}));

export const testTagsRelations = relations(testTags, ({one}) => ({
	test: one(tests, {
		fields: [testTags.testId],
		references: [tests.id]
	}),
	tag: one(tags, {
		fields: [testTags.tagId],
		references: [tags.id]
	}),
}));