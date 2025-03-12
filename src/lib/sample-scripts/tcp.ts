/**
 * TCP Check Script
 * 
 * This script demonstrates how to test TCP connectivity using Playwright.
 * It checks connection to endpoints, response times, and error handling.
 */

import { test, expect } from '@playwright/test';
import * as net from 'net';

// Helper function to test TCP connectivity
async function testTcpConnection(host: string, port: number, timeout = 5000): Promise<{ success: boolean, responseTime: number, error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let resolved = false;

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

test('TCP check - Test connection to a database server', async () => {
  // Test connection to a common database port (PostgreSQL)
  // Note: This might fail if there's no PostgreSQL server running at this address
  // This is just for demonstration purposes
  const result = await testTcpConnection('localhost', 5432);
  
  console.log(`TCP connection to localhost:5432 ${result.success ? 'successful' : 'failed'}: ${result.success ? result.responseTime + 'ms' : result.error}`);
  
  // Instead of expecting success (which might fail), we just log the result
  // In a real test, you would use expect() based on your environment
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
