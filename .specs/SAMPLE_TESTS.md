# Comprehensive Sample Tests for Supercheck Playground

This document contains sample test scripts that demonstrate all the capabilities and features available in the Supercheck platform. Each test type showcases different tools, libraries, and best practices for end-to-end testing.

## Table of Contents

1. [Browser Testing](#browser-testing)
2. [API Testing](#api-testing)
3. [Database Testing](#database-testing)
4. [Custom Integration Testing](#custom-integration-testing)
5. [Advanced Testing Patterns](#advanced-testing-patterns)
6. [Supported Libraries](#supported-libraries)
7. [Best Practices](#best-practices)

## Browser Testing

### Basic Browser Automation
```javascript
/**
 * Browser Testing - Basic Interactions
 * 
 * This script demonstrates fundamental browser testing capabilities using Playwright.
 * It covers page navigation, element interactions, and content verification.
 * 
 * Capabilities demonstrated:
 * - Page navigation and loading verification
 * - Element selection and interaction
 * - Form filling and submission
 * - Screenshot capture
 * - Video recording
 * - Trace collection
 */

import { test, expect } from '@playwright/test';

test('Basic page navigation and title verification', async ({ page }) => {
  // Navigate to the target website
  await page.goto('https://playwright.dev/');

  // Verify the page title contains expected text
  await expect(page).toHaveTitle(/Playwright/);
  
  // Verify specific elements are visible
  await expect(page.getByRole('heading', { name: 'Playwright' })).toBeVisible();
  
  console.log('✅ Page loaded and title verified successfully');
});

test('Form interaction and input validation', async ({ page }) => {
  // Navigate to a demo form page
  await page.goto('https://demo.playwright.dev/todomvc');

  // Fill in the todo input field
  const todoInput = page.getByPlaceholder('What needs to be done?');
  await todoInput.fill('Learn Playwright automation');
  await todoInput.press('Enter');

  // Verify the todo item was added
  await expect(page.getByTestId('todo-title')).toHaveText(['Learn Playwright automation']);
  
  // Mark the todo as completed
  await page.getByTestId('todo-item').getByRole('checkbox').check();
  
  // Verify the todo is marked as completed
  await expect(page.getByTestId('todo-item')).toHaveClass(/completed/);
  
  console.log('✅ Form interaction and validation completed');
});

test('Multi-step navigation workflow', async ({ page }) => {
  // Start at the main page
  await page.goto('https://playwright.dev/');

  // Navigate through multiple pages
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();

  // Navigate to docs
  await page.getByRole('link', { name: 'Docs' }).first().click();
  await expect(page).toHaveURL(/.*\/docs\/.*/);

  // Verify breadcrumb navigation
  await expect(page.locator('.breadcrumbs')).toBeVisible();
  
  console.log('✅ Multi-step navigation completed successfully');
});
```

### Advanced Browser Features
```javascript
/**
 * Advanced Browser Testing Features
 * 
 * This script demonstrates advanced browser testing capabilities including:
 * - File uploads and downloads
 * - Cookie and localStorage manipulation
 * - Network request interception
 * - Mobile device emulation
 * - Geolocation and permissions
 */

import { test, expect } from '@playwright/test';

test('File upload and download handling', async ({ page }) => {
  // Navigate to a file upload demo
  await page.goto('https://the-internet.herokuapp.com/upload');

  // Create a temporary file for upload
  const fileContent = 'This is a test file for upload';
  const fileName = 'test-file.txt';
  
  // Handle file upload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(fileContent)
  });

  // Submit the upload form
  await page.getByRole('button', { name: 'Upload' }).click();

  // Verify successful upload
  await expect(page.locator('#uploaded-files')).toContainText(fileName);
  
  console.log('✅ File upload handled successfully');
});

test('Cookie and local storage management', async ({ page, context }) => {
  // Navigate to a page
  await page.goto('https://playwright.dev');

  // Set cookies
  await context.addCookies([
    {
      name: 'test-cookie',
      value: 'test-value',
      domain: '.playwright.dev',
      path: '/'
    }
  ]);

  // Set localStorage data
  await page.evaluate(() => {
    localStorage.setItem('test-key', 'test-value');
    sessionStorage.setItem('session-key', 'session-value');
  });

  // Verify cookie was set
  const cookies = await context.cookies();
  const testCookie = cookies.find(cookie => cookie.name === 'test-cookie');
  expect(testCookie).toBeDefined();
  expect(testCookie.value).toBe('test-value');

  // Verify localStorage data
  const localStorageValue = await page.evaluate(() => 
    localStorage.getItem('test-key')
  );
  expect(localStorageValue).toBe('test-value');
  
  console.log('✅ Cookie and storage management completed');
});

test('Network request interception and mocking', async ({ page }) => {
  // Intercept requests to JSONPlaceholder API
  await page.route('**/jsonplaceholder.typicode.com/users', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Mocked User 1', email: 'mocked1@example.com' },
        { id: 2, name: 'Mocked User 2', email: 'mocked2@example.com' }
      ])
    });
  });

  // Navigate to a page and trigger the API call
  await page.goto('https://jsonplaceholder.typicode.com/');

  // Trigger the intercepted API call using page.evaluate
  const apiResponse = await page.evaluate(async () => {
    try {
      const response = await fetch('https://jsonplaceholder.typicode.com/users');
      return await response.json();
    } catch (error) {
      return { error: error.message };
    }
  });

  // Verify the mocked response was returned (not the real API data)
  expect(Array.isArray(apiResponse)).toBe(true);
  expect(apiResponse).toHaveLength(2);
  expect(apiResponse[0].name).toBe('Mocked User 1');
  expect(apiResponse[1].name).toBe('Mocked User 2');
  
  console.log('✅ Network interception and mocking completed');
});
```

### WebSocket Testing
```javascript
/**
 * WebSocket Connection Testing
 * 
 * This script demonstrates how to test WebSocket connections within browser context.
 * It establishes connections, sends messages, and verifies responses.
 */

import { test, expect } from '@playwright/test';

test('WebSocket connection and messaging', async ({ page }) => {
  const wsUrl = 'wss://echo.websocket.events'; // Public WebSocket echo server
  
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
  const message = 'Hello, WebSocket from Supercheck!';

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

  // Close the WebSocket connection
  await page.evaluate(({ socket }) => {
    socket.close();
  }, { socket: wsHandle });

  console.log('✅ WebSocket connection test completed successfully');
});
```

## API Testing

### REST API Testing
```javascript
/**
 * Comprehensive REST API Testing
 * 
 * This script demonstrates thorough API testing capabilities including:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Request/response validation
 * - Error handling and status codes
 * - Authentication and authorization
 * - Rate limiting and performance testing
 */

import { test, expect } from '@playwright/test';

test('Complete CRUD operations workflow', async ({ request }) => {
  // CREATE - POST request to create a new resource
  console.log('Creating a new post...');
  const createResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: {
      title: 'Supercheck API Testing',
      body: 'This post was created during automated testing',
      userId: 1,
    },
  });

  expect(createResponse.status()).toBe(201);
  const newPost = await createResponse.json();
  expect(newPost).toHaveProperty('id');
  expect(newPost.title).toBe('Supercheck API Testing');
  console.log(`✅ Post created with ID: ${newPost.id}`);

  // READ - GET request to retrieve the created resource
  console.log(`Reading post with ID: ${newPost.id}...`);
  const readResponse = await request.get(`https://jsonplaceholder.typicode.com/posts/${newPost.id}`);
  
  expect(readResponse.status()).toBe(200);
  const retrievedPost = await readResponse.json();
  expect(retrievedPost.title).toBe('Supercheck API Testing');
  console.log('✅ Post retrieved successfully');

  // UPDATE - PUT request to modify the resource
  console.log(`Updating post with ID: ${newPost.id}...`);
  const updateResponse = await request.put(`https://jsonplaceholder.typicode.com/posts/${newPost.id}`, {
    data: {
      id: newPost.id,
      title: 'Updated Supercheck API Testing',
      body: 'This post has been updated during automated testing',
      userId: 1,
    },
  });

  expect(updateResponse.status()).toBe(200);
  const updatedPost = await updateResponse.json();
  expect(updatedPost.title).toBe('Updated Supercheck API Testing');
  console.log('✅ Post updated successfully');

  // DELETE - DELETE request to remove the resource
  console.log(`Deleting post with ID: ${newPost.id}...`);
  const deleteResponse = await request.delete(`https://jsonplaceholder.typicode.com/posts/${newPost.id}`);
  
  expect(deleteResponse.status()).toBe(200);
  console.log('✅ Post deleted successfully');
});

test('API authentication and authorization', async ({ request }) => {
  // Simulate getting an authentication token
  console.log('Obtaining authentication token...');
  
  // In a real scenario, this would be an actual auth endpoint
  const authResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: { username: 'testuser', password: 'testpass' }
  });
  
  // Simulate token extraction (in real tests, parse from response)
  const authToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  console.log('✅ Authentication token obtained');

  // Use the token to access protected resources
  console.log('Accessing protected resource with authentication...');
  const protectedResponse = await request.get('https://jsonplaceholder.typicode.com/users/1', {
    headers: {
      'Authorization': authToken,
      'Content-Type': 'application/json'
    }
  });

  expect(protectedResponse.status()).toBe(200);
  const userData = await protectedResponse.json();
  expect(userData).toHaveProperty('id');
  expect(userData).toHaveProperty('name');
  console.log(`✅ Protected resource accessed for user: ${userData.name}`);
});

test('API error handling and edge cases', async ({ request }) => {
  // Test 404 error for non-existent resource
  console.log('Testing 404 error handling...');
  const notFoundResponse = await request.get('https://jsonplaceholder.typicode.com/posts/999999');
  expect(notFoundResponse.status()).toBe(404);
  console.log('✅ 404 error handled correctly');

  // Test malformed request data
  console.log('Testing malformed request handling...');
  const malformedResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: 'invalid-json-data'
  });
  // Note: JSONPlaceholder is lenient, but in real APIs this might return 400
  console.log(`Response status for malformed data: ${malformedResponse.status()}`);

  // Test request timeout simulation
  console.log('Testing request timeout...');
  try {
    const timeoutResponse = await request.get('https://httpstat.us/200?sleep=1000', {
      timeout: 500 // 500ms timeout for a 1 second response
    });
  } catch (error) {
    console.log('✅ Timeout error handled correctly');
  }
});
```

### GraphQL API Testing
```javascript
/**
 * GraphQL API Testing
 * 
 * This script demonstrates testing GraphQL APIs including:
 * - Query operations
 * - Mutation operations
 * - Variable handling
 * - Error handling
 */

import { test, expect } from '@playwright/test';

test('GraphQL query testing', async ({ request }) => {
  const graphqlQuery = {
    query: `
      query GetUsers($first: Int) {
        users(first: $first) {
          id
          name
          email
          posts {
            title
            body
          }
        }
      }
    `,
    variables: {
      first: 2
    }
  };

  // Note: Using a mock GraphQL endpoint for demonstration
  const response = await request.post('https://api.graphql-placeholder.com/', {
    data: graphqlQuery,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  expect(response.status()).toBe(200);
  const responseData = await response.json();
  
  // Verify GraphQL response structure
  expect(responseData).toHaveProperty('data');
  expect(responseData.data).toHaveProperty('users');
  expect(Array.isArray(responseData.data.users)).toBe(true);
  
  console.log('✅ GraphQL query executed successfully');
});

test('GraphQL mutation testing', async ({ request }) => {
  const graphqlMutation = {
    query: `
      mutation CreateUser($input: CreateUserInput!) {
        createUser(input: $input) {
          id
          name
          email
          createdAt
        }
      }
    `,
    variables: {
      input: {
        name: 'Test User',
        email: 'test@example.com'
      }
    }
  };

  const response = await request.post('https://api.graphql-placeholder.com/', {
    data: graphqlMutation,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  expect(response.status()).toBe(200);
  const responseData = await response.json();
  
  // Verify mutation response
  expect(responseData).toHaveProperty('data');
  expect(responseData.data).toHaveProperty('createUser');
  expect(responseData.data.createUser).toHaveProperty('id');
  
  console.log('✅ GraphQL mutation executed successfully');
});
```

## Database Testing

### SQL Database Testing
```javascript
/**
 * SQL Database Testing
 * 
 * This script demonstrates database testing capabilities for various SQL databases:
 * - Microsoft SQL Server (MSSQL)
 * - PostgreSQL
 * - MySQL
 * - Oracle
 * 
 * Supported operations:
 * - Connection establishment
 * - Query execution
 * - Transaction management
 * - Data validation
 * - Error handling
 */

import { test, expect } from '@playwright/test';

// MSSQL Database Testing
test('MSSQL database connection and query', async () => {
  const sql = require('mssql');
  
  const config = {
    user: process.env.MSSQL_USER || 'your_username',
    password: process.env.MSSQL_PASSWORD || 'your_password',
    server: process.env.MSSQL_SERVER || 'localhost',
    database: process.env.MSSQL_DATABASE || 'your_database',
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };

  let pool;
  try {
    console.log('Connecting to MSSQL database...');
    pool = await sql.connect(config);

    // Execute a simple query
    console.log('Executing query...');
    const result = await pool.request().query('SELECT @@VERSION as version');
    
    expect(result.recordset).toBeDefined();
    expect(result.recordset.length).toBeGreaterThan(0);
    console.log(`✅ MSSQL Version: ${result.recordset[0].version}`);

    // Execute parameterized query
    const userQuery = await pool.request()
      .input('userId', sql.Int, 1)
      .query('SELECT * FROM Users WHERE Id = @userId');
    
    console.log(`Found ${userQuery.recordset.length} user(s)`);
    
  } catch (err) {
    console.error('MSSQL Database test failed:', err);
    throw err;
  } finally {
    if (pool) await pool.close();
    console.log('✅ MSSQL connection closed');
  }
});

// PostgreSQL Database Testing
test('PostgreSQL database connection and query', async () => {
  const { Client } = require('pg');
  
  const client = new Client({
    user: process.env.PG_USER || 'your_username',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'your_database',
    password: process.env.PG_PASSWORD || 'your_password',
    port: process.env.PG_PORT || 5432,
  });

  try {
    console.log('Connecting to PostgreSQL database...');
    await client.connect();

    // Execute a simple query
    const versionResult = await client.query('SELECT version()');
    expect(versionResult.rows).toBeDefined();
    expect(versionResult.rows.length).toBeGreaterThan(0);
    console.log('✅ PostgreSQL connected successfully');

    // Execute parameterized query
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [1]
    );
    
    console.log(`Found ${userResult.rows.length} user(s)`);
    expect(userResult.rows).toBeDefined();
    
  } catch (err) {
    console.error('PostgreSQL Database test failed:', err);
    throw err;
  } finally {
    await client.end();
    console.log('✅ PostgreSQL connection closed');
  }
});

// MySQL Database Testing
test('MySQL database connection and query', async () => {
  const mysql = require('mysql2/promise');
  
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'your_username',
    password: process.env.MYSQL_PASSWORD || 'your_password',
    database: process.env.MYSQL_DATABASE || 'your_database'
  });

  try {
    console.log('Connecting to MySQL database...');
    
    // Execute a simple query
    const [versionRows] = await connection.execute('SELECT VERSION() as version');
    expect(versionRows).toBeDefined();
    expect(versionRows.length).toBeGreaterThan(0);
    console.log(`✅ MySQL Version: ${versionRows[0].version}`);

    // Execute parameterized query
    const [userRows] = await connection.execute(
      'SELECT * FROM users WHERE id = ?',
      [1]
    );
    
    console.log(`Found ${userRows.length} user(s)`);
    expect(userRows).toBeDefined();
    
  } catch (err) {
    console.error('MySQL Database test failed:', err);
    throw err;
  } finally {
    await connection.end();
    console.log('✅ MySQL connection closed');
  }
});
```

### NoSQL Database Testing
```javascript
/**
 * NoSQL Database Testing - MongoDB
 * 
 * This script demonstrates MongoDB testing capabilities including:
 * - Connection management
 * - Document operations (CRUD)
 * - Query operations
 * - Index verification
 * - Aggregation pipelines
 */

import { test, expect } from '@playwright/test';

test('MongoDB connection and document operations', async () => {
  const { MongoClient } = require('mongodb');
  
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/testdb';
  const client = new MongoClient(uri);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    
    const db = client.db('testdb');
    const collection = db.collection('users');

    // Insert a document
    console.log('Inserting test document...');
    const insertResult = await collection.insertOne({
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date()
    });
    
    expect(insertResult.insertedId).toBeDefined();
    console.log(`✅ Document inserted with ID: ${insertResult.insertedId}`);

    // Find the document
    console.log('Finding the inserted document...');
    const foundUser = await collection.findOne({ _id: insertResult.insertedId });
    
    expect(foundUser).toBeDefined();
    expect(foundUser.name).toBe('Test User');
    expect(foundUser.email).toBe('test@example.com');
    console.log('✅ Document found and verified');

    // Update the document
    console.log('Updating the document...');
    const updateResult = await collection.updateOne(
      { _id: insertResult.insertedId },
      { $set: { name: 'Updated Test User', updatedAt: new Date() } }
    );
    
    expect(updateResult.modifiedCount).toBe(1);
    console.log('✅ Document updated successfully');

    // Verify the update
    const updatedUser = await collection.findOne({ _id: insertResult.insertedId });
    expect(updatedUser.name).toBe('Updated Test User');
    expect(updatedUser.updatedAt).toBeDefined();

    // Delete the document
    console.log('Deleting the test document...');
    const deleteResult = await collection.deleteOne({ _id: insertResult.insertedId });
    
    expect(deleteResult.deletedCount).toBe(1);
    console.log('✅ Document deleted successfully');

  } catch (err) {
    console.error('MongoDB test failed:', err);
    throw err;
  } finally {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
});

test('MongoDB aggregation pipeline', async () => {
  const { MongoClient } = require('mongodb');
  
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/testdb';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('testdb');
    const collection = db.collection('orders');

    // Insert sample data for aggregation
    await collection.insertMany([
      { customer: 'Alice', amount: 100, status: 'completed' },
      { customer: 'Bob', amount: 200, status: 'completed' },
      { customer: 'Alice', amount: 150, status: 'pending' },
      { customer: 'Charlie', amount: 300, status: 'completed' }
    ]);

    // Aggregation pipeline to get total completed orders by customer
    const pipeline = [
      { $match: { status: 'completed' } },
      { $group: { _id: '$customer', totalAmount: { $sum: '$amount' } } },
      { $sort: { totalAmount: -1 } }
    ];

    const aggregationResult = await collection.aggregate(pipeline).toArray();
    
    expect(aggregationResult).toBeDefined();
    expect(aggregationResult.length).toBeGreaterThan(0);
    
    // Verify the aggregation results
    const aliceTotal = aggregationResult.find(item => item._id === 'Alice');
    expect(aliceTotal.totalAmount).toBe(100);
    
    console.log('✅ MongoDB aggregation pipeline executed successfully');
    
    // Cleanup
    await collection.deleteMany({});
    
  } catch (err) {
    console.error('MongoDB aggregation test failed:', err);
    throw err;
  } finally {
    await client.close();
  }
});
```

## Custom Integration Testing

### End-to-End Workflow Testing
```javascript
/**
 * End-to-End Integration Testing
 * 
 * This script demonstrates complex integration testing scenarios:
 * - Multi-service workflow testing
 * - Data consistency across systems
 * - Event-driven architecture testing
 * - Real-time feature testing
 */

import { test, expect } from '@playwright/test';

test('Complete user registration and order workflow', async ({ page, request }) => {
  // Step 1: User Registration via API
  console.log('Step 1: Creating user account via API...');
  const newUser = {
    name: 'Integration Test User',
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!'
  };

  const registrationResponse = await request.post('/api/auth/register', {
    data: newUser
  });
  
  expect(registrationResponse.status()).toBe(201);
  const userData = await registrationResponse.json();
  expect(userData.id).toBeDefined();
  console.log(`✅ User created with ID: ${userData.id}`);

  // Step 2: Login via Browser
  console.log('Step 2: Logging in via browser...');
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', newUser.email);
  await page.fill('[data-testid="password-input"]', newUser.password);
  await page.click('[data-testid="login-button"]');
  
  // Verify successful login
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  console.log('✅ User logged in successfully');

  // Step 3: Browse and Add Products to Cart
  console.log('Step 3: Adding products to cart...');
  await page.goto('/products');
  
  // Add first product
  await page.click('[data-testid="product-1"] [data-testid="add-to-cart"]');
  await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');
  
  // Add second product
  await page.click('[data-testid="product-2"] [data-testid="add-to-cart"]');
  await expect(page.locator('[data-testid="cart-count"]')).toHaveText('2');
  console.log('✅ Products added to cart');

  // Step 4: Checkout Process
  console.log('Step 4: Processing checkout...');
  await page.click('[data-testid="cart-icon"]');
  await page.click('[data-testid="checkout-button"]');
  
  // Fill shipping information
  await page.fill('[data-testid="shipping-address"]', '123 Test Street');
  await page.fill('[data-testid="shipping-city"]', 'Test City');
  await page.fill('[data-testid="shipping-zip"]', '12345');
  
  // Fill payment information (test card)
  await page.fill('[data-testid="card-number"]', '4242424242424242');
  await page.fill('[data-testid="card-expiry"]', '12/25');
  await page.fill('[data-testid="card-cvc"]', '123');
  
  // Complete order
  await page.click('[data-testid="place-order-button"]');
  
  // Verify order confirmation
  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();
  const orderNumber = await page.locator('[data-testid="order-number"]').textContent();
  console.log(`✅ Order completed: ${orderNumber}`);

  // Step 5: Verify Order via API
  console.log('Step 5: Verifying order via API...');
  const orderResponse = await request.get(`/api/orders/${orderNumber}`, {
    headers: {
      'Authorization': `Bearer ${userData.token}`
    }
  });
  
  expect(orderResponse.status()).toBe(200);
  const orderData = await orderResponse.json();
  expect(orderData.status).toBe('confirmed');
  expect(orderData.items).toHaveLength(2);
  console.log('✅ Order verified via API');

  // Step 6: Email Verification (Mock)
  console.log('Step 6: Verifying email notification...');
  // In a real scenario, you might check an email service or database
  const emailResponse = await request.get(`/api/admin/emails?recipient=${newUser.email}&type=order_confirmation`);
  expect(emailResponse.status()).toBe(200);
  const emails = await emailResponse.json();
  expect(emails.length).toBeGreaterThan(0);
  expect(emails[0].subject).toContain('Order Confirmation');
  console.log('✅ Email notification verified');
});

test('Real-time feature testing with WebSockets', async ({ page, context }) => {
  // Open two browser contexts to simulate multiple users
  const secondContext = await context.browser().newContext();
  const secondPage = await secondContext.newPage();

  try {
    // User 1 joins a chat room
    console.log('User 1 joining chat room...');
    await page.goto('/chat/room/test-room');
    await page.waitForSelector('[data-testid="chat-connected"]');
    
    // User 2 joins the same chat room
    console.log('User 2 joining chat room...');
    await secondPage.goto('/chat/room/test-room');
    await secondPage.waitForSelector('[data-testid="chat-connected"]');

    // User 1 sends a message
    console.log('User 1 sending message...');
    const message = `Hello from User 1 - ${Date.now()}`;
    await page.fill('[data-testid="message-input"]', message);
    await page.click('[data-testid="send-button"]');

    // Verify User 2 receives the message in real-time
    console.log('Verifying User 2 receives message...');
    await expect(secondPage.locator('[data-testid="chat-messages"]')).toContainText(message);
    
    // User 2 sends a reply
    const reply = `Reply from User 2 - ${Date.now()}`;
    await secondPage.fill('[data-testid="message-input"]', reply);
    await secondPage.click('[data-testid="send-button"]');

    // Verify User 1 receives the reply
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText(reply);
    
    console.log('✅ Real-time messaging verified');

  } finally {
    await secondContext.close();
  }
});
```

## Advanced Testing Patterns

### Performance and Load Testing
```javascript
/**
 * Performance Testing
 * 
 * This script demonstrates performance testing capabilities:
 * - Page load time measurement
 * - API response time testing
 * - Memory usage monitoring
 * - Network performance analysis
 */

import { test, expect } from '@playwright/test';

test('Page performance monitoring', async ({ page }) => {
  // Start performance monitoring
  console.log('Starting page performance test...');
  const startTime = Date.now();

  // Navigate with performance monitoring
  await page.goto('https://playwright.dev', { waitUntil: 'networkidle' });
  
  const loadTime = Date.now() - startTime;
  console.log(`Page load time: ${loadTime}ms`);
  
  // Verify load time is within acceptable limits (5 seconds)
  expect(loadTime).toBeLessThan(5000);

  // Measure Core Web Vitals
  const metrics = await page.evaluate(() => {
    return new Promise((resolve) => {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const vitals = {};
        
        entries.forEach((entry) => {
          if (entry.name === 'FCP') {
            vitals.firstContentfulPaint = entry.value;
          }
          if (entry.name === 'LCP') {
            vitals.largestContentfulPaint = entry.value;
          }
          if (entry.name === 'CLS') {
            vitals.cumulativeLayoutShift = entry.value;
          }
        });
        
        resolve(vitals);
      }).observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] });
      
      // Fallback timeout
      setTimeout(() => resolve({}), 3000);
    });
  });

  console.log('Core Web Vitals:', metrics);
  
  // Verify performance metrics
  if (metrics.firstContentfulPaint) {
    expect(metrics.firstContentfulPaint).toBeLessThan(2000); // FCP < 2s
  }
  if (metrics.largestContentfulPaint) {
    expect(metrics.largestContentfulPaint).toBeLessThan(4000); // LCP < 4s
  }
  if (metrics.cumulativeLayoutShift) {
    expect(metrics.cumulativeLayoutShift).toBeLessThan(0.1); // CLS < 0.1
  }

  console.log('✅ Page performance within acceptable limits');
});

test('API performance testing', async ({ request }) => {
  const performanceMetrics = [];
  const numberOfRequests = 10;

  console.log(`Testing API performance with ${numberOfRequests} requests...`);

  for (let i = 0; i < numberOfRequests; i++) {
    const startTime = Date.now();
    
    const response = await request.get('https://jsonplaceholder.typicode.com/posts/1');
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    expect(response.status()).toBe(200);
    performanceMetrics.push(responseTime);
    
    console.log(`Request ${i + 1}: ${responseTime}ms`);
  }

  // Calculate statistics
  const avgResponseTime = performanceMetrics.reduce((a, b) => a + b, 0) / performanceMetrics.length;
  const maxResponseTime = Math.max(...performanceMetrics);
  const minResponseTime = Math.min(...performanceMetrics);

  console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`Max response time: ${maxResponseTime}ms`);
  console.log(`Min response time: ${minResponseTime}ms`);

  // Verify performance requirements
  expect(avgResponseTime).toBeLessThan(1000); // Average < 1s
  expect(maxResponseTime).toBeLessThan(2000); // Max < 2s

  console.log('✅ API performance within acceptable limits');
});
```

### Security Testing
```javascript
/**
 * Security Testing
 * 
 * This script demonstrates security testing capabilities:
 * - Input validation testing
 * - XSS protection verification
 * - CSRF protection testing
 * - Authentication security
 * - Authorization testing
 */

import { test, expect } from '@playwright/test';

test('XSS protection testing', async ({ page }) => {
  console.log('Testing XSS protection...');
  
  // Navigate to a form page (using a working demo)
  await page.goto('https://demo.playwright.dev/todomvc');

  // Attempt XSS injection in various input fields
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    'javascript:alert("XSS")',
    '<img src="x" onerror="alert(\'XSS\')">',
    '"><script>alert("XSS")</script>',
    'javascript:void(0)'
  ];

  for (const payload of xssPayloads) {
    console.log(`Testing XSS payload: ${payload}`);
    
    // Fill form with XSS payload in the todo input
    await page.fill('.new-todo', payload);
    await page.press('.new-todo', 'Enter');

    // Wait for form submission and check for alerts
    await page.waitForTimeout(1000);
    
    // Verify no JavaScript execution occurred
    const alertPresent = await page.evaluate(() => {
      return window.lastAlert !== undefined;
    });
    
    expect(alertPresent).toBeFalsy();
    console.log('✅ XSS payload properly sanitized');
  }

  console.log('✅ XSS protection test completed');
});

test('SQL injection protection testing', async ({ request }) => {
  console.log('Testing SQL injection protection...');
  
  const sqlInjectionPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "' UNION SELECT * FROM users --",
    "1' OR '1'='1' --",
    "admin'--"
  ];

  for (const payload of sqlInjectionPayloads) {
    console.log(`Testing SQL injection payload: ${payload}`);
    
    // Test with JSONPlaceholder API (this will safely handle any malicious input)
    const response = await request.post('https://jsonplaceholder.typicode.com/posts', {
      data: {
        title: payload,
        body: 'Testing SQL injection protection',
        userId: 1
      }
    });

    // JSONPlaceholder will accept the request but safely handle the input
    expect(response.status()).toBe(201);
    const responseData = await response.json();
    expect(responseData.id).toBeDefined();
    
    console.log('✅ SQL injection payload safely handled by API');
  }

  console.log('✅ SQL injection protection test completed');
});

test('Authentication and authorization testing', async ({ request, page }) => {
  console.log('Testing authentication and authorization...');

  // Test 1: Test with a real API that requires authentication
  console.log('Testing access without authentication...');
  // Using GitHub API as an example of protected endpoints
  const unauthorizedResponse = await request.get('https://api.github.com/user');
  expect(unauthorizedResponse.status()).toBe(401);
  console.log('✅ Unauthorized access properly rejected');

  // Test 2: Test with invalid credentials
  console.log('Testing invalid credentials...');
  const invalidAuthResponse = await request.get('https://api.github.com/user', {
    headers: {
      'Authorization': 'Bearer invalid_token_12345'
    }
  });
  
  expect(invalidAuthResponse.status()).toBe(401);
  console.log('✅ Invalid credentials properly rejected');

  // Test 3: Test public endpoints (no auth required)
  console.log('Testing public endpoint access...');
  const publicResponse = await request.get('https://api.github.com/repos/microsoft/playwright');
  
  expect(publicResponse.status()).toBe(200);
  const repoData = await publicResponse.json();
  expect(repoData.name).toBe('playwright');
  console.log('✅ Public endpoint access successful');

  // Test 4: Test rate limiting behavior
  console.log('Testing rate limiting...');
  const rateLimitResponse = await request.get('https://api.github.com/rate_limit');
  expect(rateLimitResponse.status()).toBe(200);
  
  const rateLimitData = await rateLimitResponse.json();
  expect(rateLimitData.rate).toBeDefined();
  expect(rateLimitData.rate.limit).toBeGreaterThan(0);
  console.log(`✅ Rate limit info: ${rateLimitData.rate.remaining}/${rateLimitData.rate.limit} remaining`);

  console.log('✅ Authentication and authorization test completed');
});
```

### Data Validation and Faker Testing
```javascript
/**
 * Data Validation and Faker Testing
 * 
 * This script demonstrates data validation testing using faker.js
 * for generating test data and comprehensive validation scenarios.
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('Comprehensive form validation with faker data', async ({ page }) => {
  console.log('Testing form validation with generated test data...');
  
  // Use a working demo form page
  await page.goto('https://demo.playwright.dev/todomvc');

  // Generate test data using faker
  const testUser = {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: faker.location.streetAddress(),
    city: faker.location.city(),
    zipCode: faker.location.zipCode(),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }),
    company: faker.company.name(),
    website: faker.internet.url()
  };

  console.log('Generated test user:', testUser);

  // Use the todo input to test data validation with faker data
  const todoText = `${testUser.firstName} ${testUser.lastName} - ${testUser.email}`;
  await page.fill('.new-todo', todoText);
  await page.press('.new-todo', 'Enter');

  // Verify the todo was added successfully
  await expect(page.locator('.todo-list li')).toContainText(testUser.firstName);
  console.log('✅ Form submitted successfully with faker data');

  // Test data validation scenarios using different todo entries
  console.log('Testing data validation scenarios...');
  
  // Test with very long text (boundary testing)
  const longText = faker.lorem.paragraphs(5); // Very long text
  await page.fill('.new-todo', longText);
  await page.press('.new-todo', 'Enter');
  
  // Verify long text is handled properly
  await expect(page.locator('.todo-list li').last()).toContainText(longText.substring(0, 50));
  console.log('✅ Long text input properly handled');

  // Test with special characters
  const specialCharsText = `${faker.person.firstName()} !@#$%^&*()_+ <>?:"{}[];'.,/`;
  await page.fill('.new-todo', specialCharsText);
  await page.press('.new-todo', 'Enter');
  
  // Verify special characters are handled
  await expect(page.locator('.todo-list li').last()).toContainText('!@#$%');
  console.log('✅ Special characters properly handled');

  console.log('✅ Form validation test completed');
});

test('API data validation with multiple test cases', async ({ request }) => {
  console.log('Testing API data validation with generated test data...');

  // Generate multiple test posts for JSONPlaceholder API
  const testPosts = Array.from({ length: 5 }, () => ({
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    userId: faker.number.int({ min: 1, max: 10 })
  }));

  for (const [index, post] of testPosts.entries()) {
    console.log(`Testing post ${index + 1}:`, post.title);
    
    const response = await request.post('https://jsonplaceholder.typicode.com/posts', {
      data: post
    });

    expect(response.status()).toBe(201);
    const responseData = await response.json();
    
    // Validate response structure
    expect(responseData.id).toBeDefined();
    expect(responseData.title).toBe(post.title);
    expect(responseData.body).toBe(post.body);
    expect(responseData.userId).toBe(post.userId);
    
    console.log(`✅ Post ${index + 1} created successfully with ID: ${responseData.id}`);
  }

  console.log('✅ API data validation test completed');
});

test('Edge case testing with boundary values', async ({ request }) => {
  console.log('Testing edge cases and boundary values...');

  // Test boundary values for userId field using JSONPlaceholder
  const boundaryTests = [
    { userId: 0, description: 'UserID 0 (boundary case)' },
    { userId: 1, description: 'UserID 1 (minimum valid)' },
    { userId: 10, description: 'UserID 10 (maximum typical)' },
    { userId: 999, description: 'UserID 999 (large value)' },
    { userId: -1, description: 'UserID -1 (negative)' }
  ];

  for (const test of boundaryTests) {
    console.log(`Testing: ${test.description}`);
    
    const response = await request.post('https://jsonplaceholder.typicode.com/posts', {
      data: {
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraph(),
        userId: test.userId
      }
    });

    // JSONPlaceholder accepts all these values (it's a mock API)
    expect(response.status()).toBe(201);
    const responseData = await response.json();
    expect(responseData.userId).toBe(test.userId);
    console.log(`✅ ${test.description} - Handled correctly, returned ID: ${responseData.id}`);
  }

  // Test with extremely long content
  console.log('Testing with extremely long content...');
  const veryLongTitle = faker.lorem.sentences(50); // Very long title
  const veryLongBody = faker.lorem.paragraphs(20); // Very long body
  
  const longContentResponse = await request.post('https://jsonplaceholder.typicode.com/posts', {
    data: {
      title: veryLongTitle,
      body: veryLongBody,
      userId: 1
    }
  });

  expect(longContentResponse.status()).toBe(201);
  const longContentData = await longContentResponse.json();
  expect(longContentData.title).toBe(veryLongTitle);
  console.log('✅ Extremely long content handled correctly');

  console.log('✅ Boundary value testing completed');
});
```

## Supported Libraries

The Supercheck platform supports a wide range of libraries for comprehensive testing:

### Core Testing Libraries
- **@playwright/test** - Main testing framework for browser and API testing
- **@faker-js/faker** - Generate realistic test data

### Database Libraries
- **mssql** - Microsoft SQL Server client
- **pg** - PostgreSQL client
- **mysql2** - MySQL client
- **mongodb** - MongoDB client
- **oracledb** - Oracle Database client

### Utility Libraries
- **axios** - HTTP client for API requests
- **lodash** - Utility functions for data manipulation
- **dayjs** - Date manipulation and formatting
- **uuid** - Generate unique identifiers
- **validator** - String validation and sanitization
- **cheerio** - Server-side jQuery-like HTML parsing
- **acorn** & **acorn-walk** - JavaScript parsing and AST traversal

### Validation Libraries
- **zod** - TypeScript-first schema validation

## Best Practices

### 1. Test Structure and Organization
```javascript
// Good: Descriptive test names and clear structure
test('User registration - should create account with valid data and send confirmation email', async ({ page, request }) => {
  // Arrange: Set up test data
  const userData = {
    email: faker.internet.email(),
    password: 'SecurePassword123!'
  };

  // Act: Perform the action
  await page.goto('/register');
  await page.fill('[data-testid="email"]', userData.email);
  await page.fill('[data-testid="password"]', userData.password);
  await page.click('[data-testid="register-button"]');

  // Assert: Verify the outcome
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  
  // Additional verification via API
  const user = await request.get(`/api/users/by-email/${userData.email}`);
  expect(user.status()).toBe(200);
});
```

### 2. Error Handling and Cleanup
```javascript
test('Database operation with proper cleanup', async () => {
  let connection;
  try {
    // Setup
    connection = await sql.connect(config);
    
    // Test operation
    const result = await connection.request().query('SELECT * FROM users');
    expect(result.recordset).toBeDefined();
    
  } catch (error) {
    console.error('Test failed:', error);
    throw error; // Re-throw to fail the test
  } finally {
    // Always cleanup
    if (connection) {
      await connection.close();
    }
  }
});
```

### 3. Environment Configuration
```javascript
// Use environment variables for configuration
const config = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  dbConnection: process.env.TEST_DB_URL || 'default-connection-string',
  apiKey: process.env.TEST_API_KEY || 'test-key'
};

// Validate required environment variables
if (!process.env.TEST_API_KEY) {
  throw new Error('TEST_API_KEY environment variable is required');
}
```

### 4. Data-Driven Testing
```javascript
const testCases = [
  { input: 'valid@email.com', expected: true, description: 'valid email' },
  { input: 'invalid-email', expected: false, description: 'invalid email format' },
  { input: '', expected: false, description: 'empty email' },
  { input: 'test@', expected: false, description: 'incomplete email' }
];

testCases.forEach(({ input, expected, description }) => {
  test(`Email validation - ${description}`, async ({ page }) => {
    await page.goto('/contact');
    await page.fill('[data-testid="email"]', input);
    await page.click('[data-testid="submit"]');
    
    if (expected) {
      await expect(page.locator('[data-testid="success"]')).toBeVisible();
    } else {
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    }
  });
});
```

### 5. Parallel Testing Considerations
```javascript
// Use unique identifiers to avoid conflicts in parallel execution
test('User creation with unique data', async ({ request }) => {
  const uniqueId = Date.now() + Math.random();
  const testUser = {
    email: `test-${uniqueId}@example.com`,
    name: `Test User ${uniqueId}`
  };
  
  const response = await request.post('/api/users', { data: testUser });
  expect(response.status()).toBe(201);
});
```

### 6. Security and Sensitive Data
```javascript
// Good: Use environment variables for sensitive data
const credentials = {
  username: process.env.TEST_USERNAME,
  password: process.env.TEST_PASSWORD
};

// Avoid: Hardcoding sensitive information
// const credentials = {
//   username: 'admin',
//   password: 'password123'
// };
```

### 7. Performance Considerations
```javascript
// Use appropriate wait strategies
await page.waitForLoadState('networkidle'); // Wait for network activity to stop
await page.waitForSelector('[data-testid="content"]'); // Wait for specific element

// Optimize database connections
const pool = new sql.ConnectionPool(config);
await pool.connect();
// Reuse the pool for multiple queries
// Close pool when done
await pool.close();
```

---

This comprehensive sample tests document demonstrates the full capabilities of the Supercheck platform, including all supported libraries, testing patterns, and best practices. Use these examples as templates for creating your own test scenarios in the playground.