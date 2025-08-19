/**
 * Session Security Utilities
 * Implements secure session token handling and validation
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Hash a session token for secure storage
 * Uses SHA-256 with salt for secure hashing
 */
export function hashSessionToken(token: string, salt?: string): { hash: string; salt: string } {
  const tokenSalt = salt || randomBytes(32).toString('hex');
  const hash = createHash('sha256')
    .update(token + tokenSalt)
    .digest('hex');
  
  return { hash, salt: tokenSalt };
}

/**
 * Verify a session token against its hash
 */
export function verifySessionToken(token: string, hash: string, salt: string): boolean {
  const { hash: computedHash } = hashSessionToken(token, salt);
  return computedHash === hash;
}

/**
 * Generate a cryptographically secure session token
 */
export function generateSecureToken(): string {
  return randomBytes(64).toString('hex');
}

/**
 * Session validation context
 */
export interface SessionValidationContext {
  tokenHash: string;
  salt: string;
  userId: string;
  createdAt: Date;
  lastUsedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Validate session token and context
 */
export function validateSessionContext(
  token: string,
  context: SessionValidationContext,
  currentIp?: string
): {
  valid: boolean;
  reason?: string;
} {
  // Verify token hash
  if (!verifySessionToken(token, context.tokenHash, context.salt)) {
    return { valid: false, reason: 'Invalid token hash' };
  }

  // Check session age (24 hour max)
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const sessionAge = Date.now() - context.createdAt.getTime();
  if (sessionAge > maxAge) {
    return { valid: false, reason: 'Session expired' };
  }

  // Check last used (2 hour timeout)
  const timeoutPeriod = 2 * 60 * 60 * 1000; // 2 hours
  const timeSinceLastUse = Date.now() - context.lastUsedAt.getTime();
  if (timeSinceLastUse > timeoutPeriod) {
    return { valid: false, reason: 'Session timed out' };
  }

  // Optional: Check IP address consistency (can be disabled for mobile users)
  if (context.ipAddress && currentIp && context.ipAddress !== currentIp) {
    console.warn(`Session IP change detected: ${context.ipAddress} -> ${currentIp} for user ${context.userId}`);
    // For now, just log but don't invalidate (mobile users change IPs frequently)
  }

  return { valid: true };
}

/**
 * Rate limiting for admin operations
 */
const adminOperationCounts = new Map<string, { count: number; resetTime: number }>();

export function checkAdminRateLimit(
  userId: string,
  operation: string,
  maxOperations = 5,
  windowMs = 5 * 60 * 1000 // 5 minutes
): { allowed: boolean; resetTime?: number } {
  const key = `${userId}:${operation}`;
  const now = Date.now();
  
  const current = adminOperationCounts.get(key);
  
  if (!current || now > current.resetTime) {
    // First operation or window expired
    adminOperationCounts.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }
  
  if (current.count >= maxOperations) {
    return { allowed: false, resetTime: current.resetTime };
  }
  
  // Increment count
  current.count++;
  return { allowed: true };
}

/**
 * Clear expired rate limit entries (should be called periodically)
 */
export function cleanupRateLimitEntries(): void {
  const now = Date.now();
  for (const [key, data] of adminOperationCounts.entries()) {
    if (now > data.resetTime) {
      adminOperationCounts.delete(key);
    }
  }
}

/**
 * Enhanced session creation with security features
 */
export interface SecureSessionData {
  token: string;
  tokenHash: string;
  salt: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export function createSecureSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): SecureSessionData {
  const token = generateSecureToken();
  const { hash, salt } = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  
  return {
    token,
    tokenHash: hash,
    salt,
    userId,
    createdAt: now,
    expiresAt,
    ipAddress,
    userAgent
  };
}