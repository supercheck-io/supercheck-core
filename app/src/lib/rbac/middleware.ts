/**
 * Better Auth RBAC Middleware for permission checking and enforcement
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { headers } from "next/headers";
import { db } from "@/utils/db";
import { member, projectMembers, user } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import {
  Role,
  hasPermission as checkPermission,
  PermissionContext,
  statement,
} from "./permissions";
import { normalizeRole } from "./role-normalizer";
import { isSuperAdmin, getUserHighestRole } from "./super-admin";

/**
 * Check if a user has a specific permission using Better Auth system
 */
export async function hasPermission(
  resource: keyof typeof statement,
  action: string,
  context?: Partial<PermissionContext>
): Promise<boolean> {
  try {
    // Get current session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return false;
    }

    // Use Better Auth's hasPermission API for organization and admin permissions
    if (["organization", "member", "invitation"].includes(resource)) {
      const result = await auth.api.hasPermission({
        headers: await headers(),
        body: {
          permissions: {
            [resource]: [action],
          },
        },
      });
      return result.success;
    }

    // For custom resources (project, test, job, etc.), use our custom logic
    const userRole = await getUserRole(
      session.user.id,
      context?.organizationId
    );
    const assignedProjects =
      context?.assignedProjectIds ||
      (await getUserAssignedProjects(session.user.id));

    const permissionContext: PermissionContext = {
      userId: session.user.id,
      role: userRole,
      organizationId: context?.organizationId,
      projectId: context?.projectId,
      assignedProjectIds: assignedProjects,
      resourceCreatorId: context?.resourceCreatorId,
    };

    return checkPermission(permissionContext, resource, action);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Require a specific permission - throws error if not authorized
 */
export async function requirePermission(
  resource: keyof typeof statement,
  action: string,
  context?: Partial<PermissionContext>
): Promise<void> {
  const hasAccess = await hasPermission(resource, action, context);

  if (!hasAccess) {
    throw new Error(`Access denied: Missing permission ${resource}:${action}`);
  }
}

/**
 * Require permissions for multiple resources - throws error if not authorized
 * This replaces requireBetterAuthPermission for consistency
 */
export async function requirePermissions(
  permissions: Record<string, string[]>,
  context?: { organizationId?: string; projectId?: string }
): Promise<{ userId: string; user: SessionUser }> {
  // Check authentication first
  const authResult = await requireAuth();

  try {
    // Use Better Auth's permission API for supported resources
    for (const [resource, actions] of Object.entries(permissions)) {
      if (
        ["organization", "member", "invitation", "user", "session"].includes(
          resource
        )
      ) {
        const result = await auth.api.hasPermission({
          headers: await headers(),
          body: {
            permissions: {
              [resource]: actions,
            },
          },
        });

        if (!result.success) {
          throw new Error(`Access denied: Missing ${resource} permissions`);
        }
      } else {
        // For custom resources, check individually
        for (const action of actions) {
          const hasAccess = await hasPermission(
            resource as keyof typeof statement,
            action,
            context
          );
          if (!hasAccess) {
            throw new Error(
              `Access denied: Missing ${resource}:${action} permission`
            );
          }
        }
      }
    }

    return authResult;
  } catch (error) {
    throw new Error(
      `Permission check failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get user's role (prioritizes organization membership role)
 */
export async function getUserRole(
  userId: string,
  organizationId?: string
): Promise<Role> {
  // Check if user is SUPER_ADMIN using secure method
  const isSA = await isSuperAdmin(userId);
  if (isSA) {
    return Role.SUPER_ADMIN;
  }

  // If organization context is provided, get organization role
  if (organizationId) {
    const orgRole = await getUserOrgRole(userId, organizationId);
    if (orgRole) return orgRole;
  }

  // Default to viewer role
  return Role.PROJECT_VIEWER;
}

/**
 * Get user's organization role from member table
 */
export async function getUserOrgRole(
  userId: string,
  organizationId: string
): Promise<Role | null> {
  const memberRecord = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId))
    )
    .limit(1);

  if (memberRecord.length === 0) {
    return null;
  }

  const role = memberRecord[0].role;

  // Use the comprehensive role normalizer
  return normalizeRole(role);
}

/**
 * Get user's assigned project IDs (for PROJECT_EDITOR role)
 */
export async function getUserAssignedProjects(
  userId: string
): Promise<string[]> {
  const projectAssignments = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));

  return projectAssignments.map((p) => p.projectId);
}

/**
 * User session type for authentication
 */
interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
}

/**
 * Middleware to check authentication
 */
export async function requireAuth(): Promise<{
  userId: string;
  user: SessionUser;
}> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Authentication required");
  }

  return {
    userId: session.user.id,
    user: session.user,
  };
}

/**
 * Better Auth compatible permission checking for API routes
 */
export async function requireBetterAuthPermission(
  permissions: Record<string, string[]>,
  context?: { organizationId?: string; projectId?: string }
): Promise<{ userId: string; user: SessionUser }> {
  // Check authentication first
  const authResult = await requireAuth();

  try {
    // Use Better Auth's permission API for supported resources
    for (const [resource, actions] of Object.entries(permissions)) {
      if (
        ["organization", "member", "invitation", "user", "session"].includes(
          resource
        )
      ) {
        const result = await auth.api.hasPermission({
          headers: await headers(),
          body: {
            permissions: {
              [resource]: actions,
            },
          },
        });

        if (!result.success) {
          throw new Error(`Access denied: Missing ${resource} permissions`);
        }
      } else {
        // For custom resources, check individually
        for (const action of actions) {
          const hasAccess = await hasPermission(
            resource as keyof typeof statement,
            action,
            context
          );
          if (!hasAccess) {
            throw new Error(
              `Access denied: Missing ${resource}:${action} permission`
            );
          }
        }
      }
    }

    return authResult;
  } catch (error) {
    throw new Error(
      `Permission check failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * API middleware wrapper for permission checking with Better Auth
 */
export function withBetterAuthPermission<T = Record<string, unknown>>(
  handler: (
    req: NextRequest,
    context: T,
    auth: { userId: string; user: SessionUser }
  ) => Promise<NextResponse>,
  permissions: Record<string, string[]>
) {
  return async (req: NextRequest, routeContext?: T): Promise<NextResponse> => {
    try {
      // Check authentication and permissions
      const authResult = await requirePermissions(permissions);

      // Call the actual handler with auth context
      return handler(req, routeContext!, authResult);
    } catch (error) {
      console.error("Permission middleware error:", error);

      if (error instanceof Error) {
        if (error.message === "Authentication required") {
          return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
          );
        }

        if (error.message.includes("Access denied")) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
      }

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

/**
 * Helper to check if user has administrative privileges using Better Auth
 */
export async function isAdmin(organizationId?: string): Promise<boolean> {
  try {
    if (organizationId) {
      // Check organization admin permissions
      const result = await auth.api.hasPermission({
        headers: await headers(),
        body: {
          permissions: {
            organization: ["update"],
            member: ["create", "update", "delete"],
          },
        },
      });
      return result.success;
    }

    // Check system admin permissions
    return await hasPermission("system", "manage_users");
  } catch {
    return false;
  }
}

/**
 * Helper to check if user can edit a specific project
 */
export async function canEditProject(
  organizationId: string,
  projectId: string
): Promise<boolean> {
  return hasPermission("test", "update", { organizationId, projectId });
}

/**
 * Helper to check if user can view a specific project
 */
export async function canViewProject(
  organizationId: string,
  projectId: string
): Promise<boolean> {
  return hasPermission("project", "view", { organizationId, projectId });
}

/**
 * Check if user can perform admin operations (uses Better Auth admin plugin)
 */
export async function canPerformAdminOperation(
  operation:
    | "manage_users"
    | "view_users"
    | "impersonate_users"
    | "manage_organizations"
): Promise<boolean> {
  try {
    const result = await auth.api.userHasPermission({
      body: {
        permissions: {
          system: [operation],
        },
      },
    });
    if (result.error) {
      console.error("Admin permission check failed:", result.error);
      return false;
    }
    return result.success;
  } catch (error) {
    console.error("Admin permission check failed:", error);
    return false;
  }
}

/**
 * Get user's role with unified interface
 */
export async function getUserUnifiedRole(userId: string): Promise<Role> {
  return getUserHighestRole(userId);
}

/**
 * Build permission context for checking permissions
 */
export async function buildUnifiedPermissionContext(
  userId: string,
  organizationId?: string,
  projectId?: string
): Promise<PermissionContext> {
  const role = await getUserRole(userId, organizationId);
  const assignedProjectIds =
    role === Role.PROJECT_EDITOR || role === Role.PROJECT_ADMIN
      ? await getUserAssignedProjects(userId)
      : [];

  return {
    userId,
    role,
    organizationId,
    projectId,
    assignedProjectIds,
  };
}
