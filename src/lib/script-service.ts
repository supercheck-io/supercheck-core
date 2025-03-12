/**
 * Script Service
 *
 * This service handles loading sample scripts for different test types.
 * It provides a simple API for getting script content without using state management.
 */

import { ScriptType } from "./sample-scripts/types";

// Sample scripts content
const scripts: Record<ScriptType, string> = {
  browser: `/**
 * Browser Check Script
 * 
 * This script demonstrates how to test browser functionality using Playwright.
 * It checks page loading, navigation, and element interactions.
 */

import { test, expect } from '@playwright/test';

test('Browser check - Page title verification', async ({ page }) => {
  // Navigate to the website
  await page.goto('https://playwright.dev/');

  // Verify the page title contains the expected text
  await expect(page).toHaveTitle(/Playwright/);
  
  console.log('✅ Page title verified successfully');
});

test('Browser check - Navigation and element visibility', async ({ page }) => {
  // Navigate to the website
  await page.goto('https://playwright.dev/');

  // Click the get started link
  await page.getByRole('link', { name: 'Get started' }).click();

  // Verify that the expected heading is visible after navigation
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  
  console.log('✅ Navigation and element visibility verified');
});

test('Browser check - Form interaction', async ({ page }) => {
  // Navigate to the website with a form
  await page.goto('https://demo.playwright.dev/todomvc');

  // Type into the new todo input
  await page.getByPlaceholder('What needs to be done?').fill('Test automation with Playwright');
  await page.getByPlaceholder('What needs to be done?').press('Enter');

  // Verify the todo item was added
  await expect(page.getByTestId('todo-title')).toHaveText(['Test automation with Playwright']);
  
  // Mark the todo as completed
  await page.getByRole('checkbox').check();
  
  // Verify the todo item is marked as completed
  await expect(page.getByTestId('todo-item')).toHaveClass(/completed/);
  
  console.log('✅ Form interaction verified');
});
`,

  api: `/**
 * API Check Script
 * 
 * This script demonstrates how to test API endpoints using Playwright.
 * It checks response status, data validation, and error handling.
 */

import { test, expect } from '@playwright/test';

test('API check - GET request with status and data validation', async ({ request }) => {
  // Send a GET request to a sample API endpoint
  const response = await request.get('https://jsonplaceholder.typicode.com/todos/1');
  
  // Verify the response status is 200 OK
  expect(response.status()).toBe(200);
  
  // Parse and validate the response data
  const responseData = await response.json();
  expect(responseData).toEqual({
    userId: 1,
    id: 1,
    title: 'delectus aut autem',
    completed: false,
  });
  
  console.log('✅ GET request validated successfully');
});

test('API check - POST request with request body', async ({ request }) => {
  // Create data for the POST request
  const newTodo = {
    title: 'Test API with Playwright',
    completed: false,
    userId: 1
  };
  
  // Send a POST request with the data
  const response = await request.post('https://jsonplaceholder.typicode.com/todos', {
    data: newTodo
  });
  
  // Verify the response status is 201 Created
  expect(response.status()).toBe(201);
  
  // Parse and validate the response data
  const responseData = await response.json();
  expect(responseData).toHaveProperty('id');
  expect(responseData.title).toBe(newTodo.title);
  
  console.log('✅ POST request validated successfully');
});

test('API check - Error handling for non-existent resource', async ({ request }) => {
  // Send a GET request to a non-existent resource
  const response = await request.get('https://jsonplaceholder.typicode.com/todos/999999');
  
  // Verify the response status is 404 Not Found
  expect(response.status()).toBe(404);
  
  // Verify the response body is empty
  const responseData = await response.json();
  expect(Object.keys(responseData).length).toBe(0);
  
  console.log('✅ Error handling validated successfully');
});
`,

  tcp: `import { test, expect } from '@playwright/test';

test('TCP check - Test connection', async ({ page }) => {
  // For TCP tests, we would typically use Node.js net module
  // But since we're in a browser context, we'll simulate with fetch
  
  const startTime = Date.now();
  await fetch('https://example.com');
  const responseTime = Date.now() - startTime;
  
  console.log('✅ Connection test completed in ' + responseTime + 'ms');
  
  // Verify the response time is reasonable
  expect(responseTime).toBeLessThan(5000);
});`,

  multistep: `/**
 * Multistep Check Script
 *
 * This script demonstrates how to perform multistep API tests using Playwright.
 * It shows how to chain API calls and use data from previous responses in subsequent requests.
 */

import { test, expect } from "@playwright/test";

test("Multistep check - Create, read, update, and delete a resource", async ({
  request,
}) => {
  // Step 1: Create a new resource (POST)
  console.log("Step 1: Creating a new post...");
  const createResponse = await request.post(
    "https://jsonplaceholder.typicode.com/posts",
    {
      data: {
        title: "Multistep Test with Playwright",
        body: "This is a test of chained API calls using Playwright",
        userId: 1,
      },
    }
  );

  expect(createResponse.status()).toBe(201);
  const newPost = await createResponse.json();
  console.log("✅ Post created with ID:" + newPost.id);

  // Step 2: Retrieve the created resource (GET)
  console.log("Step 2: Retrieving post with ID " + newPost.id + "...");
  const getResponse = await request.get(
    "https://jsonplaceholder.typicode.com/posts/" + newPost.id
  );

  expect(getResponse.status()).toBe(200);
  const retrievedPost = await getResponse.json();
  expect(retrievedPost.title).toBe("Multistep Test with Playwright");
  console.log("✅ Post retrieved successfully");

  // Step 3: Update the resource (PUT)
  console.log("Step 3: Updating post with ID " + newPost.id + "...");
  const updateResponse = await request.put(
    "https://jsonplaceholder.typicode.com/posts/" + newPost.id,
    {
      data: {
        id: newPost.id,
        title: "Updated Multistep Test",
        body: "This post has been updated",
        userId: 1,
      },
    }
  );

  expect(updateResponse.status()).toBe(200);
  const updatedPost = await updateResponse.json();
  expect(updatedPost.title).toBe("Updated Multistep Test");
  console.log("✅ Post updated successfully");

  // Step 4: Delete the resource (DELETE)
  console.log("Step 4: Deleting post with ID " + newPost.id + "...");
  const deleteResponse = await request.delete(
    "https://jsonplaceholder.typicode.com/posts/" + newPost.id
  );

  expect(deleteResponse.status()).toBe(200);
  console.log("✅ Post deleted successfully");
});

test("Multistep check - Authentication and authorized requests", async ({
  request,
}) => {
  // Step 1: Get authentication token (simulated)
  console.log("Step 1: Getting authentication token...");
  // In a real scenario, this would be an actual auth endpoint
  // For this example, we'll simulate the token acquisition
  const authToken = "simulated_jwt_token";
  console.log("✅ Authentication token acquired");

  // Step 2: Use the token to access a protected resource
  console.log("Step 2: Accessing protected resource with token...");
  const protectedResponse = await request.get(
    "https://jsonplaceholder.typicode.com/users/1",
    {
      headers: {
        Authorization: "Bearer " + authToken,
      },
    }
  );

  expect(protectedResponse.status()).toBe(200);
  const userData = await protectedResponse.json();
  expect(userData.id).toBe(1);
  console.log("✅ Protected resource accessed successfully");

  // Step 3: Use data from the protected resource in another request
  console.log("Step 3: Using data from previous response...");
  const postsResponse = await request.get(
    "https://jsonplaceholder.typicode.com/users/" + userData.id + "/posts"
  );

  expect(postsResponse.status()).toBe(200);
  const posts = await postsResponse.json();
  expect(Array.isArray(posts)).toBe(true);
  expect(posts.length).toBeGreaterThan(0);
  console.log(
    "✅ Retrieved" + posts.length + " posts for user " + userData.name
  );
});

test("Multistep check - Conditional flow based on response", async ({
  request,
}) => {
  // Step 1: Get a list of resources
  console.log("Step 1: Getting list of todos...");
  const listResponse = await request.get(
    "https://jsonplaceholder.typicode.com/todos"
  );

  expect(listResponse.status()).toBe(200);
  const todos = await listResponse.json();
  console.log("✅ Retrieved" + todos.length + " todos");

  // Step 2: Filter the list based on a condition
  console.log("Step 2: Filtering completed todos...");
  const completedTodos = todos.filter(
    (todo) => todo.completed
  );
  console.log("✅ Found" + completedTodos.length + " completed todos");

  // Step 3A: If there are completed todos, get details for the first one
  if (completedTodos.length > 0) {
    console.log(
      "Step 3A: Getting details for completed todo ID " + completedTodos[0].id + "..."
    );
    const detailResponse = await request.get(
      "https://jsonplaceholder.typicode.com/todos/" + completedTodos[0].id
    );

    expect(detailResponse.status()).toBe(200);
    const todoDetail = await detailResponse.json();
    expect(todoDetail.completed).toBe(true);
    console.log("✅ Completed todo details retrieved successfully");
  }
  // Step 3B: If no completed todos, get details for any todo
  else {
    console.log(
      "Step 3B: No completed todos found, getting details for any todo..."
    );
    const detailResponse = await request.get(
      "https://jsonplaceholder.typicode.com/todos/1"
    );

    expect(detailResponse.status()).toBe(200);
    console.log("✅ Todo details retrieved successfully");
  }
});
`,

  group: `import { test, expect } from '@playwright/test';

// Frontend Group Tests
test.describe('Group: Frontend Health Checks', () => {
  test('Frontend - Homepage loads', async ({ page }) => {
    await page.goto('https://playwright.dev/');
    await expect(page).toHaveTitle(/Playwright/);
    
    console.log('✅ Homepage loaded successfully');
  });

  test('Frontend - Navigation works', async ({ page }) => {
    await page.goto('https://playwright.dev/');
    await page.getByRole('link', { name: 'Docs' }).click();
    
    // Verify we navigated to the docs page
    await expect(page.url()).toContain('/docs/');
    
    console.log('✅ Navigation works correctly');
  });
});

// API Group Tests
test.describe('Group: API Health Checks', () => {
  test('API - Posts endpoint', async ({ request }) => {
    const response = await request.get('https://jsonplaceholder.typicode.com/posts');
    expect(response.status()).toBe(200);
    
    const posts = await response.json();
    expect(Array.isArray(posts)).toBe(true);
    
    console.log('✅ Posts API endpoint is healthy');
  });
});`,

  cron: `/**
 * CRON/Heartbeat Check Script
 * 
 * This script demonstrates how to monitor scheduled tasks and services
 * using Playwright. It checks for service availability and response times.
 */

import { test, expect } from '@playwright/test';

test('CRON check - Service heartbeat monitoring', async ({ request }) => {
  // Define the services to monitor
  const services = [
    { name: 'API Service', url: 'https://jsonplaceholder.typicode.com/posts' },
    { name: 'User Service', url: 'https://jsonplaceholder.typicode.com/users' },
    { name: 'Comment Service', url: 'https://jsonplaceholder.typicode.com/comments' }
  ];
  
  // Check each service
  for (const service of services) {
    console.log("Checking heartbeat for" + service.name + "...");
    
    const startTime = Date.now();
    const response = await request.get(service.url);
    const responseTime = Date.now() - startTime;
    
    // Verify the service is responding
    expect(response.status()).toBe(200);
    
    // Verify the response time is acceptable (under 2 seconds)
    expect(responseTime).toBeLessThan(2000);
    
    console.log("✅ " + service.name + " is healthy (responded in " + responseTime + "ms)");
  }
});

test('CRON check - Scheduled task verification', async () => {
  console.log('Verifying scheduled task execution...');
  const now = new Date();
  const lastRunTime = new Date(now.getTime() - 30 * 60 * 1000);
  const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
  const oneHourInMs = 60 * 60 * 1000;

  expect(timeSinceLastRun).toBeLessThan(oneHourInMs);
  console.log("✅ Scheduled task last ran at " + lastRunTime.toISOString() + " (" + Math.round(timeSinceLastRun / 60000) + " minutes ago)");
});

test('CRON check - System resource monitoring', async () => {
  // Simulate checking system resources
  // In a real scenario, you would use system APIs or external monitoring tools
  
  console.log('Monitoring system resources...');
  
  // Simulate CPU usage check (random value between 0-100%)
  const cpuUsage = Math.random() * 100;
  console.log("CPU Usage: " + cpuUsage.toFixed(2) + "%");
  
  // Simulate memory usage check (random value between 0-100%)
  const memoryUsage = Math.random() * 100;
  console.log("Memory Usage: " + memoryUsage.toFixed(2) + "%");
  
  // Simulate disk usage check (random value between 0-100%)
  const diskUsage = Math.random() * 100;
  console.log("Disk Usage: " + diskUsage.toFixed(2) + "%");
  
  // Verify resources are within acceptable thresholds
  expect(cpuUsage).toBeLessThan(90);
  expect(memoryUsage).toBeLessThan(90);
  expect(diskUsage).toBeLessThan(90);
  
  console.log('✅ System resources are within acceptable thresholds');
});

test('CRON check - Database backup verification', async () => {
  // Simulate checking if database backups are being created regularly
  // In a real scenario, you would check actual backup files or logs
  
  console.log('Verifying database backups...');
  
  // Simulate checking when the last backup was created
  const now = new Date();
  const lastBackupTime = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
  
  // Check if the backup was created within the expected timeframe (within the last 24 hours)
  const timeSinceLastBackup = now.getTime() - lastBackupTime.getTime();
  const oneDayInMs = 24 * 60 * 60 * 1000;
  
  expect(timeSinceLastBackup).toBeLessThan(oneDayInMs);
  
  // Simulate checking the backup size
  const backupSizeInMB = 250 + Math.random() * 50; // Random size between 250-300 MB
  
  // Verify the backup size is reasonable (not too small)
  expect(backupSizeInMB).toBeGreaterThan(100);
  
  console.log("✅ Database backup verified: Last backup at " + lastBackupTime.toISOString() + " (" + Math.round(timeSinceLastBackup / 3600000) + " hours ago), size: " + backupSizeInMB.toFixed(2) + " MB");
});
`,
  database: `/**
 * Database Query Test Script
 * 
 * This script demonstrates how to connect to a Microsoft SQL Server (MSSQL) database
 * using the 'mssql' package in a Playwright test. It establishes a connection,
 * executes a sample query, and performs assertions based on the query results.
 * 
 * @requires 'mssql' package
 * @requires '@playwright/test' package
 */

import { test, expect } from "@playwright/test";
import sql from "mssql";

const config = {
  user: "your_username",
  password: "your_password",
  server: "your_server", // For local servers, use 'localhost'
  database: "your_database",
  options: {
    encrypt: true, // Use encryption if required
    trustServerCertificate: true, // Necessary for self-signed certificates
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
    throw err; // Rethrow the error to ensure the test fails
  } finally {
    // Close the database connection using the pool object
    if (pool) await pool.close();
  }
});
`,
  websocket: `/**
 * WebSocket Connectivity Test using Playwright
 * 
 * This script tests a WebSocket connection using Playwright.
 * It establishes a connection, sends a message, receives a response, 
 * and verifies that the echoed message matches the sent message.
 */

import { test, expect } from '@playwright/test';

const wsUrl = 'wss://echo.websocket.events'; // Public WebSocket echo server

test('WebSocket connection test', async ({ page }) => {
  // Open a WebSocket connection inside the browser context
  const wsHandle = await page.evaluateHandle((url) => {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => resolve(socket);
      socket.onerror = (err) => reject(err);
    });
  }, wsUrl);

  expect(wsHandle).toBeDefined();

  // Define the message to send
  const message = 'Hello, WebSocket!';

  // Send a message using the WebSocket connection
  await page.evaluate(({ socket, message }) => {
    socket.send(message);
  }, { socket: wsHandle, message });

  // Wait for and capture the response message
  const response = await page.evaluate(({ socket }) => {
    return new Promise((resolve) => {
      socket.onmessage = (event) => resolve(event.data);
    });
  }, { socket: wsHandle });

  // Validate that the echoed message matches the sent message
  expect(response).toBe(message);

  console.log('✅ WebSocket connection test passed');
});

`,
};

/**
 * Get the content of a sample script by type
 */
export function getSampleScript(type: ScriptType): string {
  return scripts[type] || getDefaultScript();
}

/**
 * Get a default script if the requested script is not found
 */
function getDefaultScript(): string {
  return `import { test, expect } from '@playwright/test';

test('basic test', async ({ page }) => {
  // Navigate to a website
  await page.goto('https://playwright.dev/');

  // Verify the page title
  await expect(page).toHaveTitle(/Playwright/);
  
  // Click a link and verify navigation
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
`;
}

/**
 * Get a list of all available sample scripts
 */
export function getAvailableScripts(): ScriptType[] {
  return Object.keys(scripts) as ScriptType[];
}
