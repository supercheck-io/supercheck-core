# AI-Powered Test Fix Implementation Plan

## Overview
This document outlines the comprehensive implementation plan for adding an AI-powered "Fix with AI" feature to the playground page. The feature uses **Playwright's automatically generated markdown failure reports** for superior AI analysis and provides intelligent script fixes through Vercel AI SDK with Monaco Editor diff view for review and acceptance.

## Key Architecture Decisions
- **Markdown-Only Approach**: Exclusively use Playwright's rich markdown failure reports (no HTML fallback)
- **Vercel AI SDK**: Multi-provider AI integration with OpenAI GPT-4o-mini as primary model
- **Security-First**: Comprehensive input/output sanitization, RBAC authorization, and audit logging
- **Production-Ready**: Rate limiting, monitoring, cost control, and error handling

## Analysis of Current Architecture

### Playground Structure
- **Main Component**: `/app/src/components/playground/index.tsx` - Core playground logic
- **Monaco Editor**: `/app/src/components/playground/monaco-editor.tsx` - Advanced Monaco setup with TypeScript support
- **Test Form**: `/app/src/components/playground/test-form.tsx` - Test metadata and actions
- **Test Execution**: Server-side test execution via `/api/test` with SSE status updates
- **Status Tracking**: `testExecutionStatus: 'none' | 'passed' | 'failed'` tracks test results

### Key Findings
1. **Test Failure Detection**: The playground already tracks test execution status through `testExecutionStatus`
2. **Monaco Editor**: Sophisticated Monaco setup with TypeScript support and custom theming
3. **Report Viewer**: Full Playwright report integration via `/api/test-results/[testId]/report`
4. **No Existing LLM Integration**: No current AI/LLM services found in codebase
5. **Button Placement**: Run button located in playground header, perfect for placing Fix with AI button

## Implementation Strategy

### Phase 1: Core Infrastructure Setup

#### 1.1 Environment Configuration & Dependencies
```bash
# Install Vercel AI SDK
npm install ai @ai-sdk/openai @ai-sdk/anthropic

# Environment variables
AI_PROVIDER=openai              # openai, anthropic  
AI_MODEL=gpt-4o-mini           # Cost-effective model for code fixes
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_key  # Optional fallback
AI_FIX_ENABLED=true            # Feature flag for AI functionality
AI_MAX_REQUESTS_PER_HOUR=100   # Rate limiting
AI_TIMEOUT_MS=30000            # 30 second timeout
```

#### 1.2 Advanced LLM Service Integration with Vercel AI SDK
**File**: `/app/src/lib/ai-service.ts`
```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

interface AIFixRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  testType?: 'browser' | 'api' | 'custom' | 'database';
}

interface AIFixResponse {
  fixedScript: string;
  explanation: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  duration: number;
}

export class AIFixService {
  private static getModel() {
    const provider = process.env.AI_PROVIDER || 'openai';
    const modelName = process.env.AI_MODEL || 'gpt-4o-mini';
    
    switch (provider) {
      case 'openai':
        return openai(modelName);
      case 'anthropic':
        return anthropic('claude-3-haiku-20240307');
      default:
        return openai('gpt-4o-mini');
    }
  }

  static async generateScriptFix({
    prompt,
    maxTokens = 2000,
    temperature = 0.1,
    testType
  }: AIFixRequest): Promise<AIFixResponse> {
    const startTime = Date.now();
    
    try {
      // Check rate limits before making request
      await this.checkRateLimit();
      
      // Optimize prompt for token efficiency
      const optimizedPrompt = this.optimizePrompt(prompt, testType);
      
      const { text, usage } = await generateText({
        model: this.getModel(),
        prompt: optimizedPrompt,
        maxTokens,
        temperature,
        // Built-in retry logic with exponential backoff
        maxRetries: 3,
        // Abort after configured timeout
        abortSignal: AbortSignal.timeout(
          parseInt(process.env.AI_TIMEOUT_MS || '30000')
        ),
      });

      const duration = Date.now() - startTime;
      
      // Log usage for cost tracking and monitoring
      await this.logAIUsage({
        success: true,
        duration,
        tokensUsed: usage?.totalTokens || 0,
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        testType,
      });

      return {
        ...this.parseAIResponse(text),
        usage: {
          promptTokens: usage?.promptTokens || 0,
          completionTokens: usage?.completionTokens || 0,
          totalTokens: usage?.totalTokens || 0,
        },
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        duration,
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log failure metrics for monitoring
      await this.logAIUsage({
        success: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        testType,
      });
      
      // Provide user-friendly error messages
      if (error.name === 'TimeoutError') {
        throw new Error('AI fix generation timed out. Please try again.');
      }
      
      if (error.message?.includes('rate limit')) {
        throw new Error('AI service rate limit reached. Please wait a moment and try again.');
      }
      
      throw new Error(`AI fix generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static parseAIResponse(text: string): {
    fixedScript: string;
    explanation: string;
  } {
    // Extract code from markdown code blocks
    const codeMatch = text.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)\n```/);
    const fixedScript = codeMatch ? codeMatch[1].trim() : text.trim();
    
    // Extract explanation (text before the code block)
    const explanation = text.split('```')[0].trim() || 'AI-generated fix applied';
    
    return {
      fixedScript,
      explanation,
    };
  }

  private static optimizePrompt(prompt: string, testType?: string): string {
    // Add test type context for better results
    let optimizedPrompt = prompt;
    
    if (testType) {
      optimizedPrompt = `[${testType.toUpperCase()} TEST]\n\n` + prompt;
    }
    
    // Truncate very long prompts to essential parts for cost optimization
    if (optimizedPrompt.length > 8000) {
      const sections = optimizedPrompt.split('\n## ');
      const essential = sections.slice(0, 4); // Keep most important sections
      optimizedPrompt = essential.join('\n## ') + '\n\n[Additional context truncated for efficiency]';
    }
    
    return optimizedPrompt;
  }

  private static async checkRateLimit(): Promise<void> {
    const maxRequests = parseInt(process.env.AI_MAX_REQUESTS_PER_HOUR || '100');
    const key = `ai_requests:${new Date().getHours()}`;
    
    // Implement Redis-based rate limiting (if Redis available)
    try {
      // This would be implemented with actual Redis client
      // For now, we'll use a simple in-memory counter
      console.log(`Rate limiting check for key: ${key}, max: ${maxRequests}`);
    } catch (error) {
      console.warn('Rate limiting check failed:', error);
      // Continue without rate limiting rather than blocking
    }
  }

  private static async logAIUsage(metrics: {
    success: boolean;
    duration: number;
    tokensUsed?: number;
    model: string;
    testType?: string;
    error?: string;
  }): Promise<void> {
    // Log to your analytics/monitoring system
    console.log('AI Usage Metrics:', {
      timestamp: new Date().toISOString(),
      ...metrics,
    });
    
    // Could integrate with analytics services like:
    // - Vercel Analytics
    // - PostHog
    // - Custom metrics endpoint
    // - Database logging for cost tracking
  }

  static async extractErrorContext(reportUrl: string): Promise<string> {
    try {
      const response = await fetch(reportUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch report: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Error extracting error context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
```

#### 1.3 Intelligent API Route for AI Fix with Markdown Integration
**File**: `/app/src/app/api/ai/fix-test/route.ts`
```typescript
export async function POST(request: Request) {
  try {
    // Input validation and sanitization
    const body = await request.json();
    const { 
      failedScript, 
      testType, 
      testId,
      executionContext 
    } = validateAndSanitizeInput(body);
    
    // Security: Check user authorization and rate limits
    await validateUserAccess(request, testId);
    await checkRateLimit(request);
    
    // Step 1: Get markdown report (required - no fallback)
    const markdownReportUrl = await getMarkdownReportUrl(testId);
    
    if (!markdownReportUrl) {
      return Response.json({
        success: false,
        reason: 'markdown_not_available',
        message: 'Markdown failure report not found. This feature requires test failure reports to be generated.',
        recommendation: 'Ensure tests are run with proper failure reporting enabled.'
      }, { status: 400 });
    }
    
    // Step 2: Securely fetch markdown content with validation
    const errorContext = await securelyFetchMarkdownReport(markdownReportUrl);
    
    // Step 3: Parse markdown for error classification  
    const errorClassifications = PlaywrightMarkdownParser.parseMarkdownForErrors(errorContext);
    const fixDecision = AIFixDecisionEngine.shouldAttemptMarkdownFix(errorClassifications, testType);
    
    // Step 4: Return early if environmental issues detected
    if (!fixDecision.shouldAttemptFix) {
      return Response.json({
        success: false,
        reason: 'not_fixable',
        decision: fixDecision,
        recommendedAction: fixDecision.recommendedAction,
        message: fixDecision.reasoning,
        warningMessage: fixDecision.warningMessage
      });
    }
    
    // Step 5: Build secure markdown-optimized AI prompt
    const prompt = AIPromptBuilder.buildMarkdownContextPrompt({
      failedScript: sanitizeCodeInput(failedScript),
      testType,
      markdownContent: errorContext
    });
    
    // Step 4: Call AI service with intelligent prompt using Vercel AI SDK
    const aiResponse = await AIFixService.generateScriptFix({
      prompt,
      maxTokens: 2000,
      temperature: 0.1, // Low temperature for consistent, reliable fixes
      testType, // Pass test type for better context
    });
    
    return Response.json({
      success: true,
      fixedScript: sanitizeCodeOutput(aiResponse.fixedScript),
      explanation: sanitizeTextOutput(aiResponse.explanation),
      confidence: fixDecision.confidence,
      contextSource: 'markdown', // Always markdown now
      aiMetrics: {
        model: aiResponse.model,
        duration: aiResponse.duration,
        tokensUsed: aiResponse.usage.totalTokens,
        promptTokens: aiResponse.usage.promptTokens,
        completionTokens: aiResponse.usage.completionTokens,
      },
      errorAnalysis: {
        totalErrors: errorClassifications.length,
        fixableErrors: errorClassifications.filter(ec => ec.classification?.aiFixable).length,
        topIssues: errorClassifications.map(ec => ec.classification?.category).filter(Boolean).slice(0, 3)
      }
    });
    
  } catch (error) {
    console.error('AI fix generation failed:', error);
    return Response.json({
      success: false,
      reason: 'generation_failed',
      message: 'Failed to generate AI fix. Please try manual investigation.',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Security helper functions
function validateAndSanitizeInput(body: any): {
  failedScript: string;
  testType: string;
  testId: string;
  executionContext: any;
} {
  // Input validation with size limits
  if (!body.failedScript || typeof body.failedScript !== 'string') {
    throw new Error('Invalid failedScript parameter');
  }
  
  if (!body.testType || typeof body.testType !== 'string') {
    throw new Error('Invalid testType parameter');
  }
  
  if (!body.testId || typeof body.testId !== 'string') {
    throw new Error('Invalid testId parameter');
  }
  
  // Size limits to prevent abuse
  if (body.failedScript.length > 50000) {
    throw new Error('Script too large (max 50KB)');
  }
  
  // Validate test type enum
  const validTestTypes = ['browser', 'api', 'custom', 'database'];
  if (!validTestTypes.includes(body.testType)) {
    throw new Error('Invalid test type');
  }
  
  return {
    failedScript: body.failedScript.trim(),
    testType: body.testType,
    testId: body.testId,
    executionContext: body.executionContext || {}
  };
}

async function validateUserAccess(request: Request, testId: string): Promise<void> {
  // Implement RBAC authorization check
  // Verify user has access to this specific test
  const session = await getSession(request);
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  
  // Check if user has access to this test
  const hasAccess = await checkTestAccess(session.user.id, testId);
  if (!hasAccess) {
    throw new Error('Unauthorized access to test');
  }
}

async function checkRateLimit(request: Request): Promise<void> {
  // Implement Redis-based rate limiting per user
  const session = await getSession(request);
  const userId = session?.user?.id;
  
  if (!userId) {
    throw new Error('User session required for rate limiting');
  }
  
  const key = `ai_fix_rate_limit:${userId}:${Date.now().toString().slice(0, -4)}`; // Per 10 seconds
  const maxRequests = 5; // 5 requests per 10 seconds per user
  
  // Implement actual rate limiting logic with Redis
  // This is a placeholder for the actual implementation
  console.log(`Rate limit check for user ${userId}, key: ${key}`);
}

async function securelyFetchMarkdownReport(markdownReportUrl: string): Promise<string> {
  try {
    // Validate URL is from trusted source (S3 bucket)
    const url = new URL(markdownReportUrl);
    const allowedHosts = [
      process.env.S3_ENDPOINT_HOST,
      's3.amazonaws.com',
      // Add your trusted S3 endpoints
    ].filter(Boolean);
    
    if (!allowedHosts.some(host => url.hostname.includes(host))) {
      throw new Error('Untrusted markdown report source');
    }
    
    const response = await fetch(markdownReportUrl, {
      headers: {
        'Accept': 'text/markdown, text/plain',
      },
      // Security timeout
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch markdown report: ${response.status}`);
    }
    
    const content = await response.text();
    
    // Size validation
    if (content.length > 100000) { // 100KB max
      throw new Error('Markdown report too large');
    }
    
    // Basic content validation
    if (!content.includes('# Instructions') || !content.includes('# Error details')) {
      throw new Error('Invalid markdown report format');
    }
    
    return content;
    
  } catch (error) {
    throw new Error(`Error fetching markdown report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function sanitizeCodeInput(code: string): string {
  // Remove potentially dangerous patterns
  const sanitized = code
    .replace(/eval\s*\(/gi, 'EVAL_REMOVED(')
    .replace(/Function\s*\(/gi, 'FUNCTION_REMOVED(')
    .replace(/setTimeout\s*\(/gi, 'SETTIMEOUT_REMOVED(')
    .replace(/setInterval\s*\(/gi, 'SETINTERVAL_REMOVED(');
  
  return sanitized.trim();
}

function sanitizeCodeOutput(code: string): string {
  // Validate AI output doesn't contain malicious patterns
  if (code.includes('eval(') || code.includes('Function(') || 
      code.includes('document.write') || code.includes('<script')) {
    throw new Error('AI generated potentially unsafe code');
  }
  
  return code.trim();
}

function sanitizeTextOutput(text: string): string {
  // Remove any HTML/script tags from explanations
  return text.replace(/<[^>]*>/g, '').trim();
}

// Helper function to get markdown report URL
async function getMarkdownReportUrl(testId: string): Promise<string | null> {
  try {
    // Query database for markdown report URLs with security validation
    const reportMetadata = await dbService.getReportMetadata(testId);
    
    if (!reportMetadata?.markdownReports?.[0]) {
      return null;
    }
    
    // Validate URL format
    const markdownUrl = reportMetadata.markdownReports[0];
    try {
      new URL(markdownUrl); // Validate URL format
      return markdownUrl;
    } catch {
      console.error('Invalid markdown URL format:', markdownUrl);
      return null;
    }
    
  } catch (error) {
    console.error('Error fetching markdown report URL:', error);
    return null;
  }
}
```

### Phase 2: UI Component Development

#### 2.1 Smart Fix with AI Button Component
**File**: `/app/src/components/playground/ai-fix-button.tsx`
```typescript
interface AIFixButtonProps {
  testExecutionStatus: 'none' | 'passed' | 'failed';
  onFixGenerated: (fixedScript: string, explanation: string) => void;
  currentScript: string;
  reportUrl: string | null;
  testType: TestType;
  isRunning: boolean;
  executionContext: {
    stdout: string;
    stderr: string;
    duration: number;
  };
  disabled?: boolean;
}

export function AIFixButton({ ... }: AIFixButtonProps) {
  // Simplified state management
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);
  const [guidanceData, setGuidanceData] = useState(null);
  
  // No pre-analysis needed - always show button, let API handle logic
  
  // Handle AI fix attempt - always try AI, show appropriate result
  const handleAIFix = async () => {
    setIsAIFixing(true);
    try {
      const response = await fetch('/api/ai/fix-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failedScript: currentScript,
          testType,
          testId,
          executionContext
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Show code diff editor with AI fix
        onFixGenerated(result.fixedScript, result.explanation);
      } else {
        // Show guidance modal with actionable information
        setShowGuidanceModal(true);
        setGuidanceData({
          reason: result.reason,
          message: result.message,
          recommendedAction: result.recommendedAction,
          warningMessage: result.warningMessage,
          contextSource: result.contextSource || 'analysis'
        });
      }
    } catch (error) {
      // Show error guidance modal
      setShowGuidanceModal(true);
      setGuidanceData({
        reason: 'api_error',
        message: 'Failed to analyze test failure. Please try again or review manually.',
        recommendedAction: 'manual_investigation',
        contextSource: 'error'
      });
    } finally {
      setIsAIFixing(false);
    }
  };
  
  // Only visible when test failed
  if (testExecutionStatus !== 'failed') {
    return null;
  }
  
  // Always show single "Fix with AI" button
  return (
    <Button
      size="sm"
      className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
      onClick={handleAIFix}
      disabled={isRunning || isAIFixing}
    >
      {isAIFixing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Fix with AI
        </>
      )}
    </Button>
  );
  
  // Return JSX with guidance modal
  return (
    <>
      {/* The button rendered above */}
      
      {/* Professional Guidance Modal - only when AI can't fix */}
      {showGuidanceModal && guidanceData && (
        <GuidanceModal
          data={guidanceData}
          testId={testId}
          testType={testType}
          markdownReportUrl={reportUrl}
          onClose={() => setShowGuidanceModal(false)}
        />
      )}
    </>
  );
}

// Professional Guidance Modal - Clean, Modern UI
function GuidanceModal({ 
  data, 
  testId, 
  testType, 
  markdownReportUrl, 
  onClose 
}: {
  data: {
    reason: string;
    message: string;
    recommendedAction: string;
    warningMessage?: string;
    contextSource: string;
  };
  testId: string;
  testType: string;
  markdownReportUrl: string | null;
  onClose: () => void;
}) {
  const [guidance, setGuidance] = useState<string>('');
  
  useEffect(() => {
    // Generate contextual guidance based on failure reason
    const guidanceText = generateActionableGuidance(data, testType);
    setGuidance(guidanceText);
  }, [data, testType]);
  
  const openReportInNewTab = () => {
    if (markdownReportUrl) {
      window.open(markdownReportUrl, '_blank');
    }
  };
  
  const getIconAndColor = () => {
    switch (data.reason) {
      case 'not_fixable':
        return { icon: AlertCircle, color: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };
      case 'markdown_not_available':
        return { icon: FileX, color: 'text-red-500', bgColor: 'bg-red-50', borderColor: 'border-red-200' };
      case 'api_error':
        return { icon: Wifi, color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' };
      default:
        return { icon: Info, color: 'text-gray-500', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' };
    }
  };
  
  const { icon: Icon, color, bgColor, borderColor } = getIconAndColor();
  
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icon className={`h-6 w-6 ${color}`} />
              <h2 className="text-xl font-semibold text-gray-900">
                Test Analysis Results
              </h2>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)]">
          {/* Status Message */}
          <div className={`${bgColor} ${borderColor} border rounded-lg p-4`}>
            <h3 className={`font-medium ${color} mb-2`}>Analysis Summary</h3>
            <p className="text-gray-700 leading-relaxed">{data.message}</p>
            {data.warningMessage && (
              <p className="text-gray-600 mt-3 text-sm bg-white/50 p-3 rounded border-l-2 border-orange-300">
                <strong>Note:</strong> {data.warningMessage}
              </p>
            )}
          </div>
          
          {/* Actionable Guidance */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Recommended Next Steps
            </h3>
            <div className="text-blue-800 prose prose-sm max-w-none">
              <div className="whitespace-pre-line leading-relaxed">{guidance}</div>
            </div>
          </div>
          
          {/* Test Context */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3">Test Context</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Test Type:</span>
                <span className="ml-2 font-medium text-gray-900 capitalize">{testType}</span>
              </div>
              <div>
                <span className="text-gray-500">Analysis Source:</span>
                <span className="ml-2 font-medium text-gray-900 capitalize">{data.contextSource}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer Actions */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
          <div className="flex justify-end">
            <Button 
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Generate actionable guidance based on analysis results
function generateActionableGuidance(data: any, testType: string): string {
  const basePrefix = `Here's what to do next:\n\n`;
  
  // Handle different failure reasons
  switch (data.reason) {
    case 'not_fixable':
      if (data.message.includes('Infrastructure')) {
        return basePrefix + 
          `🔧 Infrastructure Issue Detected\n\n` +
          `• Verify the target application is running and accessible\n` +
          `• Check network connectivity and DNS resolution\n` +
          `• Review server logs for errors or downtime\n` +
          `• Validate environment configuration\n` +
          `• Test the application manually in browser\n\n` +
          `This requires environment/infrastructure fixes, not script changes.`;
      }
      
      if (data.message.includes('Authentication')) {
        return basePrefix +
          `🔐 Authentication Issue Detected\n\n` +
          `• Verify login credentials are current and valid\n` +
          `• Check user account status and permissions\n` +
          `• Review authentication service availability\n` +
          `• Test login process manually\n` +
          `• Check for session timeouts or policy changes\n\n` +
          `Contact system administrators if credentials need updating.`;
      }
      
      return basePrefix +
        `🔍 Complex Issue Detected\n\n` +
        `• Review the detailed failure report below\n` +
        `• Check browser console for additional errors\n` +
        `• Run test in debug mode for step-by-step analysis\n` +
        `• Compare with recent successful test runs\n` +
        `• Consider breaking complex scenarios into smaller tests\n\n` +
        `This may require deeper investigation or test refactoring.`;
    
    case 'markdown_not_available':
      return basePrefix +
        `📄 Report Generation Issue\n\n` +
        `• Ensure tests are configured to generate failure reports\n` +
        `• Check Playwright configuration includes proper reporters\n` +
        `• Verify test execution completed (wasn't interrupted)\n` +
        `• Review test execution logs for errors\n` +
        `• Try running the test again\n\n` +
        `AI analysis requires detailed failure reports to provide fixes.`;
    
    case 'api_error':
      return basePrefix +
        `⚡ Service Temporarily Unavailable\n\n` +
        `• Wait a moment and try the AI fix again\n` +
        `• Check network connectivity\n` +
        `• Review test failure details manually\n` +
        `• Try running the test again to get fresh results\n` +
        `• Contact support if issue persists\n\n` +
        `Most service issues resolve quickly with a retry.`;
    
    default:
      return basePrefix +
        `📋 General Next Steps\n\n` +
        `• Review the complete error message and context\n` +
        `• Check if this is a new or recurring issue\n` +
        `• Verify test environment setup\n` +
        `• Run the test locally if possible\n` +
        `• Document findings for future reference\n\n` +
        `Consider reaching out to your team for additional insights.`;
  }
}
```

#### 2.2 Monaco Diff Editor Component
**File**: `/app/src/components/playground/ai-diff-viewer.tsx`
```typescript
interface AIDiffViewerProps {
  originalScript: string;
  fixedScript: string;
  explanation: string;
  isVisible: boolean;
  onAccept: (acceptedScript: string) => void;
  onReject: () => void;
  onClose: () => void;
}

export function AIDiffViewer({ ... }: AIDiffViewerProps) {
  // Monaco diff editor with side-by-side comparison
  // Explanation panel showing AI's reasoning
  // Accept/Reject/Close action buttons
  // Responsive design for different screen sizes
}
```

### Phase 3: Integration with Existing Playground

#### 3.1 Modify Playground Index Component
**Changes to**: `/app/src/components/playground/index.tsx`

```typescript
// Add new state management
const [showAIDiff, setShowAIDiff] = useState(false);
const [aiFixedScript, setAIFixedScript] = useState<string>('');
const [aiExplanation, setAIExplanation] = useState<string>('');
const [isAIFixing, setIsAIFixing] = useState(false);

// Add AI fix handler
const handleAIFix = async () => {
  setIsAIFixing(true);
  try {
    const response = await fetch('/api/ai/fix-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        failedScript: editorContent,
        testType: testCase.type,
        reportUrl: reportUrl
      })
    });
    
    const result = await response.json();
    setAIFixedScript(result.fixedScript);
    setAIExplanation(result.explanation);
    setShowAIDiff(true);
  } catch (error) {
    toast.error('AI Fix failed', {
      description: 'Unable to generate script fix. Please try again.'
    });
  } finally {
    setIsAIFixing(false);
  }
};

// Update button placement in header
<div className="flex items-center gap-2">
  {/* Fix with AI Button - only show when test failed */}
  {testExecutionStatus === 'failed' && (
    <AIFixButton
      testExecutionStatus={testExecutionStatus}
      onFixGenerated={() => setShowAIDiff(true)}
      currentScript={editorContent}
      reportUrl={reportUrl}
      testType={testCase.type}
      isRunning={isRunning || isAIFixing}
    />
  )}
  
  {/* Existing Run Button */}
  <Button onClick={runTest} disabled={isRunning || isValidating}>
    {/* Existing run button content */}
  </Button>
</div>
```

#### 3.2 Add Diff Viewer Integration
```typescript
// Add AI Diff Viewer modal/overlay
{showAIDiff && (
  <AIDiffViewer
    originalScript={editorContent}
    fixedScript={aiFixedScript}
    explanation={aiExplanation}
    isVisible={showAIDiff}
    onAccept={(acceptedScript) => {
      setEditorContent(acceptedScript);
      setShowAIDiff(false);
      // Reset test execution state since script changed
      resetTestExecutionState();
      resetValidationState();
      toast.success('AI fix applied successfully');
    }}
    onReject={() => {
      setShowAIDiff(false);
      toast.info('AI fix rejected');
    }}
    onClose={() => setShowAIDiff(false)}
  />
)}
```

### Phase 4: Advanced Error Context Extraction & Classification

#### 4.1 Playwright Report Analysis System
**Current Architecture Analysis:**
- Supercheck uses HTML reports via `--reporter=html,list`
- Reports stored as `index.html` with trace data in S3
- **DISCOVERY**: Playwright automatically generates detailed markdown files for test failures
- Markdown files contain structured failure information with error details, page snapshots, and full test source
- Error details captured in `stdout/stderr` AND rich markdown failure reports

#### 4.2 Playwright Markdown Report Integration
**File**: `/worker/src/execution/services/execution.service.ts`
```typescript
private async collectAndUploadMarkdownReports(
  runDir: string,
  s3ReportKeyPrefix: string,
  testBucket: string,
  testId: string,
  entityType: ReportType
): Promise<string[]> {
  const markdownFiles: string[] = [];
  
  try {
    // Look for markdown files in test-results directory
    const testResultsDir = path.join(runDir, 'test-results');
    
    if (existsSync(testResultsDir)) {
      const files = await fs.readdir(testResultsDir, { recursive: true });
      
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.md')) {
          const fullPath = path.join(testResultsDir, file);
          
          if (existsSync(fullPath)) {
            // Upload markdown file to S3
            const s3Key = `${s3ReportKeyPrefix}/${file}`;
            await this.s3Service.uploadFile(
              fullPath,
              testBucket,
              s3Key,
              'text/markdown'
            );
            
            markdownFiles.push(s3Key);
            this.logger.log(`[${testId}] Uploaded markdown report: ${s3Key}`);
          }
        }
      }
    }
    
    // Also check the main runDir for any markdown files
    const mainDirFiles = await fs.readdir(runDir);
    for (const file of mainDirFiles) {
      if (file.endsWith('.md')) {
        const fullPath = path.join(runDir, file);
        const s3Key = `${s3ReportKeyPrefix}/${file}`;
        
        await this.s3Service.uploadFile(
          fullPath,
          testBucket,
          s3Key,
          'text/markdown'
        );
        
        markdownFiles.push(s3Key);
        this.logger.log(`[${testId}] Uploaded markdown report from runDir: ${s3Key}`);
      }
    }
    
  } catch (error) {
    this.logger.error(`[${testId}] Error collecting markdown reports: ${error}`);
  }
  
  return markdownFiles;
}

// Update existing upload flow to include markdown reports
const markdownFiles = await this.collectAndUploadMarkdownReports(
  runDir,
  s3ReportKeyPrefix,
  testBucket,
  testId,
  entityType
);

// Store markdown file references in metadata
await this.dbService.storeReportMetadata({
  entityId: testId,
  entityType: entityType,
  reportPath: s3ReportKeyPrefix,
  status: success ? TestRunStatus.COMPLETED : TestRunStatus.FAILED,
  s3Url: s3Url,
  markdownReports: markdownFiles, // Add this field
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

#### 4.2 Comprehensive Error Classification Framework
**File**: `/app/src/lib/error-classification.ts`
```typescript
// Error Classification Types
export enum FailureCategory {
  // Actionable (AI can fix)
  SELECTOR_ISSUES = 'selector_issues',           // Changed/missing selectors
  TIMING_PROBLEMS = 'timing_problems',           // Wait/timeout issues
  ASSERTION_FAILURES = 'assertion_failures',    // Expected vs actual mismatches
  NAVIGATION_ERRORS = 'navigation_errors',      // Routing/page load issues
  FORM_INTERACTION = 'form_interaction',        // Input/form submission issues
  
  // Environmental (Not AI fixable)
  NETWORK_ISSUES = 'network_issues',            // DNS, connectivity problems
  SERVER_ERRORS = 'server_errors',             // 500, 503, API down
  AUTHENTICATION_FAILURES = 'authentication_failures', // Login/auth system issues
  PERMISSION_DENIED = 'permission_denied',      // Access control issues
  INFRASTRUCTURE_DOWN = 'infrastructure_down', // Database, services unavailable
  
  // Configuration (Mixed - some fixable)
  ENVIRONMENT_MISMATCH = 'environment_mismatch', // Wrong URLs, configs
  BROWSER_COMPATIBILITY = 'browser_compatibility', // Browser-specific issues
  RESOURCE_CONSTRAINTS = 'resource_constraints', // Memory, CPU, timeout limits
  
  // Unknown/Complex
  UNKNOWN = 'unknown'
}

interface ErrorSignature {
  category: FailureCategory;
  confidence: number; // 0-1
  aiFixable: boolean;
  keywords: string[];
  patterns: RegExp[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ErrorClassifier {
  private static readonly ERROR_SIGNATURES: ErrorSignature[] = [
    // Selector Issues (AI Fixable)
    {
      category: FailureCategory.SELECTOR_ISSUES,
      confidence: 0.95,
      aiFixable: true,
      keywords: ['selector', 'not found', 'element not found', 'locator', 'query selector'],
      patterns: [
        /waiting for selector .* to be visible/i,
        /element .* not found/i,
        /locator .* not found/i,
        /no such element/i,
        /element is not attached to the page/i,
        /querySelector.*null/i
      ],
      severity: 'high'
    },
    
    // Timing Issues (AI Fixable)
    {
      category: FailureCategory.TIMING_PROBLEMS,
      confidence: 0.9,
      aiFixable: true,
      keywords: ['timeout', 'wait', 'loading', 'async', 'race condition'],
      patterns: [
        /timeout.*exceeded/i,
        /waiting for.*timed out/i,
        /page\.waitFor.*timeout/i,
        /navigation timeout/i,
        /element not visible within timeout/i
      ],
      severity: 'medium'
    },
    
    // Network/Infrastructure Issues (NOT AI Fixable)
    {
      category: FailureCategory.NETWORK_ISSUES,
      confidence: 0.95,
      aiFixable: false,
      keywords: ['ECONNREFUSED', 'ETIMEDOUT', 'DNS', 'network', 'connection'],
      patterns: [
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /net::ERR_/i,
        /DNS.*not found/i,
        /connection.*refused/i,
        /network.*error/i
      ],
      severity: 'critical'
    },
    
    // Server Errors (NOT AI Fixable)
    {
      category: FailureCategory.SERVER_ERRORS,
      confidence: 0.9,
      aiFixable: false,
      keywords: ['500', '502', '503', '504', 'internal server error', 'bad gateway'],
      patterns: [
        /HTTP.*5\d\d/i,
        /internal server error/i,
        /bad gateway/i,
        /service unavailable/i,
        /gateway timeout/i
      ],
      severity: 'critical'
    },
    
    // Authentication Issues (NOT AI Fixable)
    {
      category: FailureCategory.AUTHENTICATION_FAILURES,
      confidence: 0.85,
      aiFixable: false,
      keywords: ['401', '403', 'unauthorized', 'forbidden', 'login', 'authentication'],
      patterns: [
        /HTTP.*401/i,
        /HTTP.*403/i,
        /unauthorized/i,
        /forbidden/i,
        /authentication.*failed/i,
        /invalid.*credentials/i,
        /session.*expired/i
      ],
      severity: 'high'
    },
    
    // Form/Interaction Issues (AI Fixable)
    {
      category: FailureCategory.FORM_INTERACTION,
      confidence: 0.8,
      aiFixable: true,
      keywords: ['fill', 'click', 'submit', 'input', 'button', 'form'],
      patterns: [
        /cannot fill.*element/i,
        /element.*not clickable/i,
        /button.*not enabled/i,
        /input.*readonly/i,
        /form.*validation/i
      ],
      severity: 'medium'
    }
  ];
  
  static classifyError(errorMessage: string, stackTrace?: string): {
    category: FailureCategory;
    confidence: number;
    aiFixable: boolean;
    severity: string;
    reasoning: string;
  } {
    const fullText = `${errorMessage} ${stackTrace || ''}`.toLowerCase();
    
    let bestMatch: ErrorSignature | null = null;
    let highestConfidence = 0;
    
    for (const signature of this.ERROR_SIGNATURES) {
      let confidence = 0;
      
      // Check keyword matches
      const keywordMatches = signature.keywords.filter(keyword => 
        fullText.includes(keyword.toLowerCase())
      ).length;
      confidence += (keywordMatches / signature.keywords.length) * 0.4;
      
      // Check pattern matches
      const patternMatches = signature.patterns.filter(pattern => 
        pattern.test(fullText)
      ).length;
      confidence += (patternMatches / signature.patterns.length) * 0.6;
      
      if (confidence > highestConfidence && confidence > 0.3) {
        highestConfidence = confidence;
        bestMatch = signature;
      }
    }
    
    if (bestMatch) {
      return {
        category: bestMatch.category,
        confidence: Math.min(highestConfidence * bestMatch.confidence, 1),
        aiFixable: bestMatch.aiFixable,
        severity: bestMatch.severity,
        reasoning: this.generateReasoning(bestMatch, errorMessage)
      };
    }
    
    return {
      category: FailureCategory.UNKNOWN,
      confidence: 0,
      aiFixable: false,
      severity: 'medium',
      reasoning: 'Unable to classify error automatically'
    };
  }
  
  private static generateReasoning(signature: ErrorSignature, errorMessage: string): string {
    switch (signature.category) {
      case FailureCategory.SELECTOR_ISSUES:
        return 'Element selector likely changed or element is not accessible. AI can suggest updated selectors or wait strategies.';
      case FailureCategory.TIMING_PROBLEMS:
        return 'Timing issue detected. AI can suggest proper wait conditions or timeout adjustments.';
      case FailureCategory.NETWORK_ISSUES:
        return 'Network connectivity problem. This requires infrastructure investigation, not script changes.';
      case FailureCategory.SERVER_ERRORS:
        return 'Server-side error detected. Application or API is down - requires server-side investigation.';
      case FailureCategory.AUTHENTICATION_FAILURES:
        return 'Authentication system issue. Check credentials, user permissions, or authentication service status.';
      default:
        return 'Error classification available with detailed analysis.';
    }
  }
}
```

#### 4.3 Markdown Report Parser (Simplified)
**File**: `/app/src/lib/playwright-markdown-parser.ts`
```typescript
interface MarkdownError {
  message: string;
  location: string;
  stack?: string;
  testName: string;
}

export class PlaywrightMarkdownParser {
  static parseMarkdownForErrors(markdownContent: string): Array<{
    error: MarkdownError;
    classification: ReturnType<typeof ErrorClassifier.classifyError>;
  }> {
    try {
      // Extract error details from markdown structure
      const errorMatch = markdownContent.match(/# Error details\n\n```\n([\s\S]*?)\n```/);
      if (!errorMatch) {
        throw new Error('No error details found in markdown report');
      }
      
      const errorText = errorMatch[1];
      
      // Extract test name
      const testNameMatch = markdownContent.match(/- Name:\s*>>\s*(.+)/);
      const testName = testNameMatch?.[1] || 'Unknown Test';
      
      // Extract location
      const locationMatch = markdownContent.match(/- Location:\s*(.+)/);
      const location = locationMatch?.[1] || 'Unknown Location';
      
      // Extract main error message (first line typically contains the key error)
      const errorLines = errorText.split('\n');
      const mainError = errorLines[0] || errorText.substring(0, 200);
      
      const error: MarkdownError = {
        message: mainError.trim(),
        location,
        stack: errorText,
        testName
      };
      
      // Classify the error using our existing classifier
      const classification = ErrorClassifier.classifyError(error.message, error.stack);
      
      return [{
        error,
        classification
      }];
      
    } catch (parseError) {
      console.error('Error parsing markdown report:', parseError);
      
      // Fallback: Try to extract any error information from the content
      const fallbackError: MarkdownError = {
        message: 'Failed to parse markdown report structure',
        location: 'Unknown',
        testName: 'Unknown Test'
      };
      
      return [{
        error: fallbackError,
        classification: {
          category: FailureCategory.UNKNOWN,
          confidence: 0,
          aiFixable: false,
          severity: 'medium',
          reasoning: 'Unable to parse markdown report format'
        }
      }];
    }
  }
  
  // Simple helper to determine if markdown contains a failure
  static isFailureReport(markdownContent: string): boolean {
    return markdownContent.includes('# Error details') && 
           markdownContent.includes('# Instructions');
  }
  
  // Extract clean error context for AI (removes page snapshot noise)
  static extractEssentialContext(markdownContent: string): string {
    // Keep only the essential parts for AI analysis
    const sections = [
      '# Instructions',
      '# Test info', 
      '# Error details',
      '# Test source'
    ];
    
    let essentialContent = '';
    
    sections.forEach(section => {
      const sectionMatch = markdownContent.match(
        new RegExp(`(${section}[\\s\\S]*?)(?=\\n# |$)`)
      );
      
      if (sectionMatch) {
        essentialContent += sectionMatch[1] + '\n\n';
      }
    });
    
    return essentialContent || markdownContent; // Fallback to full content
  }
}
```

### Phase 5: Intelligent AI Strategy & Prompt Engineering

#### 5.1 Smart AI Fix Decision Engine
**File**: `/app/src/lib/ai-fix-strategy.ts`
```typescript
interface AIFixDecision {
  shouldAttemptFix: boolean;
  confidence: number;
  reasoning: string;
  warningMessage?: string;
  recommendedAction: 'ai_fix' | 'manual_investigation';
}

export class AIFixDecisionEngine {
  static shouldAttemptAIFix(
    errorClassifications: Array<{
      error: PlaywrightError;
      classification: ReturnType<typeof ErrorClassifier.classifyError>;
    }>,
    testType: TestType
  ): AIFixDecision {
    const fixableErrors = errorClassifications.filter(ec => ec.classification.aiFixable);
    const environmentalErrors = errorClassifications.filter(ec => !ec.classification.aiFixable);
    const highConfidenceFixable = fixableErrors.filter(ec => ec.classification.confidence > 0.7);
    
    // Environmental issues dominate - don't attempt AI fix
    if (environmentalErrors.length > 0 && environmentalErrors.length >= fixableErrors.length) {
      const primaryEnvironmentalError = environmentalErrors[0];
      
      return {
        shouldAttemptFix: false,
        confidence: primaryEnvironmentalError.classification.confidence,
        reasoning: `Infrastructure/environmental issues detected: ${primaryEnvironmentalError.classification.category}. ${primaryEnvironmentalError.classification.reasoning}`,
        warningMessage: this.getEnvironmentalWarning(primaryEnvironmentalError.classification.category),
        recommendedAction: 'manual_investigation'
      };
    }
    
    // High-confidence fixable errors - good candidate for AI
    if (highConfidenceFixable.length > 0) {
      return {
        shouldAttemptFix: true,
        confidence: Math.max(...highConfidenceFixable.map(ec => ec.classification.confidence)),
        reasoning: `${highConfidenceFixable.length} high-confidence fixable issues detected. AI can likely resolve these.`,
        recommendedAction: 'ai_fix'
      };
    }
    
    // Low confidence or complex errors - suggest manual investigation
    if (fixableErrors.length > 0) {
      return {
        shouldAttemptFix: false,
        confidence: Math.max(...fixableErrors.map(ec => ec.classification.confidence)),
        reasoning: 'Errors detected but confidence is low. Manual investigation recommended first.',
        warningMessage: 'AI fixes may not be reliable for these complex error patterns.',
        recommendedAction: 'manual_investigation'
      };
    }
    
    // No clear classification
    return {
      shouldAttemptFix: false,
      confidence: 0,
      reasoning: 'Unable to classify errors reliably. Manual investigation required.',
      recommendedAction: 'manual_investigation'
    };
  }
  
  private static getEnvironmentalWarning(category: FailureCategory): string {
    switch (category) {
      case FailureCategory.NETWORK_ISSUES:
        return 'Check network connectivity, DNS settings, and firewall rules.';
      case FailureCategory.SERVER_ERRORS:
        return 'Application server is experiencing issues. Check server status and logs.';
      case FailureCategory.AUTHENTICATION_FAILURES:
        return 'Verify user credentials, session state, and authentication service availability.';
      default:
        return 'Environmental issue detected. Review infrastructure and configuration.';
    }
  }
}
```

#### 5.2 Context-Aware Prompt Engineering with Markdown Integration
**File**: `/app/src/lib/ai-prompt-builder.ts`
```typescript
interface AIFixContext {
  errorClassifications: Array<{
    error: PlaywrightError;
    classification: ReturnType<typeof ErrorClassifier.classifyError>;
  }>;
  testType: TestType;
  failedScript: string;
  reportAnalysis: {
    fixableErrors: PlaywrightError[];
    environmentalIssues: PlaywrightError[];
    suggestedApproach: string;
  };
  executionContext: {
    stdout: string;
    stderr: string;
    duration: number;
  };
}

export class AIPromptBuilder {
  // NEW: Markdown-optimized prompt builder (preferred method)
  static buildMarkdownContextPrompt({
    failedScript,
    testType,
    markdownContent
  }: {
    failedScript: string;
    testType: TestType;
    markdownContent: string;
  }): string {
    return `You are an expert Playwright test automation engineer. Analyze this comprehensive test failure report and provide a precise fix.

${markdownContent}

## Current Script Being Fixed
\`\`\`typescript
${failedScript}
\`\`\`

## Instructions
Based on the detailed failure analysis above (which includes error details, page snapshot, and test source), provide ONLY the corrected script.

Requirements:
1. Fix the specific issue identified in the error details
2. Add brief comments explaining critical changes
3. Maintain the original test structure and intent  
4. Use modern Playwright best practices
5. Ensure the fix addresses the root cause, not just symptoms

## Analysis Focus
- Compare the "Current Script Being Fixed" with the "Test source" section above
- The error details show exactly what failed and why
- The page snapshot provides context about the actual page state
- Apply the most targeted fix possible

Fixed Script:
\`\`\`typescript`;
  }

  // Fallback: HTML context-based prompt builder
  static constructFixPrompt(context: AIFixContext): string {
    const { errorClassifications, testType, failedScript, reportAnalysis } = context;
    
    // Build context-specific sections
    const errorSummary = this.buildErrorSummary(errorClassifications);
    const fixingStrategy = this.buildFixingStrategy(errorClassifications, testType);
    const specificGuidance = this.buildSpecificGuidance(errorClassifications);
    
    return `
You are a senior test automation engineer specializing in Playwright. A ${testType} test has failed and needs intelligent fixing.

## Error Analysis
${errorSummary}

## Current Script
\`\`\`typescript
${failedScript}
\`\`\`

## Execution Context
- Test Type: ${testType}
- Primary Issues: ${this.getTopIssues(errorClassifications)}
- Confidence Level: ${this.getAverageConfidence(errorClassifications)}

${fixingStrategy}

${specificGuidance}

## Requirements
1. Return ONLY the fixed TypeScript/JavaScript code
2. Maintain the original test structure and intent
3. Add comments explaining critical changes
4. Use modern Playwright best practices
5. Ensure cross-browser compatibility

## Focus Areas Based on Error Analysis:
${this.buildFocusAreas(errorClassifications)}

---
Fixed Script:
\`\`\`typescript`;
  }
  
  private static buildErrorSummary(errorClassifications: Array<any>): string {
    const fixableCount = errorClassifications.filter(ec => ec.classification.aiFixable).length;
    const totalCount = errorClassifications.length;
    
    let summary = `**Total Errors**: ${totalCount} (${fixableCount} AI-fixable)\n`;
    
    errorClassifications.forEach((ec, index) => {
      summary += `\n**Error ${index + 1}** (${ec.classification.category}):`;
      summary += `\n- Message: ${ec.error.message}`;
      summary += `\n- AI Fixable: ${ec.classification.aiFixable ? 'Yes' : 'No'}`;
      summary += `\n- Confidence: ${(ec.classification.confidence * 100).toFixed(0)}%`;
      summary += `\n- Reasoning: ${ec.classification.reasoning}`;
    });
    
    return summary;
  }
  
  private static buildFixingStrategy(errorClassifications: Array<any>, testType: TestType): string {
    const categories = errorClassifications.map(ec => ec.classification.category);
    const uniqueCategories = [...new Set(categories)];
    
    let strategy = "\n## Fixing Strategy\n";
    
    if (uniqueCategories.includes(FailureCategory.SELECTOR_ISSUES)) {
      strategy += "- **Selector Issues**: Update selectors using more robust locators (data-testid, role-based selectors)\n";
    }
    
    if (uniqueCategories.includes(FailureCategory.TIMING_PROBLEMS)) {
      strategy += "- **Timing Issues**: Implement proper wait strategies and increase timeouts where appropriate\n";
    }
    
    if (uniqueCategories.includes(FailureCategory.FORM_INTERACTION)) {
      strategy += "- **Form Issues**: Add element state checks before interactions\n";
    }
    
    return strategy;
  }
  
  private static buildSpecificGuidance(errorClassifications: Array<any>): string {
    const hasNetworkIssues = errorClassifications.some(ec => 
      ec.classification.category === FailureCategory.NETWORK_ISSUES
    );
    const hasTimingIssues = errorClassifications.some(ec => 
      ec.classification.category === FailureCategory.TIMING_PROBLEMS
    );
    
    let guidance = "\n## Specific Guidance\n";
    
    if (hasNetworkIssues) {
      guidance += "⚠️  **Network Issues Detected**: Add retry logic and network error handling\n";
    }
    
    if (hasTimingIssues) {
      guidance += "🕐 **Timing Issues Detected**: Use page.waitForLoadState() and explicit waits\n";
    }
    
    return guidance;
  }
  
  private static buildFocusAreas(errorClassifications: Array<any>): string {
    const areas = new Set<string>();
    
    errorClassifications.forEach(ec => {
      switch (ec.classification.category) {
        case FailureCategory.SELECTOR_ISSUES:
          areas.add("- Robust element selection with fallback strategies");
          break;
        case FailureCategory.TIMING_PROBLEMS:
          areas.add("- Proper async/await patterns and wait conditions");
          break;
        case FailureCategory.FORM_INTERACTION:
          areas.add("- Element state validation before interactions");
          break;
        case FailureCategory.NAVIGATION_ERRORS:
          areas.add("- Navigation timing and URL validation");
          break;
      }
    });
    
    return Array.from(areas).join('\n');
  }
  
  private static getTopIssues(errorClassifications: Array<any>): string {
    const categories = errorClassifications.map(ec => ec.classification.category);
    const counts = categories.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([cat, count]) => `${cat} (${count})`)
      .join(', ');
  }
  
  private static getAverageConfidence(errorClassifications: Array<any>): string {
    if (errorClassifications.length === 0) return '0%';
    
    const avgConfidence = errorClassifications.reduce((sum, ec) => 
      sum + ec.classification.confidence, 0
    ) / errorClassifications.length;
    
    return `${(avgConfidence * 100).toFixed(0)}%`;
  }
}
```

### Phase 6: Enhanced Security & Best Practices

#### 6.1 Comprehensive Security Framework
**File**: `/app/src/lib/ai-security.ts`
```typescript
export class AISecurityService {
  // Input validation with strict type checking
  static validateInputs(body: any): ValidationResult {
    const schema = {
      failedScript: { type: 'string', maxLength: 50000, required: true },
      testType: { type: 'enum', values: ['browser', 'api', 'custom', 'database'], required: true },
      testId: { type: 'uuid', required: true },
      executionContext: { type: 'object', required: false }
    };
    
    return this.validateSchema(body, schema);
  }
  
  // RBAC authorization with test-level permissions
  static async authorizeTestAccess(userId: string, testId: string): Promise<boolean> {
    // Check organization membership
    const userOrg = await getUserOrganization(userId);
    const testOrg = await getTestOrganization(testId);
    
    if (userOrg.id !== testOrg.id) {
      throw new SecurityError('Cross-organization access denied');
    }
    
    // Check specific test permissions
    return await checkTestPermissions(userId, testId, ['ai_fix']);
  }
  
  // Advanced rate limiting with burst protection  
  static async checkRateLimit(userId: string, orgId: string): Promise<void> {
    const limits = {
      user: { requests: 10, window: 60 }, // 10 requests per minute per user
      org: { requests: 100, window: 3600 }, // 100 requests per hour per organization
    };
    
    await Promise.all([
      this.enforceRateLimit(`user:${userId}`, limits.user),
      this.enforceRateLimit(`org:${orgId}`, limits.org)
    ]);
  }
  
  // Secure content filtering
  static sanitizeCode(code: string): string {
    // Remove dangerous JavaScript patterns
    const dangerousPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /document\.write/gi,
      /<script/gi,
      /javascript:/gi,
      /data:/gi,
      /import\s*\(/gi, // Dynamic imports
    ];
    
    let sanitized = code;
    dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '/* REMOVED_FOR_SECURITY */');
    });
    
    return sanitized.trim();
  }
  
  // Validate AI responses for safety
  static validateAIResponse(response: string): void {
    const maliciousPatterns = [
      'eval(',
      'Function(',
      '<script',
      'javascript:',
      'data:',
      'document.write',
      'innerHTML',
      'outerHTML',
      'execCommand'
    ];
    
    const lowerResponse = response.toLowerCase();
    
    for (const pattern of maliciousPatterns) {
      if (lowerResponse.includes(pattern.toLowerCase())) {
        throw new SecurityError(`AI response contains potentially dangerous pattern: ${pattern}`);
      }
    }
  }
  
  // Secure URL validation for markdown reports
  static validateReportUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Only allow HTTPS
      if (parsedUrl.protocol !== 'https:') {
        return false;
      }
      
      // Validate against trusted S3 endpoints  
      const trustedHosts = [
        's3.amazonaws.com',
        's3.us-east-1.amazonaws.com',
        's3.us-west-2.amazonaws.com',
        // Add your trusted endpoints
      ].filter(Boolean);
      
      return trustedHosts.some(host => 
        parsedUrl.hostname === host || 
        parsedUrl.hostname.endsWith(`.${host}`)
      );
      
    } catch {
      return false;
    }
  }
  
  // Audit logging for compliance
  static async auditLog(event: {
    userId: string;
    orgId: string;
    action: 'ai_fix_request' | 'ai_fix_success' | 'ai_fix_failure';
    testId: string;
    metadata?: any;
  }): Promise<void> {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      ...event,
      ipAddress: await this.getClientIP(),
      userAgent: await this.getUserAgent(),
    };
    
    // Store in secure audit log
    await storeAuditLog(auditEntry);
  }
}

class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

#### 6.2 Advanced Security Measures
- ✅ **Mandatory Markdown Reports**: No HTML fallback - ensures consistent, secure processing
- ✅ **Input Sanitization**: Remove dangerous code patterns (eval, Function, etc.)
- ✅ **Output Validation**: Scan AI responses for malicious content
- ✅ **RBAC Authorization**: Test-level permissions with organization boundaries
- ✅ **Multi-Level Rate Limiting**: Per-user and per-organization limits
- ✅ **Secure URL Validation**: Only trusted S3 endpoints allowed
- ✅ **Content Size Limits**: 50KB script limit, 100KB markdown limit
- ✅ **Request Timeouts**: 10s for reports, 30s for AI generation
- ✅ **Audit Logging**: Full compliance trail for security events
- ✅ **Error Sanitization**: No sensitive data in error messages

#### 6.2 Production Monitoring & Analytics
```typescript
// Enhanced monitoring integration
export class AIMonitoringService {
  static async trackUsage(metrics: {
    userId: string;
    organizationId: string;
    testType: string;
    tokensUsed: number;
    duration: number;
    success: boolean;
    model: string;
  }) {
    // Track costs per organization
    await this.updateOrganizationUsage(metrics);
    
    // Log for analytics
    console.log('AI Usage:', metrics);
    
    // Optional: Send to external analytics
    if (process.env.ANALYTICS_ENABLED) {
      await this.sendToAnalytics(metrics);
    }
  }

  private static async updateOrganizationUsage(metrics: any) {
    // Update database with organization usage
    // Implement billing/quota checks
  }

  private static async sendToAnalytics(metrics: any) {
    // Send to Vercel Analytics, PostHog, etc.
  }
}
```

#### 6.3 User Experience Enhancements
- **Loading States**: Real-time progress with token estimation
- **Progressive Enhancement**: Multi-provider fallbacks (OpenAI → Anthropic)
- **Keyboard Shortcuts**: Quick access to AI fix (Ctrl/Cmd + Shift + F)
- **Contextual Hints**: Smart tooltips based on error classification
- **Performance**: Edge runtime optimization with caching
- **Cost Transparency**: Show estimated costs to users
- **Usage Analytics**: Track success rates and user satisfaction

### Phase 7: Testing Strategy

#### 7.1 Unit Tests
- AI service integration tests with mocked responses
- Component rendering tests for different states
- Error handling verification
- Rate limiting functionality

#### 7.2 Integration Tests
- End-to-end test failure → AI fix → acceptance flow
- Monaco diff editor interactions
- API endpoint error scenarios
- Real OpenAI integration tests (with test key)

#### 7.3 User Acceptance Testing
- Test with various failure types (browser, API, custom, database)
- Verify AI suggestions are relevant and helpful
- Ensure diff viewer is intuitive and functional
- Performance testing with large scripts

## File Structure

```
/app/src/
├── lib/
│   ├── ai-service.ts                    # Vercel AI SDK integration service
│   ├── ai-monitoring-service.ts         # Usage tracking and analytics
│   ├── error-classification.ts          # Error analysis and classification
│   ├── playwright-html-parser.ts        # HTML report parsing utilities  
│   ├── playwright-markdown-parser.ts    # Markdown report parsing utilities
│   ├── ai-prompt-builder.ts            # Context-aware prompt engineering
│   └── ai-fix-strategy.ts              # Decision engine for AI fixes
├── components/playground/
│   ├── ai-fix-button.tsx               # Smart Fix with AI button component
│   ├── ai-diff-viewer.tsx              # Monaco diff editor modal
│   ├── index.tsx                       # Modified playground (main integration)
│   └── monaco-diff-editor.tsx          # Monaco diff editor wrapper
└── app/api/
    └── ai/
        └── fix-test/
            └── route.ts                # Enhanced AI fix API endpoint
```

## Updated Dependencies

```json
{
  "dependencies": {
    "ai": "^3.0.0",
    "@ai-sdk/openai": "^0.0.24", 
    "@ai-sdk/anthropic": "^0.0.17",
    "ioredis": "^5.3.2"
  }
}
```

## Implementation Timeline

### Week 1: Infrastructure Setup
- Environment configuration
- AI service setup with OpenAI integration
- API route creation
- Basic error handling

### Week 2: Core Components
- AI Fix Button component
- Monaco Diff Viewer component
- Basic integration with playground
- Report parsing utilities

### Week 3: Integration & Enhancement
- Full playground integration
- Advanced error context extraction
- UI/UX polish and responsive design
- Security implementations

### Week 4: Testing & Deployment
- Comprehensive testing suite
- Performance optimization
- Documentation updates
- Feature flag deployment

## Success Metrics

1. **Functionality**: AI successfully generates relevant fixes for failed tests
2. **User Adoption**: >70% of users try AI fix when tests fail
3. **Success Rate**: >60% of AI-generated fixes are accepted by users
4. **Performance**: AI fix generation completes within 10 seconds
5. **Reliability**: <5% error rate for AI service integration

## Risk Mitigation

### Technical Risks
- **AI Service Downtime**: Implement graceful degradation and fallback messaging
- **Rate Limiting**: Clear user communication about usage limits
- **Large Script Handling**: Implement script size limits and optimization

### User Experience Risks
- **Poor Fix Quality**: Continuous prompt engineering and user feedback integration
- **Complexity**: Keep interface simple with progressive disclosure
- **Performance Impact**: Lazy loading and efficient state management

## Future Enhancements

1. **Custom Model Training**: Train on internal test patterns for better fixes
2. **Multi-Language Support**: Extend beyond TypeScript/JavaScript
3. **Fix History**: Track and learn from user acceptance patterns
4. **Integration Testing**: AI-powered integration test generation
5. **Visual Testing**: AI-powered visual regression fix suggestions

---

This implementation plan provides a robust, scalable approach to integrating AI-powered test fixing into the Supercheck playground while maintaining security, performance, and user experience standards.