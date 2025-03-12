import { test, expect } from "@playwright/test";
import sql from "mssql";

const config = {
  user: "your_username",
  password: "your_password",
  server: "your_server",
  database: "your_database",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

test("Database Query Test", async () => {
  let pool;
  try {
    // Establish a connection to the database
    pool = await sql.connect(config);

    // Execute a query
    const result = await pool.request().query("SELECT * FROM your_table");

    // Process the result as needed
    console.log(result);

    // Perform assertions based on the query result
    expect(result.recordset.length).toBeGreaterThan(0);
  } catch (err) {
    console.error("Database query failed:", err);
    throw err; // Rethrow the error to fail the test
  } finally {
    // Close the database connection using the pool object
    if (pool) await pool.close();
  }
});
