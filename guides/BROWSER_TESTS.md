# Browser Testing Examples

These are comprehensive browser testing examples that you can copy and paste into the Monaco editor. Each test includes detailed explanations for first-time users.

## 1. Basic Website Navigation Test

```javascript
/**
 * 🌐 BROWSER TEST: Basic Website Navigation
 *
 * This test demonstrates fundamental browser automation:
 * - Opening a website
 * - Verifying page title and content
 * - Taking screenshots for debugging
 *
 * Perfect for beginners - just copy, paste, and run!
 */
import { test, expect } from "@playwright/test";

test("Basic website navigation and verification", async ({ page }) => {
  // Step 1: Navigate to the website
  console.log("🌐 Navigating to example.com...");
  await page.goto("https://example.com");

  // Step 2: Verify the page loaded correctly
  await expect(page).toHaveTitle(/Example Domain/);
  console.log("✅ Page title verified");

  // Step 3: Check for specific content
  await expect(page.locator("h1")).toContainText("Example Domain");
  console.log("✅ Main heading found");

  // Step 4: Take a screenshot for debugging
  await page.screenshot({ path: "example-homepage.png", fullPage: true });
  console.log("📸 Screenshot saved as example-homepage.png");

  console.log("🎉 Test completed successfully!");
});
```

## 2. Form Interaction Test

```javascript
/**
 * 🌐 BROWSER TEST: Form Interaction
 *
 * This test shows how to:
 * - Fill out forms with fake data
 * - Submit forms
 * - Verify form submission results
 * - Handle different input types
 */
import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";

test("Complete form interaction with fake data", async ({ page }) => {
  // Generate realistic test data
  const testData = {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    message: faker.lorem.paragraph(),
  };

  console.log("📝 Generated test data:", testData);

  // Navigate to a demo form
  await page.goto("https://demo.playwright.dev/todomvc");

  // Fill the todo form as an example
  await page.fill(".new-todo", `Contact ${testData.name} at ${testData.email}`);
  await page.press(".new-todo", "Enter");

  // Verify the todo was added
  await expect(page.locator(".todo-list li")).toContainText(testData.name);
  console.log("✅ Form submitted successfully with fake data");

  // Test editing the todo
  await page.dblclick(".todo-list li label");
  await page.fill(".todo-list li .edit", `Updated: ${testData.message}`);
  await page.press(".todo-list li .edit", "Enter");

  // Verify the update
  await expect(page.locator(".todo-list li")).toContainText("Updated:");
  console.log("✅ Form editing functionality verified");
});
```

## 3. Multi-Page Navigation Test

```javascript
/**
 * 🌐 BROWSER TEST: Multi-Page Navigation
 *
 * This test demonstrates:
 * - Navigating between multiple pages
 * - Handling page transitions
 * - Verifying navigation state
 * - Testing browser history
 */
import { test, expect } from "@playwright/test";

test("Multi-page navigation workflow", async ({ page }) => {
  const pages = [
    {
      url: "https://playwright.dev/",
      expectedTitle: /Playwright/,
      element: "h1",
    },
    {
      url: "https://playwright.dev/docs/intro",
      expectedTitle: /Installation/,
      element: ".hero__title",
    },
    {
      url: "https://playwright.dev/docs/writing-tests",
      expectedTitle: /Writing tests/,
      element: "h1",
    },
  ];

  for (const [index, pageInfo] of pages.entries()) {
    console.log(`📍 Step ${index + 1}: Navigating to ${pageInfo.url}`);

    await page.goto(pageInfo.url);

    // Verify page loaded correctly
    await expect(page).toHaveTitle(pageInfo.expectedTitle);
    console.log(`✅ Page ${index + 1}: Title verified`);

    // Wait for main content to load
    await page.waitForSelector(pageInfo.element);
    console.log(`✅ Page ${index + 1}: Content loaded`);

    // Take screenshot of each page
    await page.screenshot({ path: `page-${index + 1}.png` });
    console.log(`📸 Page ${index + 1}: Screenshot saved`);
  }

  // Test browser back navigation
  console.log("⏪ Testing browser back navigation...");
  await page.goBack();
  await expect(page).toHaveTitle(/Writing tests/);
  console.log("✅ Back navigation working");

  // Test browser forward navigation
  console.log("⏩ Testing browser forward navigation...");
  await page.goForward();
  await expect(page).toHaveTitle(/Writing tests/);
  console.log("✅ Forward navigation working");
});
```

## 4. Interactive Elements Test

```javascript
/**
 * 🌐 BROWSER TEST: Interactive Elements
 *
 * This test covers:
 * - Clicking buttons and links
 * - Handling dropdowns and checkboxes
 * - Testing hover effects
 * - Handling modals and alerts
 */
import { test, expect } from "@playwright/test";

test("Interactive elements comprehensive testing", async ({ page }) => {
  // Navigate to a demo page with interactive elements
  await page.goto("https://demo.playwright.dev/todomvc");

  // Test 1: Add multiple todos (button clicking)
  console.log("🖱️ Testing button interactions...");
  const todos = ["Learn Playwright", "Write tests", "Deploy app"];

  for (const [index, todo] of todos.entries()) {
    await page.fill(".new-todo", todo);
    await page.press(".new-todo", "Enter");
    console.log(`✅ Todo ${index + 1} added: ${todo}`);
  }

  // Verify all todos were added
  await expect(page.locator(".todo-list li")).toHaveCount(3);
  console.log("✅ All todos added successfully");

  // Test 2: Checkbox interactions
  console.log("☑️ Testing checkbox interactions...");
  await page.check(".todo-list li:first-child .toggle");
  await expect(page.locator(".todo-list li:first-child")).toHaveClass(
    /completed/
  );
  console.log("✅ First todo marked as completed");

  // Test 3: Filter interactions (if available)
  console.log("🔍 Testing filter interactions...");
  const activeFilter = page.locator('.filters a[href="#/active"]');
  if (await activeFilter.isVisible()) {
    await activeFilter.click();
    await expect(page.locator(".todo-list li.completed")).toHaveCount(0);
    console.log("✅ Active filter working");
  }

  // Test 4: Delete functionality (hover and click)
  console.log("🗑️ Testing delete functionality...");
  const firstTodo = page.locator(".todo-list li").first();
  await firstTodo.hover();
  await firstTodo.locator(".destroy").click();
  console.log("✅ Todo deleted successfully");

  // Final verification
  const remainingTodos = await page.locator(".todo-list li").count();
  console.log(`📊 Final count: ${remainingTodos} todos remaining`);
});
```

## 5. Performance and Loading Test

```javascript
/**
 * 🌐 BROWSER TEST: Performance and Loading
 *
 * This test measures:
 * - Page load times
 * - Network requests
 * - Core Web Vitals
 * - Resource loading
 */
import { test, expect } from "@playwright/test";

test("Website performance and loading analysis", async ({ page }) => {
  console.log("⏱️ Starting performance measurement...");

  // Start measuring load time
  const startTime = Date.now();

  // Navigate with network monitoring
  await page.goto("https://playwright.dev", { waitUntil: "networkidle" });

  const loadTime = Date.now() - startTime;
  console.log(`📊 Page load time: ${loadTime}ms`);

  // Verify load time is reasonable (under 5 seconds)
  expect(loadTime).toBeLessThan(5000);
  console.log("✅ Load time within acceptable limits");

  // Measure Core Web Vitals
  const metrics = await page.evaluate(() => {
    return new Promise((resolve) => {
      const vitals = {};

      // Get performance navigation timing
      const navigation = performance.getEntriesByType("navigation")[0];
      if (navigation) {
        vitals.domContentLoaded =
          navigation.domContentLoadedEventEnd -
          navigation.domContentLoadedEventStart;
        vitals.loadComplete =
          navigation.loadEventEnd - navigation.loadEventStart;
      }

      // Get paint timings
      const paintEntries = performance.getEntriesByType("paint");
      paintEntries.forEach((entry) => {
        if (entry.name === "first-contentful-paint") {
          vitals.firstContentfulPaint = entry.startTime;
        }
      });

      resolve(vitals);
    });
  });

  console.log("📈 Performance metrics:", metrics);

  // Verify performance benchmarks
  if (metrics.firstContentfulPaint) {
    expect(metrics.firstContentfulPaint).toBeLessThan(3000); // FCP < 3s
    console.log("✅ First Contentful Paint within limits");
  }

  // Check for JavaScript errors
  const jsErrors = [];
  page.on("pageerror", (error) => jsErrors.push(error.message));

  // Navigate to trigger any potential errors
  await page.reload();

  // Verify no JavaScript errors occurred
  expect(jsErrors.length).toBe(0);
  console.log("✅ No JavaScript errors detected");

  // Test responsive design
  console.log("📱 Testing responsive design...");
  await page.setViewportSize({ width: 375, height: 667 }); // iPhone size
  await page.screenshot({ path: "mobile-view.png" });
  console.log("📸 Mobile screenshot saved");

  await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop size
  await page.screenshot({ path: "desktop-view.png" });
  console.log("📸 Desktop screenshot saved");
});
```

## 6. File Upload and Download Test

```javascript
/**
 * 🌐 BROWSER TEST: File Upload and Download
 *
 * This test demonstrates:
 * - File upload functionality
 * - Download handling
 * - File validation
 * - Multiple file operations
 */
import { test, expect } from "@playwright/test";

test("File upload and download operations", async ({ page }) => {
  // Navigate to file upload demo
  await page.goto("https://the-internet.herokuapp.com/upload");

  console.log("📁 Testing file upload functionality...");

  // Create test files for upload
  const testFiles = [
    {
      name: "test-document.txt",
      content: "This is a test document for upload testing.",
      mimeType: "text/plain",
    },
    {
      name: "test-data.json",
      content: JSON.stringify({ test: true, data: [1, 2, 3] }, null, 2),
      mimeType: "application/json",
    },
  ];

  for (const [index, file] of testFiles.entries()) {
    console.log(`📤 Uploading file ${index + 1}: ${file.name}`);

    // Set up file for upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: Buffer.from(file.content),
    });

    // Submit the upload
    await page.click("#file-submit");

    // Verify upload success
    await expect(page.locator("#uploaded-files")).toContainText(file.name);
    console.log(`✅ File ${index + 1} uploaded successfully`);

    // Go back to upload more files
    if (index < testFiles.length - 1) {
      await page.goBack();
    }
  }

  // Test download functionality
  console.log("📥 Testing file download functionality...");
  await page.goto("https://the-internet.herokuapp.com/download");

  // Set up download handler
  const downloadPromise = page.waitForEvent("download");

  // Click on a download link
  const downloadLink = page.locator('a[href*=".txt"]').first();
  if (await downloadLink.isVisible()) {
    await downloadLink.click();

    const download = await downloadPromise;
    console.log(`✅ Download started: ${download.suggestedFilename()}`);

    // Save the downloaded file
    await download.saveAs(`./downloaded-${download.suggestedFilename()}`);
    console.log("✅ File downloaded and saved successfully");
  }
});
```

## Quick Copy Templates

### 🎯 Basic Browser Test Template

```javascript
import { test, expect } from "@playwright/test";

test("My browser test", async ({ page }) => {
  // Navigate to your website
  await page.goto("https://your-website.com");

  // Add your test steps here
  await expect(page).toHaveTitle(/Expected Title/);

  console.log("✅ Test completed!");
});
```

### 🎯 Form Testing Template

```javascript
import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";

test("Form testing with fake data", async ({ page }) => {
  const testData = {
    name: faker.person.fullName(),
    email: faker.internet.email(),
  };

  await page.goto("https://your-form-page.com");

  // Fill form fields
  await page.fill('[data-testid="name"]', testData.name);
  await page.fill('[data-testid="email"]', testData.email);
  await page.click('[data-testid="submit"]');

  // Verify success
  await expect(page.locator('[data-testid="success"]')).toBeVisible();
});
```

### 🎯 Multi-Page Navigation Template

```javascript
import { test, expect } from "@playwright/test";

test("Multi-page navigation", async ({ page }) => {
  const pages = [
    "https://your-site.com/page1",
    "https://your-site.com/page2",
    "https://your-site.com/page3",
  ];

  for (const url of pages) {
    await page.goto(url);
    await expect(page).toHaveURL(url);
    console.log(`✅ Successfully navigated to ${url}`);
  }
});
```
