/**
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
