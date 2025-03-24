import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_FILE_NAME || "file:./src/db/supertest.db",
  },
  verbose: true,
  strict: true,
});
