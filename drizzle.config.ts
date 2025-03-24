import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import path from "path";

// Cross-platform path handling for SQLite
function getNormalizedDbUrl() {
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
  const defaultDbPath = path.resolve("./src/db/supertest.db").replace(/\\/g, '/');
  return `file:${defaultDbPath}`;
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
