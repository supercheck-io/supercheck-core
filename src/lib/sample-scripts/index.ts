/**
 * Sample Scripts Manager
 * 
 * This module provides functions to load sample scripts for different test types.
 */

import { ScriptType } from './types';

// Sample scripts content
const scripts: Record<ScriptType, string> = {
  browser: `import { test, expect } from '@playwright/test';

test('Browser check - Page loads correctly', async ({ page }) => {
  // Navigate to the website
  await page.goto('https://playwright.dev/');
  
  // Verify the page title
  await expect(page).toHaveTitle(/Playwright/);
  
  console.log('✅ Page loaded successfully');
});

test('Browser check - Navigation works', async ({ page }) => {
  // Navigate to the website
  await page.goto('https://playwright.dev/');
  
  // Click the get started link
  await page.getByRole('link', { name: 'Get started' }).click();
  
  // Verify we navigated to the correct page
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
  
  console.log('✅ Navigation works correctly');
});`,
  
  api: `import { test, expect } from '@playwright/test';

test('API check - GET request', async ({ request }) => {
  // Send a GET request to a sample API endpoint
  const response = await request.get('https://jsonplaceholder.typicode.com/todos/1');
  
  // Verify the response status is 200 OK
  expect(response.status()).toBe(200);
  
  // Parse and validate the response data
  const data = await response.json();
  expect(data.id).toBe(1);
  
  console.log('✅ GET request validated successfully');
});

test('API check - POST request', async ({ request }) => {
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
  
  console.log('✅ POST request validated successfully');
});`,
  
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
  
  multistep: `import { test, expect } from '@playwright/test';

test('Multistep check - Create, read, update flow', async ({ request }) => {
  // Step 1: Create a new resource
  console.log('Step 1: Creating a new post...');
  const createResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: {
      title: 'Multistep Test',
      body: 'Testing chained API calls',
      userId: 1
    }
  });
  
  expect(createResponse.status()).toBe(201);
  const createdPost = await createResponse.json();
  console.log('✅ Post created with ID: ' + createdPost.id);
  
  // Step 2: Retrieve the created resource
  console.log('Step 2: Retrieving post...');
  const getResponse = await request.get(`https://jsonplaceholder.typicode.com/posts/${createdPost.id}`);
  
  expect(getResponse.status()).toBe(200);
  console.log('✅ Post retrieved successfully');
  
  // Step 3: Update the resource
  console.log('Step 3: Updating post...');
  const updateResponse = await request.put(`https://jsonplaceholder.typicode.com/posts/${createdPost.id}`, {
    data: {
      id: createdPost.id,
      title: 'Updated Title',
      body: 'Updated content',
      userId: 1
    }
  });
  
  expect(updateResponse.status()).toBe(200);
  console.log('✅ Post updated successfully');
});`,
  
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
  
  cron: `import { test, expect } from '@playwright/test';

test('CRON check - Service heartbeat monitoring', async ({ request }) => {
  // Define the services to monitor
  const services = [
    { name: 'API Service', url: 'https://jsonplaceholder.typicode.com/posts' },
    { name: 'User Service', url: 'https://jsonplaceholder.typicode.com/users' }
  ];
  
  // Check each service
  for (const service of services) {
    console.log('Checking heartbeat for ' + service.name + '...');
    
    const startTime = Date.now();
    const response = await request.get(service.url);
    const responseTime = Date.now() - startTime;
    
    // Verify the service is responding
    expect(response.status()).toBe(200);
    
    console.log('✅ ' + service.name + ' is healthy (responded in ' + responseTime + 'ms)');
  }
});

test('CRON check - Scheduled task verification', async () => {
  // Simulate checking a task that should run every hour
  console.log('Verifying scheduled task execution...');
  
  // Get the current time
  const now = new Date();
  
  // Simulate checking when the task last ran (30 minutes ago)
  const lastRunTime = new Date(now.getTime() - 30 * 60 * 1000);
  
  // Check if the task ran within the expected timeframe (within the last hour)
  const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
  const oneHourInMs = 60 * 60 * 1000;
  
  expect(timeSinceLastRun).toBeLessThan(oneHourInMs);
  
  console.log('✅ Scheduled task last ran ' + Math.round(timeSinceLastRun / 60000) + ' minutes ago');
});`
};

/**
 * Get a sample script based on the script type
 * @param type The type of script to get
 * @returns The sample script content
 */
export function getSampleScript(type: ScriptType): string {
  return scripts[type] || getDefaultScript();
}

/**
 * Get a default script if the requested script is not found
 * @returns The default script content
 */
function getDefaultScript(): string {
  return `import { test, expect } from '@playwright/test';

test('Default check - Page loads correctly', async ({ page }) => {
  // Navigate to the website you want to test
  await page.goto('https://example.com');
  
  // Verify the page title contains the expected text
  await expect(page).toHaveTitle(/Example Domain/);
  
  console.log('✅ Page loaded successfully');
});
`;
}

/**
 * Get a list of all available sample scripts
 * @returns Array of available script types
 */
export function getAvailableScripts(): ScriptType[] {
  return Object.keys(scripts) as ScriptType[];
}
});`
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
  return ['browser', 'api', 'tcp', 'multistep', 'group', 'cron'];
}
`;

// API check sample script
const apiScript = `/**
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
`;

// TCP check sample script
const tcpScript = `/**
 * Get a sample script based on the script type
 * @param type The type of script to get
 * @returns The sample script content
 */
export function getSampleScript(type: ScriptType): string {
  return scripts[type] || getDefaultScript();
}

/**
 * Get a default script if the requested script is not found
 * @returns The default script content
 */

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ success: true, responseTime });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ success: false, responseTime: timeout, error: 'Connection timeout' });
      }
    });

    socket.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, responseTime: Date.now() - startTime, error: error.message });
      }
    });

    socket.connect(port, host);
  });
}

test('TCP check - Test connection to a web server', async () => {
  // Test connection to a common web server port
  const result = await testTcpConnection('example.com', 80);
  
  // Verify the connection was successful
  expect(result.success).toBe(true);
  
  // Verify the response time is reasonable (less than 2 seconds)
  expect(result.responseTime).toBeLessThan(2000);
  
  console.log(`✅ TCP connection to example.com:80 successful (${result.responseTime}ms)`);
});

test('TCP check - Test connection to multiple endpoints', async () => {
  // Define a list of endpoints to test
  const endpoints = [
    { host: 'api.github.com', port: 443, name: 'GitHub API' },
    { host: 'www.google.com', port: 443, name: 'Google' },
    { host: 'localhost', port: 3000, name: 'Local development server' }
  ];
  
  // Test each endpoint
  for (const endpoint of endpoints) {
    const result = await testTcpConnection(endpoint.host, endpoint.port);
    
    console.log(`TCP connection to ${endpoint.name} (${endpoint.host}:${endpoint.port}): ${result.success ? 'successful' : 'failed'} ${result.success ? '(' + result.responseTime + 'ms)' : '- ' + result.error}`);
    
    // For external services that should be reliable, we can assert success
    if (endpoint.host !== 'localhost') {
      expect(result.success).toBe(true);
    }
  }
});
`;

// Multistep check sample script
const multistepScript = `/**
 * Multistep Check Script
 * 
 * This script demonstrates how to perform multistep API tests using Playwright.
 * It shows how to chain API calls and use data from previous responses in subsequent requests.
 */

import { test, expect } from '@playwright/test';

test('Multistep check - Create, read, update, and delete a resource', async ({ request }) => {
  // Step 1: Create a new resource (POST)
  console.log('Step 1: Creating a new post...');
  const createResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: {
      title: 'Multistep Test with Playwright',
      body: 'This is a test of chained API calls using Playwright',
      userId: 1
    }
  });
  
  expect(createResponse.status()).toBe(201);
  const newPost = await createResponse.json();
  console.log(`✅ Post created with ID: ${newPost.id}`);
  
  // Step 2: Retrieve the created resource (GET)
  console.log(`Step 2: Retrieving post with ID ${newPost.id}...`);
  const getResponse = await request.get(`https://jsonplaceholder.typicode.com/posts/${newPost.id}`);
  
  expect(getResponse.status()).toBe(200);
  const retrievedPost = await getResponse.json();
  expect(retrievedPost.title).toBe('Multistep Test with Playwright');
  console.log('✅ Post retrieved successfully');
  
  // Step 3: Update the resource (PUT)
  console.log(`Step 3: Updating post with ID ${newPost.id}...`);
  const updateResponse = await request.put(`https://jsonplaceholder.typicode.com/posts/${newPost.id}`, {
    data: {
      id: newPost.id,
      title: 'Updated Multistep Test',
      body: 'This post has been updated',
      userId: 1
    }
  });
  
  expect(updateResponse.status()).toBe(200);
  const updatedPost = await updateResponse.json();
  expect(updatedPost.title).toBe('Updated Multistep Test');
  console.log('✅ Post updated successfully');
  
  // Step 4: Delete the resource (DELETE)
  console.log(`Step 4: Deleting post with ID ${newPost.id}...`);
  const deleteResponse = await request.delete(`https://jsonplaceholder.typicode.com/posts/${newPost.id}`);
  
  expect(deleteResponse.status()).toBe(200);
  console.log('✅ Post deleted successfully');
});

test('Multistep check - Conditional flow based on response', async ({ request }) => {
  // Step 1: Get a list of resources
  console.log('Step 1: Getting list of todos...');
  const listResponse = await request.get('https://jsonplaceholder.typicode.com/todos');
  
  expect(listResponse.status()).toBe(200);
  const todos = await listResponse.json();
  console.log(`✅ Retrieved ${todos.length} todos`);
  
  // Step 2: Filter the list based on a condition
  console.log('Step 2: Filtering completed todos...');
  const completedTodos = todos.filter((todo: { completed: boolean; id: number }) => todo.completed);
  console.log(`✅ Found ${completedTodos.length} completed todos`);
  
  // Step 3A: If there are completed todos, get details for the first one
  if (completedTodos.length > 0) {
    console.log(`Step 3A: Getting details for completed todo ID ${completedTodos[0].id}...`);
    const detailResponse = await request.get(`https://jsonplaceholder.typicode.com/todos/${completedTodos[0].id}`);
    
    expect(detailResponse.status()).toBe(200);
    const todoDetail = await detailResponse.json();
    expect(todoDetail.completed).toBe(true);
    console.log('✅ Completed todo details retrieved successfully');
  } 
  // Step 3B: If no completed todos, get details for any todo
  else {
    console.log('Step 3B: No completed todos found, getting details for any todo...');
    const detailResponse = await request.get('https://jsonplaceholder.typicode.com/todos/1');
    
    expect(detailResponse.status()).toBe(200);
    console.log('✅ Todo details retrieved successfully');
  }
});
`;

// Group check sample script
const groupScript = `/**
 * Group Check Script
 * 
 * This script demonstrates how to run and manage groups of checks
 * using Playwright. It shows how to organize tests into logical groups
 * and handle alerts based on group results.
 */

import { test, expect } from '@playwright/test';

// Helper function to log group results
function logGroupResult(groupName: string, passed: number, failed: number, total: number) {
  const passRate = (passed / total) * 100;
  console.log(`Group "${groupName}" results: ${passed}/${total} passed (${passRate.toFixed(2)}%)`);
  
  if (failed > 0) {
    console.warn(`⚠️ Alert: ${failed} tests failed in group "${groupName}"`);
  } else {
    console.log(`✅ All tests passed in group "${groupName}"`);
  }
}

// Frontend Group Tests
*/

/**
 * Get a sample script based on the script type
 * @param type The type of script to get
 * @returns The sample script content
 */
export function getSampleScript(type: ScriptType): string {
  return scripts[type] || getDefaultScript();
}

/**
 * Get a default script if the requested script is not found
 * @returns The default script content
 */

  test.beforeEach(() => {
    groupResults.total++;
  });

  test('Frontend - Homepage loads correctly', async ({ page }) => {
    try {
      await page.goto('https://playwright.dev/');
      await expect(page).toHaveTitle(/Playwright/);
      
      console.log('✅ Homepage loaded successfully');
      groupResults.passed++;
    } catch (error: unknown) {
      console.error(`❌ Homepage failed to load: ${error instanceof Error ? error.message : String(error)}`);
      groupResults.failed++;
      throw error;
    }
  });

  test('Frontend - Navigation works', async ({ page }) => {
    try {
      await page.goto('https://playwright.dev/');
      await page.getByRole('link', { name: 'Docs' }).click();
      
      // Verify we navigated to the docs page
      await expect(page.url()).toContain('/docs/');
      
      console.log('✅ Navigation works correctly');
      groupResults.passed++;
    } catch (error: unknown) {
      console.error(`❌ Navigation test failed: ${error instanceof Error ? error.message : String(error)}`);
      groupResults.failed++;
      throw error;
    }
  });

  test.afterAll(() => {
    logGroupResult('Frontend Health Checks', groupResults.passed, groupResults.failed, groupResults.total);
  });
});

// API Group Tests
test.describe('Group: API Health Checks', () => {
  const groupResults = { passed: 0, failed: 0, total: 0 };

  test.beforeEach(() => {
    groupResults.total++;
  });

  test('API - Posts endpoint', async ({ request }) => {
    try {
      const response = await request.get('https://jsonplaceholder.typicode.com/posts');
      expect(response.status()).toBe(200);
      
      const posts = await response.json();
      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeGreaterThan(0);
      
      console.log(`✅ Posts API endpoint is healthy (returned ${posts.length} posts)`);
      groupResults.passed++;
    } catch (error: unknown) {
      console.error(`❌ Posts API test failed: ${error instanceof Error ? error.message : String(error)}`);
      groupResults.failed++;
      throw error;
    }
  });

  test.afterAll(() => {
    logGroupResult('API Health Checks', groupResults.passed, groupResults.failed, groupResults.total);
  });
});
`;

// CRON/Heartbeat check sample script
const cronScript = `/**
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
    console.log(`Checking heartbeat for ${service.name}...`);
    
    const startTime = Date.now();
    const response = await request.get(service.url);
    const responseTime = Date.now() - startTime;
    
    // Verify the service is responding
    expect(response.status()).toBe(200);
    
    // Verify the response time is acceptable (under 2 seconds)
    expect(responseTime).toBeLessThan(2000);
    
    console.log(`✅ ${service.name} is healthy (responded in ${responseTime}ms)`);
  }
});

test('CRON check - Scheduled task verification', async () => {
  // Simulate checking a task that should run every hour
  // In a real scenario, you might check a log file or a database record
  
  console.log('Verifying scheduled task execution...');
  
  // Get the current time
  const now = new Date();
  
  // Simulate checking when the task last ran
  // For this example, we'll pretend it ran 30 minutes ago
  const lastRunTime = new Date(now.getTime() - 30 * 60 * 1000);
  
  // Check if the task ran within the expected timeframe (within the last hour)
  const timeSinceLastRun = now.getTime() - lastRunTime.getTime();
  const oneHourInMs = 60 * 60 * 1000;
  
  expect(timeSinceLastRun).toBeLessThan(oneHourInMs);
  
  console.log(`✅ Scheduled task last ran at ${lastRunTime.toISOString()} (${Math.round(timeSinceLastRun / 60000)} minutes ago)`);
});
`;

// Map script types to their content
const scriptMap: Record<ScriptType, string> = {
  browser: browserScript,
  api: apiScript,
  tcp: tcpScript,
  multistep: multistepScript,
  group: groupScript,
  cron: cronScript
};

/**
 * Get the content of a sample script by type
 */
export function getSampleScript(type: ScriptType): string {
  return scriptMap[type] || getDefaultScript();
}

/**
 * Get a default script if the requested script is not found
 */
function getDefaultScript(): string {
  return `/**
 * Default Test Script
 * 
 * This is a basic Playwright test script that you can customize.
 */

import { test, expect } from '@playwright/test';

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
  return ['browser', 'api', 'tcp', 'multistep', 'group', 'cron'];
}
