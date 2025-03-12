/**
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
test.describe('Group: Frontend Health Checks', () => {
  const groupResults = { passed: 0, failed: 0, total: 0 };

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

  test('Frontend - Search functionality works', async ({ page }) => {
    try {
      await page.goto('https://playwright.dev/');
      
      // Find and click the search button
      await page.getByRole('button', { name: 'Search' }).click();
      
      // Type in the search box
      await page.getByPlaceholder('Search docs').fill('assertions');
      
      // Wait for search results
      await page.waitForSelector('mark');
      
      // Verify search results appear
      const searchResults = await page.locator('mark').count();
      expect(searchResults).toBeGreaterThan(0);
      
      console.log(`✅ Search functionality works (found ${searchResults} results)`);
      groupResults.passed++;
    } catch (error: unknown) {
      console.error(`❌ Search test failed: ${error instanceof Error ? error.message : String(error)}`);
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

  test('API - Users endpoint', async ({ request }) => {
    try {
      const response = await request.get('https://jsonplaceholder.typicode.com/users');
      expect(response.status()).toBe(200);
      
      const users = await response.json();
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      
      console.log(`✅ Users API endpoint is healthy (returned ${users.length} users)`);
      groupResults.passed++;
    } catch (error: unknown) {
      console.error(`❌ Users API test failed: ${error instanceof Error ? error.message : String(error)}`);
      groupResults.failed++;
      throw error;
    }
  });

  test('API - Comments endpoint', async ({ request }) => {
    try {
      const response = await request.get('https://jsonplaceholder.typicode.com/comments');
      expect(response.status()).toBe(200);
      
      const comments = await response.json();
      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThan(0);
      
      console.log(`✅ Comments API endpoint is healthy (returned ${comments.length} comments)`);
      groupResults.passed++;
    } catch (error: unknown) {
      console.error(`❌ Comments API test failed: ${error instanceof Error ? error.message : String(error)}`);
      groupResults.failed++;
      throw error;
    }
  });

  test.afterAll(() => {
    logGroupResult('API Health Checks', groupResults.passed, groupResults.failed, groupResults.total);
  });
});

// Overall Group Summary
test('Group Summary - Generate overall report', async () => {
  // In a real scenario, this would collect results from all groups
  // and generate a comprehensive report or trigger alerts
  
  console.log('\n===== GROUP SUMMARY =====');
  console.log('Frontend Health Checks: Completed');
  console.log('API Health Checks: Completed');
  console.log('========================\n');
  
  // Simulate checking if any critical groups failed
  const criticalGroupsFailed = false;
  
  if (criticalGroupsFailed) {
    console.error('⚠️ CRITICAL ALERT: One or more critical test groups failed!');
  } else {
    console.log('✅ All critical test groups passed');
  }
});
