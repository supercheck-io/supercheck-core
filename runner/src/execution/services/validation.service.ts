import { Injectable, Logger } from '@nestjs/common';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

// Define blocked modules and identifiers (consider making configurable)
const BLOCKED_MODULES = new Set([
  'fs',
  'child_process',
  'cluster',
  'worker_threads',
  'net',
  'http',
  'https',
  'dgram',
  'inspector',
]);

// Modules allowed within the test environment
const ALLOWED_MODULES = new Set([
  '@playwright/test',
  'playwright',
  'expect',
  'path',
]);

const BLOCKED_IDENTIFIERS = new Set(['process', 'Buffer', 'global']);

// Identifiers allowed from Playwright context
const ALLOWED_IDENTIFIERS_IN_CONTEXT = new Set([
  'page', 'browser', 'context', 'test', 'expect'
]);

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  validateCode(code: string): { valid: boolean; error?: string } {
    this.logger.debug('Validating code snippet...');

    // 1. Check for dangerous patterns using regex (before AST parsing)
    const infiniteLoopPatterns = [
      /while\s*\(\s*true\s*\)/,
      /for\s*\(\s*;\s*;\s*\)/,
      /while\s*\(\s*1\s*\)/,
      /for\s*\(\s*;[^;]*true[^;]*;\s*\)/,
    ];
    if (infiniteLoopPatterns.some((p) => p.test(code))) {
        const errorMsg = "Security Error: Potential infinite loop detected.";
        this.logger.warn(errorMsg);
        return { valid: false, error: errorMsg };
    }

    // 2. Check for patterns that are dangerous outside of Playwright context
    const dangerousPatterns = [
      // Note: We're now using eval() internally, so we don't block it completely
      // Instead we should have a separate mechanism to control it
      // /eval\s*\(/,
      /new\s+Function\s*\(/,
      /\bFunction\s*\(/,
      /document\.write/,
      /\bwebpack\b/,
      /\brequire\.resolve\b/,
      /\b__dirname\b/,
      /\b__filename\b/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        const errorMsg = `Security Error: Potentially dangerous code pattern detected: ${pattern.source}`;
        this.logger.warn(errorMsg);
        return { valid: false, error: errorMsg };
      }
    }

    // 3. Parse into AST
    let ast: acorn.Node;
    try {
      ast = acorn.parse(code, {
        ecmaVersion: 2020,
        sourceType: 'module',
        // locations: true, // Optionally include location info
      }) as acorn.Node;
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? `Syntax Error: ${err.message}` : "Syntax Error: Could not parse code.";
        this.logger.warn(`Code parsing failed: ${errorMsg}`);
        return { valid: false, error: errorMsg };
    }

    // 4. Walk the AST for specific security checks
    try {
      walk.simple(ast, {
        CallExpression(node: acorn.CallExpression & acorn.Node) {
          const callee = node.callee as any; // Use any to simplify type checks
          const isRequireCall = callee.type === 'Identifier' && callee.name === 'require';
          if (isRequireCall && node.arguments.length === 1) {
            const arg = node.arguments[0];
            if (arg.type === 'Literal' && typeof arg.value === 'string') {
              const moduleName = arg.value as string;
              
              // Allow Playwright-related modules
              if (ALLOWED_MODULES.has(moduleName)) {
                return;
              }
              
              // Block denied modules
              if (BLOCKED_MODULES.has(moduleName)) {
                throw new Error(`Security Error: Requiring module '${moduleName}' is not allowed.`);
              }
              
              // For other modules, check if they're safe
              if (!moduleName.startsWith('@playwright/')) {
                // Log unknown modules without blocking them
                this.logger.warn(`[WARN] Unknown module required: ${moduleName}`);
              }
            } else {
              throw new Error('Security Error: Dynamic require() calls are not allowed.');
            }
          }
        },
        ImportDeclaration(node: acorn.ImportDeclaration & acorn.Node) {
          if (node.source && node.source.type === 'Literal' && typeof node.source.value === 'string') {
            const moduleName = node.source.value as string;
            
            // Allow Playwright-related modules
            if (ALLOWED_MODULES.has(moduleName)) {
              return;
            }
            
            if (BLOCKED_MODULES.has(moduleName)) {
              throw new Error(`Security Error: Importing module '${moduleName}' is not allowed.`);
            }
            
            // For other modules, check if they're safe
            if (!moduleName.startsWith('@playwright/')) {
              // Log unknown modules without blocking them
              this.logger.warn(`[WARN] Unknown module imported: ${moduleName}`);
            }
          }
        },
        ImportExpression(node: acorn.ImportExpression & acorn.Node) {
          const source = node.source as any; // Use any to simplify type checks
          if (source && source.type === 'Literal' && typeof source.value === 'string') {
            const moduleName = source.value as string;
            
            // Allow Playwright-related modules
            if (ALLOWED_MODULES.has(moduleName)) {
              return;
            }
            
            if (BLOCKED_MODULES.has(moduleName)) {
              throw new Error(`Security Error: Dynamic import of module '${moduleName}' is not allowed.`);
            }
          } else {
            throw new Error('Security Error: Dynamic imports with variable sources are not allowed.');
          }
        },
        Identifier(node: acorn.Identifier & acorn.Node) {
          if (BLOCKED_IDENTIFIERS.has(node.name) && !ALLOWED_IDENTIFIERS_IN_CONTEXT.has(node.name)) {
            // Check parent to see if it's a property access
            // @ts-ignore: We know node has a parent due to walk.simple
            const parent = node.parent;
            if (parent && parent.type === 'MemberExpression' && parent.object === node) {
              throw new Error(`Security Error: Usage of '${node.name}' is not allowed.`);
            }
          }
        },
      });

      this.logger.debug('Code validation successful.');
      return { valid: true };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown validation error";
        this.logger.warn(`AST validation failed: ${errorMsg}`);
        return { valid: false, error: errorMsg };
    }
  }
}
