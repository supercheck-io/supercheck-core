/**
 * Audit Logging System for Security Events
 * Provides comprehensive logging for security-sensitive operations
 */

import { headers } from 'next/headers';
import { db } from '@/utils/db';
import { auditLogs, AuditDetails } from '@/db/schema/schema';

export interface AuditLogEntry {
  userId: string;
  organizationId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

/**
 * Log an audit event for security tracking
 */
export async function logAuditEvent(entry: Omit<AuditLogEntry, 'timestamp' | 'ipAddress' | 'userAgent'>): Promise<void> {
  try {
    const headersList = await headers();
    const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const auditDetails: AuditDetails = {
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: {
        success: entry.success,
        errorMessage: entry.errorMessage,
        ipAddress,
        userAgent,
        timestamp: new Date().toISOString(),
        ...entry.metadata
      }
    };

    // Store in database audit table
    await db.insert(auditLogs).values({
      userId: entry.userId,
      organizationId: entry.organizationId || null,
      action: entry.action,
      details: auditDetails
    });

    // Also log to console for immediate visibility during development
    console.log('[AUDIT]', {
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      success: entry.success,
      ipAddress: ipAddress.substring(0, 8) + '...', // Partial IP for privacy
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    // Critical: Audit logging failures should not break the application
    // but should be logged for investigation
    console.error('[AUDIT_FAILURE]', 'Failed to log audit event:', error);
  }
}

/**
 * Log impersonation events
 */
export async function logImpersonationEvent(
  adminUserId: string,
  targetUserId: string,
  action: 'start' | 'stop',
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    userId: adminUserId,
    action: `impersonation_${action}`,
    resource: 'user',
    resourceId: targetUserId,
    metadata: {
      targetUserId,
      ...metadata
    },
    success: true
  });
}

/**
 * Log admin operations
 */
export async function logAdminOperation(
  userId: string,
  operation: string,
  resource?: string,
  resourceId?: string,
  success: boolean = true,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    userId,
    action: `admin_${operation}`,
    resource,
    resourceId,
    metadata,
    success,
    errorMessage
  });
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  userId: string,
  action: 'login' | 'logout' | 'login_failure' | 'session_expired',
  success: boolean = true,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    userId,
    action: `auth_${action}`,
    resource: 'session',
    metadata,
    success,
    errorMessage
  });
}

/**
 * Log permission-related events
 */
export async function logPermissionEvent(
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  granted: boolean,
  requiredPermission?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    userId,
    action: `permission_${granted ? 'granted' : 'denied'}`,
    resource,
    resourceId,
    metadata: {
      originalAction: action,
      requiredPermission,
      ...metadata
    },
    success: granted
  });
}