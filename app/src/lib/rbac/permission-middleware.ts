/**
 * Centralized Permission Middleware
 *
 * This module provides server-side permission enforcement for all API routes
 * to prevent unauthorized access regardless of client-side permission checks.
 */

import { NextRequest, NextResponse } from "next/server";
// import { headers } from "next/headers";
// import { auth } from "@/utils/auth";
import { requireAuth, hasPermission } from "./middleware";
import { statement } from "./permissions";
import { logAuditEvent } from "@/lib/audit-logger";

/**
 * Permission definition for API routes
 */
export interface ApiPermission {
  resource: keyof typeof statement;
  actions: string[];
  context?: {
    organizationId?: string;
    projectId?: string;
    resourceCreatorId?: string;
  };
}

/**
 * Middleware to enforce permissions on API routes
 */
export function withPermissions(
  permissions: ApiPermission | ApiPermission[],
  options: {
    requireAll?: boolean; // Require all permissions if true, any if false
    auditAction?: string;
  } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const startTime = Date.now();
    let userId: string | undefined;
    let hasAccess = false;

    try {
      // First, authenticate the user
      const authResult = await requireAuth();
      userId = authResult.userId;

      // Normalize permissions to array
      const permissionArray = Array.isArray(permissions)
        ? permissions
        : [permissions];

      // Check each permission
      const permissionResults = await Promise.all(
        permissionArray.map(async (permission) => {
          const result = await hasPermission(
            permission.resource,
            permission.actions[0], // Check first action for simplicity
            permission.context
          );
          return result;
        })
      );

      // Determine access based on requireAll option
      hasAccess = options.requireAll
        ? permissionResults.every((result) => result)
        : permissionResults.some((result) => result);

      if (!hasAccess) {
        // Log failed permission check
        await logAuditEvent({
          userId,
          action: options.auditAction || "unauthorized_access_attempt",
          resource: permissionArray[0]?.resource || "unknown",
          metadata: {
            url: req.url,
            method: req.method,
            permissions: permissionArray,
            userAgent: req.headers.get("user-agent"),
            ip:
              req.headers.get("x-forwarded-for") ||
              req.headers.get("x-real-ip"),
          },
          success: false,
        });

        return NextResponse.json(
          { error: "Access denied: Insufficient permissions" },
          { status: 403 }
        );
      }

      // Log successful access
      await logAuditEvent({
        userId,
        action: options.auditAction || "api_access",
        resource: permissionArray[0]?.resource || "unknown",
        metadata: {
          url: req.url,
          method: req.method,
          duration: Date.now() - startTime,
        },
        success: true,
      });

      // Execute the handler with user context
      return await handler(req, {
        userId,
        user: authResult.user as unknown as Record<string, unknown>,
      });
    } catch (error) {
      // Log error
      if (userId) {
        await logAuditEvent({
          userId,
          action: "api_error",
          resource: "unknown",
          metadata: {
            url: req.url,
            method: req.method,
            error: error instanceof Error ? error.message : "Unknown error",
            duration: Date.now() - startTime,
          },
          success: false,
        });
      }

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
 * Middleware for organization-specific permissions
 */
export function withOrganizationPermission(
  action: string,
  options: { auditAction?: string } = {}
) {
  return withPermissions(
    {
      resource: "organization",
      actions: [action],
      context: {},
    },
    options
  );
}

/**
 * Middleware for project-specific permissions
 */
export function withProjectPermission(
  action: string,
  getProjectId: (req: NextRequest) => string | Promise<string>,
  options: { auditAction?: string } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const projectId = await getProjectId(req);

    return withPermissions(
      {
        resource: "project",
        actions: [action],
        context: { projectId },
      },
      options
    )(req, handler);
  };
}

/**
 * Middleware for test permissions
 */
export function withTestPermission(
  action: string,
  getProjectId: (req: NextRequest) => string | Promise<string>,
  options: { auditAction?: string } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const projectId = await getProjectId(req);

    return withPermissions(
      {
        resource: "test",
        actions: [action],
        context: { projectId },
      },
      options
    )(req, handler);
  };
}

/**
 * Middleware for job permissions
 */
export function withJobPermission(
  action: string,
  getProjectId: (req: NextRequest) => string | Promise<string>,
  options: { auditAction?: string } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const projectId = await getProjectId(req);

    return withPermissions(
      {
        resource: "job",
        actions: [action],
        context: { projectId },
      },
      options
    )(req, handler);
  };
}

/**
 * Middleware for monitor permissions
 */
export function withMonitorPermission(
  action: string,
  getProjectId: (req: NextRequest) => string | Promise<string>,
  options: { auditAction?: string } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const projectId = await getProjectId(req);

    return withPermissions(
      {
        resource: "monitor",
        actions: [action],
        context: { projectId },
      },
      options
    )(req, handler);
  };
}

/**
 * Middleware for variable permissions
 */
export function withVariablePermission(
  action: string,
  getProjectId: (req: NextRequest) => string | Promise<string>,
  options: { auditAction?: string } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const projectId = await getProjectId(req);

    return withPermissions(
      {
        resource: "variable",
        actions: [action],
        context: { projectId },
      },
      options
    )(req, handler);
  };
}

/**
 * Middleware for API key permissions
 */
export function withApiKeyPermission(
  action: string,
  getProjectId: (req: NextRequest) => string | Promise<string>,
  options: { auditAction?: string } = {}
) {
  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const projectId = await getProjectId(req);

    return withPermissions(
      {
        resource: "apiKey",
        actions: [action],
        context: { projectId },
      },
      options
    )(req, handler);
  };
}

/**
 * Middleware for system admin permissions
 */
export function withSystemAdminPermission(
  action: string,
  options: { auditAction?: string } = {}
) {
  return withPermissions(
    {
      resource: "system",
      actions: [action],
      context: {},
    },
    options
  );
}

/**
 * Rate limiting middleware for sensitive operations
 */
export function withRateLimit(
  maxRequests: number,
  windowMs: number,
  options: { auditAction?: string } = {}
) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async (
    req: NextRequest,
    handler: (
      req: NextRequest,
      context: { userId: string; user: Record<string, unknown> }
    ) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const clientId =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const now = Date.now();
    const clientRequests = requests.get(clientId);

    if (clientRequests) {
      if (now > clientRequests.resetTime) {
        // Reset the window
        clientRequests.count = 1;
        clientRequests.resetTime = now + windowMs;
      } else if (clientRequests.count >= maxRequests) {
        // Rate limit exceeded
        await logAuditEvent({
          userId: "anonymous",
          action: options.auditAction || "rate_limit_exceeded",
          resource: "api",
          metadata: {
            clientId,
            url: req.url,
            method: req.method,
          },
          success: false,
        });

        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429 }
        );
      } else {
        clientRequests.count++;
      }
    } else {
      requests.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      for (const [key, value] of requests.entries()) {
        if (now > value.resetTime) {
          requests.delete(key);
        }
      }
    }

    return await handler(req, {
      userId: "",
      user: {} as Record<string, unknown>,
    });
  };
}

/**
 * Helper to extract project ID from request params
 */
export function getProjectIdFromParams(params: { id: string }): string {
  return params.id;
}

/**
 * Helper to extract project ID from URL path
 */
export function getProjectIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");

  // Look for /api/projects/[projectId]/...
  const projectsIndex = pathParts.indexOf("projects");
  if (projectsIndex !== -1 && pathParts.length > projectsIndex + 1) {
    return pathParts[projectsIndex + 1];
  }

  return null;
}
