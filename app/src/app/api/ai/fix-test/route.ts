import { NextRequest, NextResponse } from 'next/server';
import { AIFixService } from '@/lib/ai-service';
import { AISecurityService, AuthService } from '@/lib/ai-security';
import { PlaywrightMarkdownParser, AIFixDecisionEngine } from '@/lib/ai-classifier';
import { AIPromptBuilder } from '@/lib/ai-prompts';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Rate limiting store (in production, use Redis)
// const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// S3 Client configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
  },
  forcePathStyle: true, // Required for MinIO
});

export async function POST(request: NextRequest) {
  try {
    // Step 1: Input validation and sanitization
    const body = await request.json();
    const validatedInput = AISecurityService.validateInputs(body);
    const { failedScript, testType, testId } = validatedInput;

    // Step 2: Authentication and authorization
    const session = await AuthService.validateUserAccess(request, testId);
    await AuthService.checkRateLimit(request, session.user.id);

    // Step 3: Get markdown report URL (required - no fallback)
    const markdownReportUrl = await getMarkdownReportUrl(testId);
    console.log('[AI Fix Debug] Markdown report URL:', markdownReportUrl, 'for testId:', testId);
    
    if (!markdownReportUrl) {
      console.log('[AI Fix Debug] No markdown report found for testId:', testId);
      return NextResponse.json({
        success: false,
        reason: 'markdown_not_available',
        message: 'Markdown failure report not found. Please ensure the test has failed and reports are generated.',
        guidance: AIPromptBuilder.generateGuidanceMessage('markdown_not_available')
      }, { status: 400 });
    }

    // Step 4: Securely fetch markdown content with validation
    const errorContext = await AISecurityService.securelyFetchMarkdownReport(markdownReportUrl);

    // Step 5: Parse markdown for error classification
    const errorClassifications = PlaywrightMarkdownParser.parseMarkdownForErrors(errorContext);
    console.log('[AI Fix Debug] Found', errorClassifications.length, 'errors in markdown:', 
      errorClassifications.map(e => ({ message: e.message, category: e.classification?.category, aiFixable: e.classification?.aiFixable })));
    
    const fixDecision = AIFixDecisionEngine.shouldAttemptMarkdownFix(errorClassifications, testType);
    console.log('[AI Fix Debug] Fix decision:', fixDecision);

    // Step 6: Return early if environmental issues detected
    if (!fixDecision.shouldAttemptFix) {
      const reason = determineFailureReason(errorClassifications);
      
      // If we have no errors found but the user is still requesting a fix,
      // let's try a basic AI analysis with the test script itself
      if (errorClassifications.length === 0 && failedScript) {
        console.log('[AI Fix Debug] No markdown errors found, attempting basic AI analysis with script');
        try {
          const basicPrompt = AIPromptBuilder.buildBasicFixPrompt({
            failedScript,
            testType,
            reason: 'No detailed error report available'
          });
          
          const aiResponse = await AIFixService.generateScriptFix({
            prompt: basicPrompt,
            temperature: 0.2,
            testType: testType as 'browser' | 'api' | 'custom' | 'database',
          });
          
          const sanitizedScript = AISecurityService.sanitizeCodeOutput(aiResponse.fixedScript);
          const sanitizedExplanation = AISecurityService.sanitizeTextOutput(aiResponse.explanation);
          
          return NextResponse.json({
            success: true,
            fixedScript: sanitizedScript,
            explanation: sanitizedExplanation,
            confidence: 0.4, // Lower confidence for basic analysis
            contextSource: 'basic_analysis',
            aiMetrics: {
              model: aiResponse.model,
              duration: aiResponse.duration,
              tokensUsed: aiResponse.usage.totalTokens,
              promptTokens: aiResponse.usage.promptTokens,
              completionTokens: aiResponse.usage.completionTokens,
            },
            errorAnalysis: {
              totalErrors: 0,
              fixableErrors: 0,
              topIssues: ['basic_analysis']
            }
          });
        } catch (basicAnalysisError) {
          console.log('[AI Fix Debug] Basic analysis also failed:', basicAnalysisError);
        }
      }
      
      return NextResponse.json({
        success: false,
        reason: 'not_fixable',
        decision: fixDecision,
        guidance: AIPromptBuilder.generateGuidanceMessage(reason),
        errorAnalysis: {
          totalErrors: errorClassifications.length,
          categories: errorClassifications.map(ec => ec.classification?.category).filter(Boolean)
        }
      });
    }

    // Step 7: Build secure markdown-optimized AI prompt
    const prompt = AIPromptBuilder.buildMarkdownContextPrompt({
      failedScript,
      testType,
      markdownContent: errorContext
    });

    // Step 8: Call AI service with intelligent prompt using Vercel AI SDK
    const aiResponse = await AIFixService.generateScriptFix({
      prompt,
      maxTokens: 2000,
      temperature: 0.1, // Low temperature for consistent, reliable fixes
      testType: testType as 'browser' | 'api' | 'custom' | 'database',
    });

    // Step 9: Validate and sanitize AI output
    const sanitizedScript = AISecurityService.sanitizeCodeOutput(aiResponse.fixedScript);
    const sanitizedExplanation = AISecurityService.sanitizeTextOutput(aiResponse.explanation);

    return NextResponse.json({
      success: true,
      fixedScript: sanitizedScript,
      explanation: sanitizedExplanation,
      confidence: fixDecision.confidence,
      contextSource: 'markdown',
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
    
    // Determine error type for appropriate response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError = errorMessage.includes('Authentication') || errorMessage.includes('Unauthorized');
    const isRateLimitError = errorMessage.includes('rate limit') || errorMessage.includes('too many requests');
    const isSecurityError = errorMessage.includes('unsafe') || errorMessage.includes('security');
    
    if (isAuthError) {
      return NextResponse.json({
        success: false,
        reason: 'authentication_required',
        message: 'Authentication required to use AI fix feature',
        guidance: 'Please log in and try again'
      }, { status: 401 });
    }
    
    if (isRateLimitError) {
      return NextResponse.json({
        success: false,
        reason: 'rate_limited',
        message: 'Too many AI fix requests. Please wait before trying again.',
        guidance: 'Rate limiting helps ensure fair usage and service availability'
      }, { status: 429 });
    }
    
    if (isSecurityError) {
      return NextResponse.json({
        success: false,
        reason: 'security_violation',
        message: 'Request blocked for security reasons',
        guidance: 'Please ensure your test script follows security guidelines'
      }, { status: 400 });
    }

    // Generic error response
    return NextResponse.json({
      success: false,
      reason: 'generation_failed',
      message: 'Failed to generate AI fix. Please try manual investigation.',
      guidance: AIPromptBuilder.generateGuidanceMessage('api_error')
    }, { status: 500 });
  }
}

// Helper function to get markdown report URL using AWS SDK
async function getMarkdownReportUrl(testId: string): Promise<string | null> {
  try {
    const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    const testBucketName = process.env.S3_TEST_BUCKET_NAME || 'playwright-test-artifacts';
    
    // Look specifically in the data folder where Playwright stores .md files
    const dataFolderPrefix = `${testId}/report/data/`;
    
    console.log('[AI Fix Debug] Looking for .md files in data folder using AWS SDK, prefix:', dataFolderPrefix);
    
    try {
      const command = new ListObjectsV2Command({
        Bucket: testBucketName,
        Prefix: dataFolderPrefix,
      });
      
      const response = await s3Client.send(command);
      
      console.log('[AI Fix Debug] AWS SDK listing response - KeyCount:', response.KeyCount, 'IsTruncated:', response.IsTruncated);
      
      if (response.Contents && response.Contents.length > 0) {
        console.log('[AI Fix Debug] Found', response.Contents.length, 'objects in data directory');
        
        // Log all files found for debugging
        const allFiles = response.Contents.map(obj => obj.Key).filter(Boolean);
        console.log('[AI Fix Debug] All files in data directory:', allFiles);
        
        // Look for .md files
        const mdFiles = response.Contents
          .map(obj => obj.Key)
          .filter(key => key && key.endsWith('.md'));
        
        console.log('[AI Fix Debug] Found .md files:', mdFiles);
        
        if (mdFiles.length > 0) {
          const foundKey = mdFiles[0]; // Use the first .md file found
          const foundUrl = `${s3Endpoint}/${testBucketName}/${foundKey}`;
          console.log('[AI Fix Debug] Using markdown file:', foundUrl);
          return foundUrl;
        }
        
        console.log('[AI Fix Debug] No .md files found in', response.Contents.length, 'objects');
      } else {
        console.log('[AI Fix Debug] No objects found in data directory with prefix:', dataFolderPrefix);
      }
    } catch (awsError) {
      console.log('[AI Fix Debug] AWS SDK listing failed:', awsError instanceof Error ? awsError.message : 'Unknown error');
      console.log('[AI Fix Debug] AWS SDK error details:', awsError);
    }
    
    console.log('[AI Fix Debug] No .md files found in data directory for testId:', testId);
    return null;
    
  } catch (error) {
    console.error('Error getting markdown report URL:', error);
    return null;
  }
}

// Helper function to determine failure reason from error classifications
function determineFailureReason(errorClassifications: Array<{ classification?: { category?: string } }>): string {
  if (errorClassifications.length === 0) {
    return 'complex_issue';
  }

  const categories = errorClassifications
    .map(ec => ec.classification?.category)
    .filter(Boolean);

  // Prioritize certain failure types
  if (categories.includes('network_issues')) return 'network_issues';
  if (categories.includes('authentication_failures')) return 'authentication_failures';
  if (categories.includes('infrastructure_down')) return 'infrastructure_down';
  if (categories.includes('data_issues')) return 'data_issues';
  
  return 'complex_issue';
}

// Health check endpoint
export async function GET() {
  try {
    const healthStatus = await AIFixService.healthCheck();
    
    return NextResponse.json({
      status: healthStatus.status,
      timestamp: new Date().toISOString(),
      service: 'ai-fix-api',
      details: healthStatus.details
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'ai-fix-api',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}