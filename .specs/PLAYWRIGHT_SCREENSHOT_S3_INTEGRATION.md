# Playwright Screenshot S3 Integration Specification

## Overview

This specification defines how to enhance the Supercheck platform's playground functionality to automatically detect Playwright screenshot steps, capture screenshots to S3 storage, and integrate them into HTML reports for better test artifact management.

## Current State Analysis

### Current Screenshot Handling
- Screenshots are currently saved to the project root by default
- Playwright config enables screenshots with `screenshot: 'on'` (execution.service.ts:1291)
- HTML reports are generated and uploaded to S3 via `_processReportFilesForS3()` method
- S3Service handles directory uploads with proper content type detection

### Current S3 Integration
- S3Service exists with robust upload functionality (`worker/src/execution/services/s3.service.ts`)
- Reports are uploaded to separate buckets for tests vs jobs
- HTML report processing exists but doesn't currently handle screenshot paths specifically

### Current Playwright Configuration
- Config file at `worker/playwright.config.js` with:
  - `screenshot: 'on'`
  - `trace: 'on'` 
  - `video: 'on'`
  - `outputDir: relativeOutputDir` (line 55)

## Problem Statement

Currently, when users write Playwright scripts in the playground that include screenshot steps:
1. Screenshots are saved locally in the project root
2. Screenshots are not automatically uploaded to S3 alongside HTML reports  
3. HTML reports may reference broken local paths to screenshots
4. No centralized screenshot management for test artifacts
5. Visual comparison testing (`toHaveScreenshot()`) snapshots are not preserved or accessible
6. No automatic screenshot attachment to reports for better debugging
7. Baseline screenshots for visual regression testing are lost between runs

## Proposed Solution

### 1. Screenshot Detection and Path Management

**Auto-detect Screenshot Steps:**
- Enhance `ensureProperTraceConfiguration()` function in execution.service.ts to detect screenshot steps
- Look for patterns like:
  - `page.screenshot()` - Manual screenshot capture
  - `await page.screenshot({path: '...', fullPage: true})` - Full page screenshots  
  - `expect(page).toHaveScreenshot()` - Visual comparison testing
  - `expect(locator).toHaveScreenshot()` - Element-specific visual testing
  - `testInfo.attach()` - Explicit screenshot attachment
  - `page.locator().screenshot()` - Element screenshots

**Dynamic Screenshot Path Configuration:**
- Modify screenshot paths to use execution-specific directories
- Update Playwright test scripts to save screenshots to the same output directory as reports
- Pattern: `{runDir}/report-{executionId}/screenshots/`

### 2. S3 Upload Integration

**Enhanced Directory Upload:**
- Extend existing `uploadDirectory()` method in S3Service 
- Ensure screenshot files (`.png`, `.jpg`, `.jpeg`) are uploaded with correct content types
- Leverage existing content type detection in `getContentType()` function
- Handle visual comparison baseline and diff images

**Screenshot Organization in S3:**
- Structure: `s3://{bucket}/{entityId}/report/screenshots/`
- Visual comparison structure: `s3://{bucket}/{entityId}/report/test-results/`
- Baseline screenshots: `s3://{bucket}/{entityId}/snapshots/`
- Maintain flat structure for easy HTML report reference
- Use relative paths in HTML reports: `./screenshots/screenshot-name.png`

**Visual Comparison Support:**
- Upload baseline screenshots for visual regression testing
- Store diff images when visual comparisons fail
- Preserve snapshot history for comparison across runs
- Support Playwright's snapshot naming convention: `{test-name}-{browser}-{platform}.png`

### 3. HTML Report Integration

**Path Processing Enhancement:**
- Extend `_processReportFilesForS3()` method in execution.service.ts
- Add screenshot path detection and replacement patterns
- Convert absolute screenshot paths to relative S3-compatible paths
- Handle both manual `page.screenshot()` calls and auto-generated screenshots

**New Pattern Matching:**
```javascript
// Add to existing patterns in _processReportFilesForS3():
{
  regex: /(["'])(.*\/screenshots\/[^"']+\.(png|jpg|jpeg))(['"])/g,
  replacement: '$1./screenshots/$3$4',
},
{
  regex: /(src=["'])([^"']*\.(png|jpg|jpeg))(['"])/g, 
  replacement: '$1./screenshots/$2$4',
}
```

### 4. Playground Script Enhancement

**Automatic Screenshot Path Injection:**
- When `ensureProperTraceConfiguration()` detects screenshot steps, inject proper path configuration
- Replace user-specified paths with standardized S3-compatible paths
- Ensure screenshots are saved to the report output directory

**Example Script Transformations:**

*Manual Screenshot:*
```javascript
// User writes:
await page.screenshot({ path: 'my-screenshot.png' });

// Gets transformed to:
await page.screenshot({ path: './report/screenshots/my-screenshot.png' });
```

*Visual Comparison (Baseline Generation):*
```javascript
// User writes:
await expect(page).toHaveScreenshot('homepage.png');

// Automatically handled - baseline stored to S3 and referenced in reports
```

*Recommended Best Practice - testInfo.attach():*
```javascript
// Enhanced script injection for robust reporting:
const screenshot = await page.screenshot();
if (typeof testInfo !== 'undefined') {
  testInfo.attach('Page Screenshot', {
    body: screenshot,
    contentType: 'image/png'
  });
}
// Fallback path-based screenshot for compatibility
await page.screenshot({ path: './report/screenshots/page-screenshot.png' });
```

## Implementation Plan

### Phase 1: Screenshot Detection and Path Management

1. **Enhance `ensureProperTraceConfiguration()`:**
   - Add screenshot step detection regex patterns
   - Inject screenshot directory configuration
   - Update screenshot paths to use execution-specific directories

2. **Update Playwright Config:**
   - Ensure screenshot output directory aligns with report directory
   - Add screenshot-specific configuration if needed

### Phase 2: S3 Upload Enhancement

1. **Verify S3Service Compatibility:**
   - Test existing `uploadDirectory()` with screenshot files
   - Ensure proper content type handling for image files
   - Add logging for screenshot upload tracking

2. **Directory Structure Optimization:**
   - Ensure screenshots are saved to `{runDir}/report-{executionId}/screenshots/`
   - Maintain consistent directory structure for S3 upload

### Phase 3: HTML Report Processing

1. **Extend `_processReportFilesForS3()`:**
   - Add screenshot path replacement patterns
   - Handle various screenshot reference formats in HTML
   - Test with different Playwright reporter outputs

2. **Path Resolution Logic:**
   - Convert absolute paths to relative S3-compatible paths
   - Handle both user-generated and Playwright-generated screenshot references
   - Ensure cross-platform path compatibility

### Phase 4: Visual Comparison Integration

1. **Baseline Screenshot Management:**
   - Implement baseline screenshot storage in S3
   - Create snapshot directory structure for visual regression testing
   - Handle first-run baseline generation and subsequent comparisons

2. **Snapshot Configuration:**
   - Configure Playwright for consistent visual comparison testing
   - Set up snapshot update mechanisms for baseline changes
   - Implement diff image generation and storage

### Phase 5: Testing and Validation

1. **Test Different Screenshot Scenarios:**
   - Manual `page.screenshot()` calls
   - Automatic screenshot on failure
   - Visual comparison screenshots (`toHaveScreenshot()`)
   - Element-specific screenshots (`locator.screenshot()`)
   - Screenshots with testInfo.attach() 
   - Screenshots in different formats (PNG, JPEG)

2. **Validate S3 Integration:**
   - Ensure screenshots upload successfully
   - Verify HTML reports display screenshots correctly
   - Test report accessibility from S3 URLs
   - Validate baseline and diff image storage for visual comparisons

## Default Behavior

**When Screenshot Steps Are Detected:**
1. Automatically configure screenshot output directory to match report directory
2. Upload all screenshots to S3 alongside HTML reports  
3. Process HTML reports to use relative screenshot paths
4. Maintain existing report structure and accessibility

**Backward Compatibility:**
- Existing tests without screenshots continue to work unchanged
- No breaking changes to current S3 upload or report processing
- Graceful handling of missing or failed screenshot uploads

## Configuration Options

### Environment Variables (Optional)
- `PLAYWRIGHT_SCREENSHOT_QUALITY` - JPEG quality for screenshots (default: 90)
- `PLAYWRIGHT_SCREENSHOT_FORMAT` - Default format (default: 'png')
- `DISABLE_SCREENSHOT_S3_UPLOAD` - Skip screenshot upload (default: false)

### Playwright Config Enhancement
```javascript
use: {
  screenshot: {
    mode: 'on',
    dir: './report/screenshots', // Align with report directory
    fullPage: true
  }
}
```

## Success Criteria

1. **Automatic Detection:** Screenshots steps in playground scripts are automatically detected and configured
2. **S3 Integration:** Screenshots are uploaded to S3 alongside HTML reports without manual intervention
3. **Report Integration:** HTML reports display screenshots correctly using relative S3 paths
4. **No Manual Configuration:** Users don't need to modify their scripts or specify paths
5. **Backward Compatibility:** Existing functionality remains unchanged
6. **Error Handling:** Graceful handling of screenshot failures without breaking test execution

## Security Considerations

- Screenshots may contain sensitive information - ensure proper S3 bucket access controls
- Validate screenshot file types to prevent security issues
- Limit screenshot file size to prevent storage abuse
- Use existing S3Service security patterns and authentication

## Monitoring and Logging

- Log screenshot detection and path transformations
- Track screenshot upload success/failure rates  
- Monitor S3 storage usage for screenshot artifacts
- Alert on screenshot processing errors

## Visual Comparison Testing Implementation

### ⚠️ Critical Issue: Baseline Persistence Problem

**Current Problem:**
The existing cleanup services (`playground-cleanup.ts` and `s3-cleanup.ts`) delete ALL objects in playground buckets older than 24 hours. This breaks visual comparison testing because:

1. Baselines are deleted along with reports
2. Visual comparison tests fail on subsequent runs (no baseline to compare against)
3. Users would need to regenerate baselines constantly

### Improved Baseline Management Strategy

**Separate Baseline Storage:**
Visual comparison baselines must be stored separately from ephemeral test reports to survive cleanup cycles.

**New Storage Architecture:**
```
s3://playwright-baselines/ (NEW DEDICATED BUCKET)
├── test-{testId}/
│   ├── baselines/
│   │   ├── homepage-chromium-darwin.png
│   │   ├── homepage-chromium-linux.png
│   │   └── metadata.json (test hash, created date, etc.)
│   └── versions/
│       ├── v1-2024-01-15/
│       └── v2-2024-02-01/

s3://playwright-test-artifacts/ (EPHEMERAL REPORTS - CLEANED UP)
├── {runId}/report/ (DELETED after 24h)
│   ├── index.html
│   ├── screenshots/
│   └── test-results/
│       ├── homepage-chromium-darwin-diff.png (comparison result)
│       ├── homepage-chromium-darwin-actual.png (current run)
│       └── homepage-chromium-darwin-expected.png (baseline copy)
```

**Implementation Strategy:**

1. **Dedicated Baselines Bucket:**
   ```javascript
   // New environment variable
   S3_BASELINES_BUCKET_NAME=playwright-baselines
   
   // Baselines are NEVER cleaned up automatically
   // Only updated when user explicitly updates baselines
   ```

2. **Test-Based Baseline Organization:**
   ```javascript
   // Store baselines by test ID, not run ID
   // This ensures persistence across multiple playground runs
   const baselineKey = `test-${testId}/baselines/${screenshotName}-${browser}-${platform}.png`;
   
   // Include test content hash for invalidation
   const metadata = {
     testId: testId,
     testContentHash: sha256(testScript), // Invalidate when test changes
     createdAt: timestamp,
     browser: 'chromium',
     platform: 'linux'
   };
   ```

3. **Baseline Lifecycle Management:**
   ```javascript
   // Generate baseline on first run
   if (!baselineExists) {
     await uploadBaselineToS3(screenshot, baselineKey);
     return { result: 'baseline_created', message: 'Baseline screenshot generated' };
   }
   
   // Use existing baseline for comparison
   const baseline = await downloadBaselineFromS3(baselineKey);
   const comparisonResult = await compareScreenshots(current, baseline);
   
   // Store diff in ephemeral report (gets cleaned up)
   if (comparisonResult.different) {
     await uploadDiffToReport(comparisonResult.diffImage, reportPath);
   }
   ```

### Smart Baseline Invalidation

**Content-Based Invalidation:**
```javascript
// Invalidate baselines when test script changes significantly
function shouldInvalidateBaseline(testScript, existingMetadata) {
  const currentHash = sha256(normalizeTestScript(testScript));
  const existingHash = existingMetadata.testContentHash;
  
  // Consider changes that affect visual output
  const significantChanges = [
    /goto\s*\(\s*['"][^'"]+['"]\s*\)/, // URL changes
    /viewport\s*:\s*\{[^}]+\}/,        // Viewport changes  
    /setViewportSize/,                  // Viewport size changes
    /click\s*\(/,                      // Interaction changes
    /fill\s*\(/,                       // Form input changes
    /waitFor/,                         // Wait condition changes
  ];
  
  return currentHash !== existingHash;
}

function normalizeTestScript(script) {
  // Normalize script to ignore non-visual changes
  return script
    .replace(/\/\/.*$/gm, '')        // Remove comments
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .replace(/testInfo\.attach.*?;/g, '') // Remove testInfo.attach calls
    .trim();
}
```

**Automatic Baseline Updates:**
```javascript
// Smart baseline update when test changes
if (shouldInvalidateBaseline(testScript, baselineMetadata)) {
  console.log('Test script changed significantly, updating baseline...');
  await archiveExistingBaseline(testId, baselineKey);
  await createNewBaseline(screenshot, testId, baselineKey);
}
```

### Robust S3Service Extension

**New S3Service Methods:**
```javascript
// Add to existing S3Service class
export class S3Service {
  private baselineBucketName: string;
  
  constructor() {
    // ... existing code
    this.baselineBucketName = this.configService.get<string>(
      'S3_BASELINES_BUCKET_NAME',
      'playwright-baselines'
    );
  }

  /**
   * Upload baseline screenshot with metadata
   */
  async uploadBaseline(
    screenshotBuffer: Buffer,
    testId: string,
    screenshotName: string,
    browser: string = 'chromium',
    platform: string = process.platform
  ): Promise<string> {
    const baselineKey = `test-${testId}/baselines/${screenshotName}-${browser}-${platform}.png`;
    
    await this.withRetry(
      () => this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.baselineBucketName,
          Key: baselineKey,
          Body: screenshotBuffer,
          ContentType: 'image/png',
          Metadata: {
            testId: testId,
            screenshotName: screenshotName,
            browser: browser,
            platform: platform,
            createdAt: new Date().toISOString()
          }
        })
      ),
      `Upload baseline ${baselineKey}`
    );

    return baselineKey;
  }

  /**
   * Check if baseline exists for test
   */
  async baselineExists(
    testId: string,
    screenshotName: string,
    browser: string = 'chromium',
    platform: string = process.platform
  ): Promise<boolean> {
    const baselineKey = `test-${testId}/baselines/${screenshotName}-${browser}-${platform}.png`;
    
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.baselineBucketName,
        Key: baselineKey
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Download baseline for comparison
   */
  async downloadBaseline(
    testId: string,
    screenshotName: string,
    browser: string = 'chromium',
    platform: string = process.platform
  ): Promise<Buffer> {
    const baselineKey = `test-${testId}/baselines/${screenshotName}-${browser}-${platform}.png`;
    
    const response = await this.withRetry(
      () => this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.baselineBucketName,
          Key: baselineKey
        })
      ),
      `Download baseline ${baselineKey}`
    );

    const chunks: Buffer[] = [];
    const stream = response.Body as Readable;
    
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
```

### Enhanced Script Injection for Robust Screenshot Handling

**1. Automatic testInfo.attach() Integration:**
```javascript
// Transform user scripts to use best practices automatically:
// Original user code:
await page.screenshot({ path: 'my-screenshot.png' });

// Enhanced transformation:
test('user test', async ({ page }, testInfo) => {
  // User's test code here
  
  // Screenshot handling - both approaches for maximum compatibility:
  const screenshot = await page.screenshot({ fullPage: true });
  
  // Primary: Attach to test report (embedded in HTML report)
  testInfo.attach('Page Screenshot', {
    body: screenshot,
    contentType: 'image/png'
  });
  
  // Secondary: Save to file system (uploaded to S3 as separate file)
  await page.screenshot({ 
    path: './report/screenshots/my-screenshot.png',
    fullPage: true 
  });
});
```

**2. Visual Comparison Enhancement:**
```javascript
// User writes:
await expect(page).toHaveScreenshot();

// Gets enhanced with:
test('visual test', async ({ page }, testInfo) => {
  await page.goto('/');
  
  // Configure visual comparison with tolerances
  await expect(page).toHaveScreenshot({
    maxDiffPixels: 100,
    threshold: 0.2
  });
  
  // On failure, attach diff images to report
  const screenshot = await page.screenshot();
  testInfo.attach('Current Page State', {
    body: screenshot,
    contentType: 'image/png'
  });
});
```

## Advanced Configuration and Best Practices

### Playwright Configuration Enhancement

```javascript
// Enhanced playwright.config.js for robust screenshot handling:
module.exports = defineConfig({
  testDir: testDir,
  fullyParallel: true,
  use: {
    // Screenshot configuration
    screenshot: {
      mode: 'only-on-failure', // or 'on' for all tests
      fullPage: true
    },
    
    // Visual comparison configuration
    expect: {
      // Configure visual comparison tolerances
      toHaveScreenshot: {
        maxDiffPixels: 100,
        threshold: 0.2,
        animationMode: 'disabled' // Prevent animation flakiness
      }
    },
    
    trace: 'on-first-retry',
    video: 'retain-on-failure'
  },
  
  // Reporter configuration for better screenshot integration
  reporter: [
    ['html', { 
      outputFolder: './report',
      attachmentsBaseURL: './attachments/' 
    }],
    ['list']
  ],
  
  // Projects for consistent cross-browser visual testing
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Consistent viewport for visual comparisons
        viewport: { width: 1280, height: 720 }
      }
    }
  ]
});
```

### Script Enhancement Patterns

**1. Smart Screenshot Detection:**
```javascript
// Enhanced ensureProperTraceConfiguration() additions:
const screenshotPatterns = [
  /\.screenshot\s*\(/g,                           // page.screenshot()
  /\.toHaveScreenshot\s*\(/g,                     // expect().toHaveScreenshot()
  /testInfo\.attach\s*\(\s*['"][^'"]*['"],\s*\{/g, // testInfo.attach()
  /\.locator\([^)]+\)\.screenshot\s*\(/g          // locator.screenshot()
];

function detectScreenshotUsage(testScript) {
  return screenshotPatterns.some(pattern => pattern.test(testScript));
}
```

**2. Automatic Best Practice Injection:**
```javascript
function enhanceScreenshotScript(originalScript, testId) {
  if (!detectScreenshotUsage(originalScript)) {
    return originalScript;
  }
  
  // Inject test wrapper with testInfo parameter
  const enhancedScript = `
test('Enhanced Test ${testId.substring(0, 8)}', async ({ page }, testInfo) => {
  // Screenshot helper function for consistent handling
  async function captureAndAttach(name, screenshotOptions = {}) {
    const screenshot = await page.screenshot({ 
      fullPage: true,
      ...screenshotOptions 
    });
    
    // Attach to test report
    testInfo.attach(name, {
      body: screenshot,
      contentType: 'image/png'
    });
    
    // Also save to file for S3 upload
    await page.screenshot({ 
      path: \`./report/screenshots/\${name.toLowerCase().replace(/\\s+/g, '-')}.png\`,
      fullPage: true,
      ...screenshotOptions
    });
    
    return screenshot;
  }
  
  // User's original test code with screenshot enhancements:
  ${originalScript}
});`;
  
  return enhancedScript;
}
```

### S3 Integration Best Practices

**1. Conditional Screenshot Upload:**
```javascript
// In execution.service.ts - enhanced uploadDirectory method
async function uploadScreenshotsToS3(reportDir, entityId, entityType) {
  const screenshotDirs = [
    path.join(reportDir, 'screenshots'),
    path.join(reportDir, 'test-results'), 
    path.join(reportDir, 'attachments')
  ];
  
  for (const dir of screenshotDirs) {
    if (existsSync(dir)) {
      const s3KeyPrefix = `${entityId}/report/${path.basename(dir)}`;
      await this.s3Service.uploadDirectory(
        dir, 
        s3KeyPrefix, 
        this.s3Service.getBucketForEntityType(entityType),
        entityId,
        entityType
      );
    }
  }
}
```

**2. Visual Comparison Baseline Management:**
```javascript
// Baseline screenshot handling in S3Service
async function manageVisualBaselines(entityId, snapshotDir) {
  const baselineBucket = this.getBucketForEntityType('snapshots');
  const s3KeyPrefix = `${entityId}/baselines`;
  
  try {
    // Upload current baselines to S3
    await this.uploadDirectory(snapshotDir, s3KeyPrefix, baselineBucket);
    
    // Store baseline metadata for version tracking
    const metadata = {
      testId: entityId,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      browser: 'chromium'
    };
    
    await this.uploadFile(
      JSON.stringify(metadata),
      `${s3KeyPrefix}/baseline-metadata.json`,
      'application/json',
      baselineBucket
    );
  } catch (error) {
    this.logger.warn(`Failed to upload visual baselines: ${error.message}`);
  }
}
```

### Visual Comparison Implementation Strategy

**Enhanced Playwright Configuration:**
```javascript
// Enhanced playwright.config.js with visual comparison support
module.exports = defineConfig({
  testDir: testDir,
  use: {
    screenshot: 'only-on-failure',
    expect: {
      toHaveScreenshot: {
        maxDiffPixels: 100,
        threshold: 0.2,
        animationMode: 'disabled',
        // Custom baseline handling (disabled - we handle this)
        updateMode: 'none'
      }
    }
  },
  
  // Custom baseline directory (will be overridden by our S3 logic)
  testOptions: {
    baselineDir: './baselines' // Temporary local directory
  }
});
```

**Enhanced Script Processing:**
```javascript
// Updated ensureProperTraceConfiguration with visual comparison support
function enhanceVisualComparisonScript(originalScript, testId) {
  const hasVisualComparison = /toHaveScreenshot\s*\(/.test(originalScript);
  
  if (!hasVisualComparison) {
    return originalScript; // No visual comparison, use existing logic
  }
  
  // Inject custom visual comparison handler
  const enhancedScript = `
test('Visual Test ${testId.substring(0, 8)}', async ({ page }, testInfo) => {
  // Custom visual comparison helper
  async function customToHaveScreenshot(locator, name, options = {}) {
    const screenshotBuffer = await locator.screenshot({ fullPage: true, ...options });
    const screenshotName = name || 'screenshot';
    
    // Check if baseline exists in S3
    const baselineExists = await checkBaselineExists('${testId}', screenshotName);
    
    if (!baselineExists) {
      // First run - create baseline
      await uploadBaseline(screenshotBuffer, '${testId}', screenshotName);
      
      testInfo.attach('Baseline Created: ' + screenshotName, {
        body: screenshotBuffer,
        contentType: 'image/png'
      });
      
      return { pass: true, message: () => 'Baseline screenshot created' };
    }
    
    // Download baseline and compare
    const baseline = await downloadBaseline('${testId}', screenshotName);
    const comparisonResult = await compareScreenshots(screenshotBuffer, baseline);
    
    // Attach all images to report
    testInfo.attach('Current: ' + screenshotName, {
      body: screenshotBuffer,
      contentType: 'image/png'
    });
    
    testInfo.attach('Expected: ' + screenshotName, {
      body: baseline,
      contentType: 'image/png'
    });
    
    if (!comparisonResult.pass) {
      testInfo.attach('Diff: ' + screenshotName, {
        body: comparisonResult.diffBuffer,
        contentType: 'image/png'
      });
    }
    
    return comparisonResult;
  }
  
  // Replace page/locator with our custom implementation
  const originalToHaveScreenshot = expect.extend({
    async toHaveScreenshot(locator, name, options) {
      return await customToHaveScreenshot(locator, name, options);
    }
  });
  
  // User's original test code:
  ${originalScript}
});`;
  
  return enhancedScript;
}
```

## Complete Implementation Summary

### Infrastructure Requirements

**1. New Environment Variables:**
```bash
# Dedicated baseline storage (never cleaned up)
S3_BASELINES_BUCKET_NAME=playwright-baselines

# Optional: Visual comparison settings  
VISUAL_COMPARISON_ENABLED=true
VISUAL_COMPARISON_MAX_DIFF_PIXELS=100
VISUAL_COMPARISON_THRESHOLD=0.2
```

**2. S3 Bucket Strategy:**
```
playwright-baselines/     <- NEW BUCKET (persistent)
├── test-{testId}/
│   ├── baselines/         <- Never deleted
│   └── metadata.json

playwright-test-artifacts/ <- EXISTING BUCKET (ephemeral)  
├── {runId}/report/        <- Cleaned up after 24h
│   ├── screenshots/       <- Attached screenshots
│   └── test-results/      <- Comparison diffs
```

**3. Cleanup Service Updates:**
```javascript
// Update playground-cleanup.ts to exclude baselines bucket
const PROTECTED_BUCKETS = [
  'playwright-baselines' // Never cleanup baselines
];

// Only cleanup ephemeral test artifacts, not baselines
if (PROTECTED_BUCKETS.includes(bucketName)) {
  console.log(`Skipping cleanup for protected bucket: ${bucketName}`);
  return;
}
```

### Key Benefits of This Approach

1. **Persistent Baselines:** Visual comparison baselines survive cleanup cycles
2. **Smart Invalidation:** Baselines update automatically when tests change significantly
3. **Comprehensive Attachment:** All screenshots (baseline, current, diff) attached to reports
4. **Zero Configuration:** Users write standard Playwright visual comparison tests
5. **Robust Storage:** Separate ephemeral reports from persistent baselines
6. **Backward Compatible:** Existing screenshot functionality unchanged

## Success Criteria (Updated)

1. **Baseline Persistence:** Visual comparison baselines persist across test executions and cleanup cycles
2. **Smart Updates:** Baselines automatically update when test logic changes significantly
3. **Complete Reporting:** All screenshots (baseline, current, diff) properly attached to HTML reports
4. **Zero Manual Setup:** Users write standard `toHaveScreenshot()` calls without configuration
5. **Robust Cleanup:** Ephemeral reports cleaned up while preserving baselines
6. **Cross-Platform Support:** Baselines work consistently across different browsers/platforms
7. **Storage Efficiency:** Intelligent baseline organization prevents storage bloat

This enhanced specification solves the critical baseline persistence problem while providing a robust, production-ready visual comparison testing solution that integrates seamlessly with the existing Supercheck platform architecture.