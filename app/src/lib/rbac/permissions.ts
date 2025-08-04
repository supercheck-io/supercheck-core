/**
 * RBAC (Role-Based Access Control) Permissions System
 * 
 * This module defines the permission system for the Supertest platform with three levels:
 * 1. System Level - Global admin permissions
 * 2. Organization Level - Organization-wide permissions
 * 3. Project Level - Project-specific permissions
 */

// System-level roles (global)
export enum SystemRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user'
}

// Organization-level roles
export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin', 
  MEMBER = 'member',
  VIEWER = 'viewer'
}

// Project-level roles
export enum ProjectRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer'
}

// System-level permissions
export enum SystemPermission {
  // User management
  MANAGE_ALL_USERS = 'system:manage_all_users',
  VIEW_ALL_USERS = 'system:view_all_users',
  IMPERSONATE_USERS = 'system:impersonate_users',
  
  // Organization management
  MANAGE_ALL_ORGANIZATIONS = 'system:manage_all_organizations',
  VIEW_ALL_ORGANIZATIONS = 'system:view_all_organizations',
  DELETE_ORGANIZATIONS = 'system:delete_organizations',
  
  // System administration
  VIEW_SYSTEM_STATS = 'system:view_system_stats',
  MANAGE_SYSTEM_SETTINGS = 'system:manage_system_settings',
  VIEW_AUDIT_LOGS = 'system:view_audit_logs'
}

// Organization-level permissions
export enum OrgPermission {
  // Organization management
  MANAGE_ORGANIZATION = 'org:manage_organization',
  VIEW_ORGANIZATION = 'org:view_organization',
  DELETE_ORGANIZATION = 'org:delete_organization',
  
  // Member management
  INVITE_MEMBERS = 'org:invite_members',
  MANAGE_MEMBERS = 'org:manage_members',
  REMOVE_MEMBERS = 'org:remove_members',
  VIEW_MEMBERS = 'org:view_members',
  
  // Project management
  CREATE_PROJECTS = 'org:create_projects',
  MANAGE_ALL_PROJECTS = 'org:manage_all_projects',
  VIEW_ALL_PROJECTS = 'org:view_all_projects',
  DELETE_PROJECTS = 'org:delete_projects',
  
  // Tag management
  CREATE_TAGS = 'org:create_tags',
  VIEW_TAGS = 'org:view_tags',
  MANAGE_TAGS = 'org:manage_tags',
  
  // Organization settings
  MANAGE_ORG_SETTINGS = 'org:manage_settings',
  VIEW_ORG_BILLING = 'org:view_billing',
  MANAGE_ORG_BILLING = 'org:manage_billing'
}

// Project-level permissions
export enum ProjectPermission {
  // Project management
  MANAGE_PROJECT = 'project:manage_project',
  VIEW_PROJECT = 'project:view_project',
  DELETE_PROJECT = 'project:delete_project',
  
  // Test management
  CREATE_TESTS = 'project:create_tests',
  EDIT_TESTS = 'project:edit_tests',
  DELETE_TESTS = 'project:delete_tests',
  VIEW_TESTS = 'project:view_tests',
  RUN_TESTS = 'project:run_tests',
  
  // Job management
  CREATE_JOBS = 'project:create_jobs',
  EDIT_JOBS = 'project:edit_jobs',
  DELETE_JOBS = 'project:delete_jobs',
  VIEW_JOBS = 'project:view_jobs',
  TRIGGER_JOBS = 'project:trigger_jobs',
  
  // Monitor management
  CREATE_MONITORS = 'project:create_monitors',
  EDIT_MONITORS = 'project:edit_monitors',
  DELETE_MONITORS = 'project:delete_monitors',
  VIEW_MONITORS = 'project:view_monitors',
  
  // Results & Reports
  VIEW_TEST_RESULTS = 'project:view_test_results',
  VIEW_JOB_RESULTS = 'project:view_job_results',
  VIEW_MONITOR_RESULTS = 'project:view_monitor_results',
  EXPORT_RESULTS = 'project:export_results',
  
  // API Keys
  CREATE_API_KEYS = 'project:create_api_keys',
  MANAGE_API_KEYS = 'project:manage_api_keys',
  VIEW_API_KEYS = 'project:view_api_keys',
  
  // Notifications
  CREATE_NOTIFICATIONS = 'project:create_notifications',
  MANAGE_NOTIFICATIONS = 'project:manage_notifications',
  VIEW_NOTIFICATIONS = 'project:view_notifications',
  
  // Project members
  INVITE_PROJECT_MEMBERS = 'project:invite_members',
  MANAGE_PROJECT_MEMBERS = 'project:manage_members',
  VIEW_PROJECT_MEMBERS = 'project:view_members',
  
  // Dashboard and alerts
  VIEW_DASHBOARD = 'project:view_dashboard',
  VIEW_ALERTS = 'project:view_alerts',
  VIEW_RUNS = 'project:view_runs',
  MANAGE_MONITORS = 'project:manage_monitors'
}

// Permission mappings for each role level

// System role permissions
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, SystemPermission[]> = {
  [SystemRole.SUPER_ADMIN]: [
    SystemPermission.MANAGE_ALL_USERS,
    SystemPermission.VIEW_ALL_USERS,
    SystemPermission.IMPERSONATE_USERS,
    SystemPermission.MANAGE_ALL_ORGANIZATIONS,
    SystemPermission.VIEW_ALL_ORGANIZATIONS,
    SystemPermission.DELETE_ORGANIZATIONS,
    SystemPermission.VIEW_SYSTEM_STATS,
    SystemPermission.MANAGE_SYSTEM_SETTINGS,
    SystemPermission.VIEW_AUDIT_LOGS
  ],
  [SystemRole.ADMIN]: [
    SystemPermission.VIEW_ALL_USERS,
    SystemPermission.VIEW_ALL_ORGANIZATIONS,
    SystemPermission.VIEW_SYSTEM_STATS
  ],
  [SystemRole.USER]: []
};

// Organization role permissions
export const ORG_ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  [OrgRole.OWNER]: [
    OrgPermission.MANAGE_ORGANIZATION,
    OrgPermission.VIEW_ORGANIZATION,
    OrgPermission.DELETE_ORGANIZATION,
    OrgPermission.INVITE_MEMBERS,
    OrgPermission.MANAGE_MEMBERS,
    OrgPermission.REMOVE_MEMBERS,
    OrgPermission.VIEW_MEMBERS,
    OrgPermission.CREATE_PROJECTS,
    OrgPermission.MANAGE_ALL_PROJECTS,
    OrgPermission.VIEW_ALL_PROJECTS,
    OrgPermission.DELETE_PROJECTS,
    OrgPermission.CREATE_TAGS,
    OrgPermission.VIEW_TAGS,
    OrgPermission.MANAGE_TAGS,
    OrgPermission.MANAGE_ORG_SETTINGS,
    OrgPermission.VIEW_ORG_BILLING,
    OrgPermission.MANAGE_ORG_BILLING
  ],
  [OrgRole.ADMIN]: [
    OrgPermission.VIEW_ORGANIZATION,
    OrgPermission.INVITE_MEMBERS,
    OrgPermission.MANAGE_MEMBERS,
    OrgPermission.VIEW_MEMBERS,
    OrgPermission.CREATE_PROJECTS,
    OrgPermission.MANAGE_ALL_PROJECTS,
    OrgPermission.VIEW_ALL_PROJECTS,
    OrgPermission.CREATE_TAGS,
    OrgPermission.VIEW_TAGS,
    OrgPermission.MANAGE_TAGS,
    OrgPermission.MANAGE_ORG_SETTINGS,
    OrgPermission.VIEW_ORG_BILLING
  ],
  [OrgRole.MEMBER]: [
    OrgPermission.VIEW_ORGANIZATION,
    OrgPermission.VIEW_MEMBERS,
    OrgPermission.CREATE_PROJECTS,
    OrgPermission.VIEW_ALL_PROJECTS,
    OrgPermission.CREATE_TAGS,
    OrgPermission.VIEW_TAGS
  ],
  [OrgRole.VIEWER]: [
    OrgPermission.VIEW_ORGANIZATION,
    OrgPermission.VIEW_MEMBERS,
    OrgPermission.VIEW_ALL_PROJECTS,
    OrgPermission.VIEW_TAGS
  ]
};

// Project role permissions
export const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, ProjectPermission[]> = {
  [ProjectRole.OWNER]: [
    ProjectPermission.MANAGE_PROJECT,
    ProjectPermission.VIEW_PROJECT,
    ProjectPermission.DELETE_PROJECT,
    ProjectPermission.CREATE_TESTS,
    ProjectPermission.EDIT_TESTS,
    ProjectPermission.DELETE_TESTS,
    ProjectPermission.VIEW_TESTS,
    ProjectPermission.RUN_TESTS,
    ProjectPermission.CREATE_JOBS,
    ProjectPermission.EDIT_JOBS,
    ProjectPermission.DELETE_JOBS,
    ProjectPermission.VIEW_JOBS,
    ProjectPermission.TRIGGER_JOBS,
    ProjectPermission.CREATE_MONITORS,
    ProjectPermission.EDIT_MONITORS,
    ProjectPermission.DELETE_MONITORS,
    ProjectPermission.VIEW_MONITORS,
    ProjectPermission.VIEW_TEST_RESULTS,
    ProjectPermission.VIEW_JOB_RESULTS,
    ProjectPermission.VIEW_MONITOR_RESULTS,
    ProjectPermission.EXPORT_RESULTS,
    ProjectPermission.CREATE_API_KEYS,
    ProjectPermission.MANAGE_API_KEYS,
    ProjectPermission.VIEW_API_KEYS,
    ProjectPermission.CREATE_NOTIFICATIONS,
    ProjectPermission.MANAGE_NOTIFICATIONS,
    ProjectPermission.VIEW_NOTIFICATIONS,
    ProjectPermission.INVITE_PROJECT_MEMBERS,
    ProjectPermission.MANAGE_PROJECT_MEMBERS,
    ProjectPermission.VIEW_PROJECT_MEMBERS,
    ProjectPermission.VIEW_DASHBOARD,
    ProjectPermission.VIEW_ALERTS,
    ProjectPermission.VIEW_RUNS,
    ProjectPermission.MANAGE_MONITORS
  ],
  [ProjectRole.ADMIN]: [
    ProjectPermission.VIEW_PROJECT,
    ProjectPermission.CREATE_TESTS,
    ProjectPermission.EDIT_TESTS,
    ProjectPermission.DELETE_TESTS,
    ProjectPermission.VIEW_TESTS,
    ProjectPermission.RUN_TESTS,
    ProjectPermission.CREATE_JOBS,
    ProjectPermission.EDIT_JOBS,
    ProjectPermission.DELETE_JOBS,
    ProjectPermission.VIEW_JOBS,
    ProjectPermission.TRIGGER_JOBS,
    ProjectPermission.CREATE_MONITORS,
    ProjectPermission.EDIT_MONITORS,
    ProjectPermission.DELETE_MONITORS,
    ProjectPermission.VIEW_MONITORS,
    ProjectPermission.VIEW_TEST_RESULTS,
    ProjectPermission.VIEW_JOB_RESULTS,
    ProjectPermission.VIEW_MONITOR_RESULTS,
    ProjectPermission.EXPORT_RESULTS,
    ProjectPermission.CREATE_API_KEYS,
    ProjectPermission.MANAGE_API_KEYS,
    ProjectPermission.VIEW_API_KEYS,
    ProjectPermission.CREATE_NOTIFICATIONS,
    ProjectPermission.MANAGE_NOTIFICATIONS,
    ProjectPermission.VIEW_NOTIFICATIONS,
    ProjectPermission.INVITE_PROJECT_MEMBERS,
    ProjectPermission.VIEW_PROJECT_MEMBERS,
    ProjectPermission.VIEW_DASHBOARD,
    ProjectPermission.VIEW_ALERTS,
    ProjectPermission.VIEW_RUNS,
    ProjectPermission.MANAGE_MONITORS
  ],
  [ProjectRole.EDITOR]: [
    ProjectPermission.VIEW_PROJECT,
    ProjectPermission.CREATE_TESTS,
    ProjectPermission.EDIT_TESTS,
    ProjectPermission.VIEW_TESTS,
    ProjectPermission.RUN_TESTS,
    ProjectPermission.CREATE_JOBS,
    ProjectPermission.EDIT_JOBS,
    ProjectPermission.VIEW_JOBS,
    ProjectPermission.TRIGGER_JOBS,
    ProjectPermission.CREATE_MONITORS,
    ProjectPermission.EDIT_MONITORS,
    ProjectPermission.VIEW_MONITORS,
    ProjectPermission.VIEW_TEST_RESULTS,
    ProjectPermission.VIEW_JOB_RESULTS,
    ProjectPermission.VIEW_MONITOR_RESULTS,
    ProjectPermission.VIEW_NOTIFICATIONS,
    ProjectPermission.VIEW_PROJECT_MEMBERS,
    ProjectPermission.VIEW_DASHBOARD,
    ProjectPermission.VIEW_ALERTS,
    ProjectPermission.VIEW_RUNS
  ],
  [ProjectRole.VIEWER]: [
    ProjectPermission.VIEW_PROJECT,
    ProjectPermission.VIEW_TESTS,
    ProjectPermission.VIEW_JOBS,
    ProjectPermission.VIEW_MONITORS,
    ProjectPermission.VIEW_TEST_RESULTS,
    ProjectPermission.VIEW_JOB_RESULTS,
    ProjectPermission.VIEW_MONITOR_RESULTS,
    ProjectPermission.VIEW_NOTIFICATIONS,
    ProjectPermission.VIEW_PROJECT_MEMBERS,
    ProjectPermission.VIEW_DASHBOARD,
    ProjectPermission.VIEW_ALERTS,
    ProjectPermission.VIEW_RUNS
    // NOTE: VIEWER role does NOT have RUN_TESTS or TRIGGER_JOBS permission
    // They can only view tests, jobs, and results but cannot execute them
  ]
};

// Helper types for permission checking
export type Permission = SystemPermission | OrgPermission | ProjectPermission;
export type Role = SystemRole | OrgRole | ProjectRole;

// Context types for permission checking
export interface SystemContext {
  type: 'system';
  userId: string;
  systemRole: SystemRole;
}

export interface OrgContext {
  type: 'organization';
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
  systemRole?: SystemRole;
}

export interface ProjectContext {
  type: 'project';
  userId: string;
  organizationId: string;
  projectId: string;
  projectRole: ProjectRole;
  orgRole?: OrgRole;
  systemRole?: SystemRole;
}

export type PermissionContext = SystemContext | OrgContext | ProjectContext;