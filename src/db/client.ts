"use server";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "path";

/**
 * Normalizes database URL to ensure cross-platform compatibility
 * Handles file paths correctly on both Windows and Mac/Linux
 */
function getNormalizedDbUrl(): string {
  // If an environment variable is provided, use it
  if (process.env.DB_FILE_NAME) {
    // For remote URLs, keep as is
    if (!process.env.DB_FILE_NAME.startsWith("file:")) {
      return process.env.DB_FILE_NAME;
    }
    
    // For file URLs, handle the path portion correctly
    try {
      // Extract the path part from the file: URL
      const pathPart = process.env.DB_FILE_NAME.replace(/^file:/, '');
      
      // For absolute paths, just ensure forward slashes
      if (path.isAbsolute(pathPart)) {
        return `file:${pathPart.replace(/\\/g, '/')}`;
      }
      
      // For relative paths, resolve them relative to the project root
      // and convert to forward slashes for SQLite
      const resolvedPath = path.resolve(pathPart).replace(/\\/g, '/');
      return `file:${resolvedPath}`;
    } catch (error) {
      console.error("Error normalizing DB path:", error);
      // Fallback to the original value if something goes wrong
      return process.env.DB_FILE_NAME;
    }
  }
  
  // Default database path if no environment variable is set
  const defaultDbPath = path.resolve("./dev.sqlite").replace(/\\/g, '/');
  return `file:${defaultDbPath}`;
}

/**
 * Creates a database client with cross-platform path handling
 * Ensures SQLite paths work correctly on both Windows and Mac/Linux
 */
export async function createDbClient() {
  const client = createClient({
    url: getNormalizedDbUrl(),
  });

  return client;
}

/**
 * Creates a drizzle ORM instance with the database client
 */
export async function createDb() {
  const client = await createDbClient();
  return drizzle(client);
}

// Create a singleton instance
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get the database instance (singleton pattern)
 */
export async function getDb() {
  if (!_db) {
    const client = await createDbClient();
    _db = drizzle(client);
  }
  return _db;
}

// For compatibility with existing code
export { getDb as db };
