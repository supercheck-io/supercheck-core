import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from '@/db/schema/schema';

const connectionString = process.env.DATABASE_URL || 
  `postgres://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || "postgres"}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "supercheck"}`;

const client = postgres(connectionString, { max: 1 });

export const db = drizzle(client, { schema, logger: true });
