import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CredentialData {
  type: 'basic' | 'bearer' | 'api-key';
  username?: string;
  password?: string;
  token?: string;
  apiKey?: string;
  encrypted?: boolean;
  rotationDate?: Date;
}

export interface EncryptedCredential {
  encrypted: string;
  iv: string;
  tag: string;
  algorithm: string;
  keyId: string;
}

@Injectable()
export class CredentialSecurityService {
  private readonly logger = new Logger(CredentialSecurityService.name);
  private readonly algorithm: 'aes-256-gcm' = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits

  // 🔴 CRITICAL: Credential encryption and rotation
  
  /**
   * Generate a secure encryption key
   */
  private generateKey(): Buffer {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Get encryption key from environment or generate new one
   */
  private getEncryptionKey(keyId?: string): Buffer {
    // In production, this should come from a secure key management service
    const envKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (envKey) {
      return Buffer.from(envKey, 'hex');
    }

    // For development/testing - generate a key (NOT for production)
    this.logger.warn('Using generated encryption key - NOT suitable for production');
    return this.generateKey();
  }

  /**
   * Encrypt credential data
   */
  encryptCredential(
    credential: CredentialData,
    keyId: string = 'default'
  ): EncryptedCredential {
    try {
      const key = this.getEncryptionKey(keyId);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      const gcmCipher = cipher as crypto.CipherGCM;
      gcmCipher.setAAD(Buffer.from(keyId));
      
      const serializedCredential = JSON.stringify(credential);
      
      let encrypted = gcmCipher.update(serializedCredential, 'utf8', 'hex');
      encrypted += gcmCipher.final('hex');
      
      const tag = gcmCipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.algorithm,
        keyId,
      };
    } catch (error) {
      this.logger.error('Credential encryption failed:', error);
      throw new Error('Failed to encrypt credential');
    }
  }

  /**
   * Decrypt credential data
   */
  decryptCredential(encryptedData: EncryptedCredential): CredentialData {
    try {
      const key = this.getEncryptionKey(encryptedData.keyId);
      const decipher = crypto.createDecipheriv(
        encryptedData.algorithm,
        key,
        Buffer.from(encryptedData.iv, 'hex')
      );
      const gcmDecipher = decipher as crypto.DecipherGCM;
      
      gcmDecipher.setAAD(Buffer.from(encryptedData.keyId));
      gcmDecipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      
      let decrypted = gcmDecipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += gcmDecipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('Credential decryption failed:', error);
      throw new Error('Failed to decrypt credential');
    }
  }

  /**
   * 🔴 CRITICAL: Mask credentials in logs and debug output
   */
  maskCredentials(data: any): any {
    if (!data) return data;
    
    // Handle different data types
    if (typeof data === 'string') {
      return this.maskString(data);
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.maskCredentials(item));
    }
    
    if (typeof data === 'object') {
      const masked = { ...data };
      
      // Fields that should be masked
      const sensitiveFields = [
        'password', 'token', 'apiKey', 'api_key', 'secret', 'key',
        'authorization', 'auth', 'credential', 'credentials',
        'bearer', 'basic', 'username', 'user', 'login',
        'x-api-key', 'x-auth-token', 'cookie', 'set-cookie'
      ];
      
      for (const [key, value] of Object.entries(masked)) {
        const lowerKey = key.toLowerCase();
        
        // Mask sensitive fields
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          masked[key] = this.maskString(String(value));
        }
        // Recursively mask nested objects
        else if (typeof value === 'object') {
          masked[key] = this.maskCredentials(value);
        }
      }
      
      return masked;
    }
    
    return data;
  }

  /**
   * Mask string values (show first 2 and last 2 characters)
   */
  private maskString(value: string): string {
    if (!value || typeof value !== 'string') {
      return '***';
    }
    
    if (value.length <= 4) {
      return '***';
    }
    
    return value.substring(0, 2) + '*'.repeat(Math.max(3, value.length - 4)) + value.substring(value.length - 2);
  }

  /**
   * Check if credential needs rotation
   */
  needsRotation(credential: CredentialData, maxAgeDays: number = 90): boolean {
    if (!credential.rotationDate) {
      return true; // No rotation date means it should be rotated
    }
    
    const ageMs = Date.now() - credential.rotationDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    return ageDays > maxAgeDays;
  }

  /**
   * Generate secure API key
   */
  generateApiKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash password with salt
   */
  hashPassword(password: string): { hash: string; salt: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password: string, hash: string, salt: string): boolean {
    try {
      const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
      return hash === derivedHash;
    } catch (error) {
      this.logger.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Validate credential strength
   */
  validateCredentialStrength(credential: CredentialData): {
    valid: boolean;
    warnings: string[];
    score: number; // 0-100
  } {
    const warnings: string[] = [];
    let score = 100;

    if (credential.type === 'basic') {
      if (!credential.username || credential.username.length < 3) {
        warnings.push('Username should be at least 3 characters');
        score -= 20;
      }
      
      if (!credential.password) {
        warnings.push('Password is required');
        score -= 50;
      } else {
        // Password strength checks
        if (credential.password.length < 8) {
          warnings.push('Password should be at least 8 characters');
          score -= 20;
        }
        if (!/[A-Z]/.test(credential.password)) {
          warnings.push('Password should contain uppercase letters');
          score -= 10;
        }
        if (!/[a-z]/.test(credential.password)) {
          warnings.push('Password should contain lowercase letters');
          score -= 10;
        }
        if (!/[0-9]/.test(credential.password)) {
          warnings.push('Password should contain numbers');
          score -= 10;
        }
        if (!/[^A-Za-z0-9]/.test(credential.password)) {
          warnings.push('Password should contain special characters');
          score -= 5;
        }
      }
    } else if (credential.type === 'bearer') {
      if (!credential.token) {
        warnings.push('Token is required');
        score -= 50;
      } else if (credential.token.length < 20) {
        warnings.push('Token appears to be too short');
        score -= 20;
      }
    }

    // Check for rotation date
    if (this.needsRotation(credential)) {
      warnings.push('Credential may need rotation');
      score -= 15;
    }

    return {
      valid: score >= 50,
      warnings,
      score: Math.max(0, score),
    };
  }

  /**
   * Sanitize credential for safe storage
   */
  sanitizeForStorage(credential: CredentialData): CredentialData {
    const sanitized = { ...credential };
    
    // Remove any potential XSS or injection attempts
    if (sanitized.username) {
      sanitized.username = this.sanitizeString(sanitized.username);
    }
    
    // Don't sanitize password/token content as it might be intentional
    // but ensure it's properly encrypted
    sanitized.encrypted = true;
    sanitized.rotationDate = new Date();
    
    return sanitized;
  }

  /**
   * Sanitize string input
   */
  private sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>\"'&]/g, '') // Remove potential XSS characters
      .substring(0, 255); // Limit length
  }

  /**
   * Create audit log entry for credential operations
   */
  createAuditLog(
    operation: 'create' | 'update' | 'delete' | 'access' | 'rotate',
    credentialId: string,
    userId?: string,
    metadata?: any
  ): any {
    return {
      timestamp: new Date().toISOString(),
      operation,
      credentialId,
      userId,
      metadata: this.maskCredentials(metadata),
      ip: metadata?.ip || 'unknown',
      userAgent: metadata?.userAgent || 'unknown',
    };
  }
}