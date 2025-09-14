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

interface AIUsageLog {
  success: boolean;
  duration: number;
  tokensUsed?: number;
  error?: string;
  model: string;
  testType?: string;
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

  private static async checkRateLimit(): Promise<void> {
    // Rate limiting check - placeholder for Redis implementation
    const enabled = process.env.AI_FIX_ENABLED;
    if (enabled === 'false') {
      throw new Error('AI fix service is currently disabled');
    }
  }

  private static optimizePrompt(prompt: string, testType?: string): string {
    const testTypeContext = testType ? `\n\nTest Type: ${testType}` : '';
    
    return `You are an expert Playwright test automation engineer. Fix the failing test script based on the markdown error report.

IMPORTANT RULES:
1. Return ONLY valid JavaScript/TypeScript code
2. Keep the original test structure and intent
3. Fix only the specific issues mentioned in the error report
4. Do not add unnecessary complexity
5. Use proper Playwright best practices
6. Include brief inline comments for significant changes

${prompt}${testTypeContext}

Return your response in this exact format:
FIXED_SCRIPT:
\`\`\`javascript
[Your fixed code here]
\`\`\`

EXPLANATION:
[Brief explanation of what was fixed and why]`;
  }

  private static parseAIResponse(response: string): { fixedScript: string; explanation: string } {
    try {
      // Extract script from code blocks
      const scriptMatch = response.match(/FIXED_SCRIPT:\s*```(?:javascript|typescript|js|ts)?\s*([\s\S]*?)```/i);
      const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*?)$/i);
      
      if (!scriptMatch || !explanationMatch) {
        throw new Error('Invalid AI response format');
      }

      const fixedScript = scriptMatch[1].trim();
      const explanation = explanationMatch[1].trim();

      if (!fixedScript || fixedScript.length < 10) {
        throw new Error('AI response contains insufficient code');
      }

      return {
        fixedScript,
        explanation: explanation || 'Script has been fixed to resolve the reported issues.'
      };
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async logAIUsage(usage: AIUsageLog): Promise<void> {
    // Log usage for monitoring and cost tracking
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'ai-fix',
      ...usage,
    };
    
    console.log('[AI Usage]', logEntry);
    
    // TODO: Implement proper logging to database/monitoring system
    // await logToDatabase(logEntry);
  }

  static async generateScriptFix({
    prompt,
    maxTokens: _maxTokens = 2000,
    temperature = 0.1,
    testType,
  }: AIFixRequest): Promise<AIFixResponse> {
    const startTime = Date.now();
    
    try {
      // Security: Check rate limits before making request
      await this.checkRateLimit();
      
      // Optimize prompt for token efficiency
      const optimizedPrompt = this.optimizePrompt(prompt, testType);
      
      const { text, usage } = await generateText({
        model: this.getModel(),
        prompt: optimizedPrompt,
        temperature,
        maxRetries: 3,
        abortSignal: AbortSignal.timeout(
          parseInt(process.env.AI_TIMEOUT_MS || '30000')
        ),
      });

      const duration = Date.now() - startTime;
      
      // Parse and validate AI response
      const parsedResponse = this.parseAIResponse(text);
      
      // Log successful usage  
      const promptTokens = 'promptTokens' in usage ? Number(usage.promptTokens) || 0 : 0;
      const completionTokens = 'completionTokens' in usage ? Number(usage.completionTokens) || 0 : 0;
      const totalTokens = 'totalTokens' in usage ? Number(usage.totalTokens) || 0 : promptTokens + completionTokens;
      
      await this.logAIUsage({
        success: true,
        duration,
        tokensUsed: totalTokens,
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        testType,
      });

      return {
        ...parsedResponse,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
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
      
      // Re-throw with sanitized error message
      const sanitizedMessage = error instanceof Error 
        ? error.message.replace(/api[_\s]*key/gi, '[REDACTED]')
        : 'AI service temporarily unavailable';
        
      throw new Error(`AI fix generation failed: ${sanitizedMessage}`);
    }
  }

  // Health check method for monitoring
  static async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    try {
      const testPrompt = 'Test prompt for health check';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await generateText({
        model: this.getModel(),
        prompt: testPrompt,
        abortSignal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}