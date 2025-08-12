import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // 16 bytes for CBC
const KEY_LENGTH = 32;

/**
 * Get the master key from environment variables
 */
function getMasterKey(): string {
  const masterKey = process.env.VARIABLES_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('VARIABLES_ENCRYPTION_KEY environment variable is not set');
  }
  if (masterKey.length < 32) {
    throw new Error('VARIABLES_ENCRYPTION_KEY must be at least 32 characters long');
  }
  return masterKey;
}

/**
 * Derive a project-specific key from the master key and project ID
 */
function deriveKey(masterKey: string, projectId: string): Buffer {
  const salt = crypto.createHash('sha256').update(projectId).digest();
  return crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a value for a specific project
 */
export function encryptValue(value: string, projectId: string): string {
  try {
    const masterKey = getMasterKey();
    const key = deriveKey(masterKey, projectId);
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine iv and encrypted data
    const result = iv.toString('hex') + ':' + encrypted;
    
    return Buffer.from(result).toString('base64');
  } catch (error) {
    console.error('Error encrypting value:', error);
    throw new Error('Failed to encrypt value');
  }
}

/**
 * Decrypt a value for a specific project
 */
export function decryptValue(encryptedValue: string, projectId: string): string {
  try {
    const masterKey = getMasterKey();
    const key = deriveKey(masterKey, projectId);
    
    const combined = Buffer.from(encryptedValue, 'base64').toString();
    const parts = combined.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted value format');
    }
    
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting value:', error);
    throw new Error('Failed to decrypt value');
  }
}

/**
 * Generate a secure random encryption key for environment variable
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate encryption key format
 */
export function validateEncryptionKey(key: string): boolean {
  return typeof key === 'string' && key.length >= 32;
}