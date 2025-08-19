/**
 * Multi-Factor Authentication (MFA) for Admin Operations
 * Implements TOTP (Time-based One-Time Password) for enhanced security
 */

import { createHash, randomBytes } from 'crypto';

declare const Buffer: {
  from(data: string, encoding: string): { toString(encoding: string): string };
};

/**
 * MFA Token validity window (in 30-second intervals)
 */
const MFA_TIME_WINDOW = 30000; // 30 seconds
const MFA_TOLERANCE = 1; // Allow 1 window before/after current

/**
 * Generate MFA secret for a user
 */
export function generateMFASecret(): string {
  return randomBytes(20).toString('base32');
}

/**
 * Generate TOTP token for current time
 */
export function generateTOTPToken(secret: string, time?: number): string {
  const currentTime = time || Math.floor(Date.now() / MFA_TIME_WINDOW);
  const timeHex = currentTime.toString(16).padStart(16, '0');
  
  const hmac = createHash('sha1');
  // Convert base32 secret to binary string
  const secretBinary = Buffer.from(secret, 'base32').toString('binary');
  // Convert hex time to binary string
  const timeBinary = Buffer.from(timeHex, 'hex').toString('binary');
  hmac.update(secretBinary);
  hmac.update(timeBinary);
  
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  
  const code = ((hash[offset] & 0x7f) << 24) |
               ((hash[offset + 1] & 0xff) << 16) |
               ((hash[offset + 2] & 0xff) << 8) |
               (hash[offset + 3] & 0xff);
  
  return (code % 1000000).toString().padStart(6, '0');
}

/**
 * Verify TOTP token
 */
export function verifyTOTPToken(token: string, secret: string): boolean {
  const currentTime = Math.floor(Date.now() / MFA_TIME_WINDOW);
  
  // Check current time window and tolerance windows
  for (let i = -MFA_TOLERANCE; i <= MFA_TOLERANCE; i++) {
    const timeToCheck = currentTime + i;
    const expectedToken = generateTOTPToken(secret, timeToCheck);
    
    if (token === expectedToken) {
      return true;
    }
  }
  
  return false;
}

/**
 * MFA Session tracking (in-memory for simplicity)
 * In production, this should be stored in Redis or database
 */
const mfaSessions = new Map<string, { userId: string; expiresAt: number; operations: string[] }>();

/**
 * Create MFA session for admin operations
 */
export function createMFASession(userId: string, operations: string[] = ['*']): string {
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes
  
  mfaSessions.set(sessionId, {
    userId,
    expiresAt,
    operations
  });
  
  return sessionId;
}

/**
 * Verify MFA session for operation
 */
export function verifyMFASession(sessionId: string, userId: string, operation: string): boolean {
  const session = mfaSessions.get(sessionId);
  
  if (!session) {
    return false;
  }
  
  if (Date.now() > session.expiresAt) {
    mfaSessions.delete(sessionId);
    return false;
  }
  
  if (session.userId !== userId) {
    return false;
  }
  
  // Check if operation is allowed
  if (!session.operations.includes('*') && !session.operations.includes(operation)) {
    return false;
  }
  
  return true;
}

/**
 * Clean up expired MFA sessions
 */
export function cleanupExpiredMFASessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of mfaSessions.entries()) {
    if (now > session.expiresAt) {
      mfaSessions.delete(sessionId);
    }
  }
}

/**
 * Get user MFA secret (mock implementation - in production, store securely)
 */
export async function getUserMFASecret(userId: string): Promise<string | null> {
  try {
    // In production, this should be stored in a secure vault or encrypted database field
    // For now, we'll use a mock implementation that generates a consistent secret per user
    const mockSecret = createHash('sha256')
      .update(`mfa_secret_${userId}`)
      .digest('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 32);
    
    return mockSecret;
  } catch (error) {
    console.error('Error getting MFA secret:', error);
    return null;
  }
}

/**
 * Enhanced admin requirement with MFA
 */
export async function requireAdminWithMFA(
  userId: string,
  operation: string,
  mfaToken?: string,
  mfaSessionId?: string
): Promise<{ 
  success: boolean; 
  error?: string; 
  mfaRequired?: boolean;
  mfaSessionId?: string;
}> {
  try {
    // First, check if user has valid MFA session
    if (mfaSessionId && verifyMFASession(mfaSessionId, userId, operation)) {
      return { success: true, mfaSessionId };
    }
    
    // If no valid MFA session, require MFA token
    if (!mfaToken) {
      return { 
        success: false, 
        mfaRequired: true,
        error: 'MFA token required for admin operation'
      };
    }
    
    // Verify MFA token
    const mfaSecret = await getUserMFASecret(userId);
    if (!mfaSecret) {
      return { 
        success: false, 
        error: 'MFA not configured for this user'
      };
    }
    
    if (!verifyTOTPToken(mfaToken, mfaSecret)) {
      return { 
        success: false, 
        error: 'Invalid MFA token'
      };
    }
    
    // Create new MFA session
    const newMfaSessionId = createMFASession(userId, [operation]);
    
    return { 
      success: true, 
      mfaSessionId: newMfaSessionId
    };
    
  } catch (error) {
    console.error('MFA verification error:', error);
    return { 
      success: false, 
      error: 'MFA verification failed'
    };
  }
}

/**
 * Generate QR code data for MFA setup
 */
export function generateMFAQRCodeData(
  userId: string, 
  secret: string, 
  serviceName = 'Supercheck',
  userEmail?: string
): string {
  const label = encodeURIComponent(`${serviceName}:${userEmail || userId}`);
  const issuer = encodeURIComponent(serviceName);
  
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}