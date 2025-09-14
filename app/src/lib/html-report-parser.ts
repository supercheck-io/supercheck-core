// HTML report parser for extracting test failure information
import { JSDOM } from 'jsdom';

export interface ExtractedTestError {
  message: string;
  details: string;
  lineNumber?: number;
  testName: string;
  stackTrace?: string;
  source: 'html' | 'markdown';
}

export interface ParsedHTMLReport {
  errors: ExtractedTestError[];
  testName: string;
  duration: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  browser?: string;
  totalTests: number;
  failedTests: number;
}

export class HTMLReportParser {

  /**
   * Parse HTML report content to extract error information
   * This serves as fallback when markdown reports are not available (API/DB tests)
   */
  static async parseHTMLReport(htmlContent: string): Promise<ParsedHTMLReport> {
    try {
      const dom = new JSDOM(htmlContent);
      const document = dom.window.document;

      // Extract basic test information
      const testName = this.extractTestName(document);
      const duration = this.extractTestDuration(document);
      const status = this.extractTestStatus(document);
      const browser = this.extractBrowserInfo(document);
      const { totalTests, failedTests } = this.extractTestCounts(document);

      // Extract error information
      const errors = this.extractErrors(document, testName);

      return {
        errors,
        testName,
        duration,
        status,
        browser,
        totalTests,
        failedTests,
      };
    } catch (error) {
      console.error('Failed to parse HTML report:', error);
      throw new Error(`HTML report parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract test name from HTML report
   */
  private static extractTestName(document: Document): string {
    // Try different selectors for test name
    const selectors = [
      'h1', // Main heading
      '.test-title',
      '[data-testid="test-title"]',
      '.test-name',
      '.suite-title'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    // Fallback to page title
    const title = document.querySelector('title');
    return title?.textContent?.trim() || 'Unknown Test';
  }

  /**
   * Extract test duration from HTML report
   */
  private static extractTestDuration(document: Document): string {
    // Look for duration information
    const durationSelectors = [
      '.test-duration',
      '.duration',
      '[data-testid="duration"]'
    ];

    for (const selector of durationSelectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    // Try to extract from text content
    const bodyText = document.body?.textContent || '';
    const durationMatch = bodyText.match(/(\d+\.?\d*)\s*(ms|s|seconds?|minutes?)/i);
    return durationMatch ? durationMatch[0] : 'Unknown';
  }

  /**
   * Extract test status from HTML report
   */
  private static extractTestStatus(document: Document): 'passed' | 'failed' | 'skipped' | 'flaky' {
    const bodyText = document.body?.textContent?.toLowerCase() || '';

    // Check for status indicators
    if (bodyText.includes('failed') || bodyText.includes('error')) {
      return 'failed';
    }
    if (bodyText.includes('skipped')) {
      return 'skipped';
    }
    if (bodyText.includes('flaky')) {
      return 'flaky';
    }
    if (bodyText.includes('passed') || bodyText.includes('success')) {
      return 'passed';
    }

    // Check status classes or attributes
    const statusElement = document.querySelector('.status, [data-status], .test-status');
    if (statusElement) {
      const status = statusElement.textContent?.toLowerCase() ||
                   statusElement.getAttribute('data-status')?.toLowerCase() ||
                   statusElement.className.toLowerCase();

      if (status.includes('fail')) return 'failed';
      if (status.includes('pass')) return 'passed';
      if (status.includes('skip')) return 'skipped';
      if (status.includes('flaky')) return 'flaky';
    }

    return 'failed'; // Default to failed if we can't determine
  }

  /**
   * Extract browser information from HTML report
   */
  private static extractBrowserInfo(document: Document): string | undefined {
    const bodyText = document.body?.textContent || '';

    // Look for browser mentions
    const browserMatch = bodyText.match(/(chromium|chrome|firefox|webkit|safari|edge)/i);
    return browserMatch ? browserMatch[1] : undefined;
  }

  /**
   * Extract test counts from HTML report
   */
  private static extractTestCounts(document: Document): { totalTests: number; failedTests: number } {
    const bodyText = document.body?.textContent || '';

    // Try to extract test counts
    const allMatch = bodyText.match(/All\s+(\d+)/i);
    const failedMatch = bodyText.match(/Failed\s+(\d+)/i);

    const totalTests = allMatch ? parseInt(allMatch[1]) : 1;
    const failedTests = failedMatch ? parseInt(failedMatch[1]) : 1; // Default to 1 if we're parsing a failure report

    return { totalTests, failedTests };
  }

  /**
   * Extract error information from HTML report
   */
  private static extractErrors(document: Document, testName: string): ExtractedTestError[] {
    const errors: ExtractedTestError[] = [];

    // Look for error sections with expanded selectors for Playwright reports
    const errorSelectors = [
      '.error',
      '.failure',
      '.test-error',
      '[data-testid="error"]',
      '.errors',
      '.call-log',
      '.test-result-error',
      '.playwright-error',
      '.step-error',
      '.attachment-body', // Playwright attachments often contain error details
      'pre', // Playwright often uses pre tags for error output
      'code', // Code blocks may contain stack traces
      '[class*="error"]', // Any class containing "error"
      '[class*="fail"]'   // Any class containing "fail"
    ];

    for (const selector of errorSelectors) {
      const errorElements = document.querySelectorAll(selector);

      errorElements.forEach(element => {
        const textContent = element.textContent?.trim();
        if (textContent && textContent.length > 10) { // Avoid short/empty text
          const error = this.parseErrorElement(element, testName);
          if (error) {
            errors.push(error);
          }
        }
      });
    }

    // Enhanced body text parsing for common Playwright error patterns
    if (errors.length === 0) {
      const bodyText = document.body?.textContent || '';

      // Look for specific error patterns in the body
      const errorPatterns = [
        /Error:/i,
        /TimeoutError:/i,
        /Failed:/i,
        /AssertionError:/i,
        /TypeError:/i,
        /ReferenceError:/i,
        /Test timeout/i,
        /expect\(.*?\)\.(not\.)?to/i,
        /locator.*not found/i,
        /waiting for selector/i,
        /element is not.*visible/i,
        /response status.*not ok/i
      ];

      let foundError = false;
      for (const pattern of errorPatterns) {
        if (pattern.test(bodyText)) {
          foundError = true;
          break;
        }
      }

      if (foundError || bodyText.toLowerCase().includes('✗') || bodyText.toLowerCase().includes('failed')) {
        // Try to extract specific error lines
        const lines = bodyText.split('\n');
        const errorLines = lines.filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 0 && (
            /Error:/i.test(trimmed) ||
            /Failed:/i.test(trimmed) ||
            /Timeout/i.test(trimmed) ||
            /expect/i.test(trimmed) ||
            /✗/.test(trimmed) ||
            /×/.test(trimmed)
          );
        });

        const errorMessage = errorLines.length > 0
          ? errorLines[0].trim()
          : this.extractErrorMessage(bodyText);

        errors.push({
          message: errorMessage,
          details: this.truncateText(bodyText, 2000), // Increased limit for better context
          testName,
          source: 'html'
        });
      }
    }

    return errors;
  }

  /**
   * Parse individual error element
   */
  private static parseErrorElement(element: Element, testName: string): ExtractedTestError | null {
    const textContent = element.textContent?.trim() || '';

    if (textContent.length < 10) {
      return null; // Skip short/empty content
    }

    // Extract error message
    const message = this.extractErrorMessage(textContent);

    // Extract line number if present
    const lineMatch = textContent.match(/line\s+(\d+)|:(\d+):/i);
    const lineNumber = lineMatch ? parseInt(lineMatch[1] || lineMatch[2]) : undefined;

    // Extract stack trace
    const stackTrace = this.extractStackTrace(textContent);

    return {
      message,
      details: this.truncateText(textContent, 1000),
      lineNumber,
      testName,
      stackTrace,
      source: 'html'
    };
  }

  /**
   * Extract error message from text
   */
  private static extractErrorMessage(text: string): string {
    // Look for common error patterns
    const errorPatterns = [
      /TimeoutError:\s*([^\n]+)/i,
      /Error:\s*([^\n]+)/i,
      /Failed:\s*([^\n]+)/i,
      /Exception:\s*([^\n]+)/i,
      /AssertionError:\s*([^\n]+)/i
    ];

    for (const pattern of errorPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    // Fallback to first non-empty line
    const lines = text.split('\n').filter(line => line.trim());
    return lines[0]?.trim() || 'Unknown error';
  }

  /**
   * Extract stack trace from error text
   */
  private static extractStackTrace(text: string): string | undefined {
    const lines = text.split('\n');
    const stackLines = lines.filter(line =>
      line.trim().startsWith('at ') ||
      line.includes('.js:') ||
      line.includes('.ts:') ||
      line.includes('spec.js:')
    );

    return stackLines.length > 0 ? stackLines.join('\n') : undefined;
  }

  /**
   * Truncate text to specified length
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + '...[truncated]';
  }

  /**
   * Convert HTML errors to markdown-like format for AI processing
   */
  static convertErrorsToMarkdownFormat(parsedReport: ParsedHTMLReport): string {
    const { errors, testName, duration, status, browser, totalTests, failedTests } = parsedReport;

    let markdown = `# Test Report: ${testName}\n\n`;
    markdown += `**Status**: ${status}\n`;
    markdown += `**Duration**: ${duration}\n`;
    if (browser) {
      markdown += `**Browser**: ${browser}\n`;
    }
    markdown += `**Tests**: ${failedTests}/${totalTests} failed\n\n`;

    if (errors.length > 0) {
      markdown += `## Errors\n\n`;

      errors.forEach((error, index) => {
        markdown += `### Error ${index + 1}\n\n`;
        markdown += `**Message**: ${error.message}\n\n`;

        if (error.lineNumber) {
          markdown += `**Line**: ${error.lineNumber}\n\n`;
        }

        if (error.stackTrace) {
          markdown += `**Stack Trace**:\n\`\`\`\n${error.stackTrace}\n\`\`\`\n\n`;
        }

        markdown += `**Details**:\n\`\`\`\n${error.details}\n\`\`\`\n\n`;
        markdown += `---\n\n`;
      });
    }

    return markdown;
  }
}