import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Cross-platform path handling for SQLite
function getNormalizedDbUrl() {
  return process.env.DB_FILE_NAME 
    ? process.env.DB_FILE_NAME.startsWith("file:") 
      ? process.env.DB_FILE_NAME.replace(/\\/g, '/') 
      : process.env.DB_FILE_NAME
    : "file:./src/db/supertest.db";
}

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: getNormalizedDbUrl(),
  },
  verbose: true,
  strict: true,
});
