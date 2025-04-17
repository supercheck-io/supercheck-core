"use server";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Creates a database client using PostgreSQL
 */
export async function createDbClient() {
  const connectionString = process.env.DATABASE_URL || 
    `postgres://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || "postgres"}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "supertest"}`;
  
  // For query building
  return postgres(connectionString, { ssl: false });
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
