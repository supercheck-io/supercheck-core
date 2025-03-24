"use server";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

/**
 * Creates a database client with cross-platform path handling
 * Ensures SQLite paths work correctly on both Windows and Mac/Linux
 */
export async function createDbClient() {
  const client = createClient({
    url: process.env.DB_FILE_NAME 
      ? process.env.DB_FILE_NAME.startsWith("file:") 
        ? process.env.DB_FILE_NAME.replace(/\\/g, '/') // Ensure forward slashes for file: protocol
        : process.env.DB_FILE_NAME // Keep as is for remote URLs
      : "file:./dev.sqlite",
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
