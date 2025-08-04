/**
 * Client-side permission checking utilities
 * 
 * This module provides client-side permission checking based on user roles.
 * It mirrors the server-side permission system but works with the client-side context.
 */

import { ProjectRole, ProjectPermission, PROJECT_ROLE_PERMISSIONS } from './permissions';

/**
 * Check if a user role has a specific project permission
 */
export function hasProjectPermission(userRole: string, permission: ProjectPermission): boolean {
  // Map string role to ProjectRole enum
  let role: ProjectRole;
  
  switch (userRole) {
    case 'owner':
      role = ProjectRole.OWNER;
      break;
    case 'admin':
      role = ProjectRole.ADMIN;
      break;
    case 'editor':
      role = ProjectRole.EDITOR;
      break;
    case 'viewer':
      role = ProjectRole.VIEWER;
      break;
    default:
      // Default to viewer if role is unknown
      role = ProjectRole.VIEWER;
      break;
  }
  
  const rolePermissions = PROJECT_ROLE_PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check if user can trigger jobs
 */
export function canTriggerJobs(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.TRIGGER_JOBS);
}

/**
 * Check if user can edit jobs
 */
export function canEditJobs(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.EDIT_JOBS);
}

/**
 * Check if user can delete jobs
 */
export function canDeleteJobs(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.DELETE_JOBS);
}

/**
 * Check if user can create jobs
 */
export function canCreateJobs(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.CREATE_JOBS);
}

/**
 * Check if user can run tests
 */
export function canRunTests(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.RUN_TESTS);
}

/**
 * Check if user can edit tests
 */
export function canEditTests(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.EDIT_TESTS);
}

/**
 * Check if user can delete tests
 */
export function canDeleteTests(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.DELETE_TESTS);
}

/**
 * Check if user can create tests
 */
export function canCreateTests(userRole: string): boolean {
  return hasProjectPermission(userRole, ProjectPermission.CREATE_TESTS);
}