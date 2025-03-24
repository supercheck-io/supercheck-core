"use server";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

/**
 * Creates a database client using the DB_FILE_NAME from environment
 */
export async function createDbClient() {
  const url = process.env.DB_FILE_NAME || "file:./src/db/supertest.db";
  return createClient({ url });
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
