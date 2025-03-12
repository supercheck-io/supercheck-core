/**
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
