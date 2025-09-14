// AI prompt optimization for Playwright test fixing
interface PromptContext {
  failedScript: string;
  testType: string;
  markdownContent: string;
}

export class AIPromptBuilder {
  static buildMarkdownContextPrompt({
    failedScript,
    testType,
    markdownContent,
  }: PromptContext): string {
    const testTypeInstructions = this.getTestTypeInstructions(testType);
    const optimizedMarkdown = this.optimizeMarkdownContent(markdownContent);
    
    return `You are an expert Playwright test automation engineer specializing in ${testType} testing. 

**TASK**: Fix the failing Playwright test based on the detailed error report below.

**TEST TYPE CONTEXT**:
${testTypeInstructions}

**CURRENT FAILING SCRIPT**:
\`\`\`javascript
${failedScript}
\`\`\`

**DETAILED ERROR REPORT FROM PLAYWRIGHT**:
${optimizedMarkdown}

**FIXING GUIDELINES**:
1. **Preserve Intent**: Keep the original test logic and assertions intact
2. **Target Root Cause**: Fix only the specific issues mentioned in the error report
3. **Use Best Practices**: Apply Playwright best practices for reliability
4. **Minimal Changes**: Make the smallest changes necessary to fix the issue
5. **Add Comments**: Include brief inline comments explaining significant changes
6. **Maintain Structure**: Keep the existing test structure and variable names

**COMMON FIX PATTERNS**:
- Selector issues: Use more robust selectors (data-testid, role-based)
- Timing issues: Add proper waits (waitForSelector, waitForResponse)
- Element interaction: Ensure elements are visible/enabled before interaction
- Assertion problems: Use appropriate Playwright assertions with proper timeouts

**RESPONSE FORMAT**:
Respond with EXACTLY this structure:

FIXED_SCRIPT:
\`\`\`javascript
[Your complete fixed test script here]
\`\`\`

EXPLANATION:
[Brief explanation of what was changed and why - focus on the specific fixes made]

**IMPORTANT**: Return only valid, executable Playwright test code. Do not include test runners, imports, or setup code unless they were part of the original script.`;
  }

  // Build a basic prompt when detailed markdown reports aren't available
  static buildBasicFixPrompt({
    failedScript,
    testType,
    reason,
  }: {
    failedScript: string;
    testType: string;
    reason: string;
  }): string {
    const testTypeInstructions = this.getTestTypeInstructions(testType);
    
    return `You are an expert Playwright test automation engineer specializing in ${testType} testing.

**TASK**: Analyze and improve the failing Playwright test script below.

**CONTEXT**: ${reason}

**TEST TYPE**: ${testType}
${testTypeInstructions}

**CURRENT SCRIPT**:
\`\`\`javascript
${failedScript}
\`\`\`

**ANALYSIS GUIDELINES**:
Since detailed error reports aren't available, please:
1. **Review Common Issues**: Look for typical Playwright problems (selectors, timing, assertions)
2. **Apply Best Practices**: Improve the script with Playwright best practices
3. **Add Robustness**: Include proper waits and error handling
4. **Maintain Intent**: Keep the original test logic and purpose
5. **Add Comments**: Explain any significant improvements made

**COMMON IMPROVEMENTS TO CONSIDER**:
- Replace brittle selectors with robust ones (data-testid, role-based)
- Add proper waits (waitForSelector, waitForLoadState)
- Use Playwright assertions instead of generic ones
- Add error handling for unreliable interactions
- Improve element interaction patterns

**RESPONSE FORMAT**:
FIXED_SCRIPT:
\`\`\`javascript
[Your improved test script here]
\`\`\`

EXPLANATION:
[Brief explanation of the improvements made to enhance test reliability]

**IMPORTANT**: Return only valid, executable Playwright test code.`;
  }

  private static getTestTypeInstructions(testType: string): string {
    switch (testType.toLowerCase()) {
      case 'browser':
        return `This is a browser automation test. Focus on:
- Element selectors and interactions
- Page navigation and loading
- Visual elements and user interface testing
- Form submissions and user workflows`;

      case 'api':
        return `This is an API test. Focus on:
- HTTP request/response handling
- Status codes and response validation
- Request headers and payloads
- Authentication and authorization`;

      case 'database':
        return `This is a database test. Focus on:
- Database connections and queries
- Data validation and integrity
- Transaction handling
- Database state verification`;

      case 'custom':
        return `This is a custom test scenario. Focus on:
- Understanding the specific test context
- Maintaining custom logic and patterns
- Preserving any specialized testing approaches`;

      default:
        return `Focus on understanding the test context and maintaining the original testing approach while fixing the specific issues identified.`;
    }
  }

  private static optimizeMarkdownContent(markdownContent: string): string {
    // Optimize markdown for token efficiency while preserving critical information
    const lines = markdownContent.split('\n');
    const importantSections = [];
    
    let currentSection = '';
    let isImportantSection = false;
    
    for (const line of lines) {
      // Identify important sections
      if (line.match(/^#+\s*(error|fail|instruction|detail|stack|exception)/i)) {
        isImportantSection = true;
        if (currentSection) {
          importantSections.push(currentSection);
        }
        currentSection = line + '\n';
      } else if (line.match(/^#+\s/)) {
        isImportantSection = false;
        if (currentSection) {
          importantSections.push(currentSection);
        }
        currentSection = '';
      } else if (isImportantSection || line.includes('Error:') || line.includes('✗') || line.includes('Failed:')) {
        currentSection += line + '\n';
      }
    }
    
    if (currentSection) {
      importantSections.push(currentSection);
    }
    
    // Join important sections and truncate if too long
    let optimized = importantSections.join('\n').trim();
    
    // Truncate if content is too long (preserve first and last parts)
    if (optimized.length > 8000) {
      const firstPart = optimized.substring(0, 4000);
      const lastPart = optimized.substring(optimized.length - 4000);
      optimized = firstPart + '\n\n[... truncated for brevity ...]\n\n' + lastPart;
    }
    
    return optimized || markdownContent; // Fallback to original if optimization fails
  }

  // Generate contextual guidance for non-fixable issues
  static generateGuidanceMessage(reason: string): string {
    const basePrefix = `**AI Analysis Complete**\n\nThis test failure requires manual investigation rather than automated code fixes.\n\n**Detected Issue**: `;
    
    switch (reason) {
      case 'network_issues':
        return basePrefix +
          `🌐 Network Connectivity Problem\n\n` +
          `**Next Steps:**\n` +
          `• Check service endpoints and network connectivity\n` +
          `• Verify API server status and availability\n` +
          `• Review network configuration and firewall settings\n` +
          `• Test API endpoints manually using tools like Postman\n` +
          `• Check for service outages or maintenance windows\n\n` +
          `**Tip**: Network issues typically resolve once the underlying service is restored.`;
      
      case 'authentication_failures':
        return basePrefix +
          `🔐 Authentication System Issue\n\n` +
          `**Next Steps:**\n` +
          `• Verify user credentials and account status\n` +
          `• Check authentication service availability\n` +
          `• Review session management and token expiration\n` +
          `• Test login process manually\n` +
          `• Contact system administrators if credentials need updating.\n\n` +
          `**Tip**: Authentication issues often require coordination with security teams.`;
      
      case 'infrastructure_down':
        return basePrefix +
          `🏗️ Infrastructure Unavailability\n\n` +
          `**Next Steps:**\n` +
          `• Check system status dashboards and monitoring\n` +
          `• Verify database and service connectivity\n` +
          `• Review deployment and maintenance schedules\n` +
          `• Contact DevOps or infrastructure teams\n` +
          `• Monitor service restoration progress\n\n` +
          `**Tip**: Infrastructure issues require system administrator intervention.`;
      
      case 'data_issues':
        return basePrefix +
          `📊 Test Data Problems\n\n` +
          `**Next Steps:**\n` +
          `• Verify test data setup and database state\n` +
          `• Check for missing or corrupted test records\n` +
          `• Review data seeding and migration scripts\n` +
          `• Validate database connections and permissions\n` +
          `• Reset test environment if necessary\n\n` +
          `**Tip**: Data issues often require database administration or test data refresh.`;
      
      case 'complex_issue':
        return basePrefix +
          `🔍 Complex Issue Detected\n\n` +
          `**Next Steps:**\n` +
          `• Review the detailed failure report below\n` +
          `• Check browser console for additional errors\n` +
          `• Run test in debug mode for step-by-step analysis\n` +
          `• Compare with recent successful test runs\n` +
          `• Consider breaking complex scenarios into smaller tests\n\n` +
          `**Tip**: Complex issues may require deeper investigation or test refactoring.`;
      
      case 'markdown_not_available':
        return basePrefix +
          `📄 Report Generation Issue\n\n` +
          `**Next Steps:**\n` +
          `• Ensure tests are configured to generate failure reports\n` +
          `• Check Playwright configuration includes proper reporters\n` +
          `• Verify test execution completed (wasn't interrupted)\n` +
          `• Review test execution logs for errors\n` +
          `• Try running the test again\n\n` +
          `**Tip**: AI analysis requires detailed failure reports to provide fixes.`;
      
      case 'api_error':
        return basePrefix +
          `⚡ Service Temporarily Unavailable\n\n` +
          `**Next Steps:**\n` +
          `• Wait a moment and try the AI fix again\n` +
          `• Check network connectivity\n` +
          `• Review test failure details manually\n` +
          `• Try running the test again to get fresh results\n` +
          `• Contact support if issue persists\n\n` +
          `**Tip**: Most service issues resolve quickly with a retry.`;
      
      default:
        return basePrefix +
          `📋 General Next Steps\n\n` +
          `**Actions to Take:**\n` +
          `• Review the complete error message and context\n` +
          `• Check if this is a new or recurring issue\n` +
          `• Verify test environment setup\n` +
          `• Run the test locally if possible\n` +
          `• Document findings for future reference\n\n` +
          `**Tip**: Consider reaching out to your team for additional insights.`;
    }
  }
}