import * as acorn from 'acorn';
import * as walk from 'acorn-walk';



// Strictly allowed modules 
const ALLOWED_MODULES = new Set([
  '@playwright/test',       // UI & E2E testing framework
  'playwright',             // Browser automation engine
  'expect',                 // Assertion library
  'mssql',                  // MSSQL database client
  'mysql',                  // Legacy MySQL client
  'pg',                     // PostgreSQL client
  'oracledb',               // Oracle DB client
  'mysql2',                 // Improved MySQL client
  'mongodb',                // MongoDB driver
  'lodash',                 // Utility library
  'axios',                  // Promise‑based HTTP client – simpler and safer than native http
  'zod',                    // Type-safe input validation – lightweight and audited 
  'uuid',                   // Solid pure-JS unique IDs, no side effects
  'dayjs',                  // Lightweight date manipulation (safer than moment.js)
  'validator',              // String validation (emails, URLs, etc.) – pure and audited
]);


// Enhanced blocked identifiers with more coverage
const BLOCKED_IDENTIFIERS = new Set([
  'process', 'Buffer', 'global', 'globalThis',
  '__dirname', '__filename',
  'require', 'module', 'exports', '__non_webpack_require__',
  'eval', 'Function', 'GeneratorFunction', 'AsyncFunction',
  'AsyncGeneratorFunction',
  'setTimeout', 'setInterval', 'setImmediate',
  'clearTimeout', 'clearInterval', 'clearImmediate',
  'btoa', 'atob',
  'Worker', 'SharedWorker', 'MessageChannel', 'postMessage',
  'SharedArrayBuffer', 'Atomics',
  'WebAssembly',
]);


// Security constants
const MAX_SCRIPT_LENGTH = 50000; // 50KB max
const MAX_STATEMENTS = 1000;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  line?: number;
  column?: number;
  errorType?: 'syntax' | 'security' | 'complexity' | 'length' | 'pattern';
}

export class ValidationService {
  validateCode(code: string): ValidationResult {
    console.log('Validating code snippet with enhanced security checks...');

    // 1. Basic length and content validation
    if (!code || typeof code !== 'string') {
      return {
        valid: false,
        error: 'Invalid script content',
        errorType: 'syntax',
      };
    }

    if (code.length > MAX_SCRIPT_LENGTH) {
      return {
        valid: false,
        error: `Script too long (${code.length} chars). Maximum allowed: ${MAX_SCRIPT_LENGTH} characters`,
        errorType: 'length',
      };
    }

    // 2. Enhanced dangerous patterns detection (removed network and DOM restrictions)
    const dangerousPatterns = [
      // Function constructors and eval
      { pattern: /\beval\s*\(/, message: "eval() is not allowed" },
      { pattern: /new\s+Function\s*\(/, message: "Function constructor is not allowed" },
      { pattern: /\bFunction\s*\(/, message: "Function constructor is not allowed" },
      
      // Timer functions (DoS potential)
      { pattern: /setTimeout\s*\(/, message: "setTimeout is not allowed" },
      { pattern: /setInterval\s*\(/, message: "setInterval is not allowed" },
      { pattern: /setImmediate\s*\(/, message: "setImmediate is not allowed" },
      
      // Process and system access
      { pattern: /process\s*\./, message: "Process access is not allowed" },
      { pattern: /global\s*\./, message: "Global object access is not allowed" },
      { pattern: /globalThis\s*\./, message: "GlobalThis access is not allowed" },
      
      // Code injection patterns
      { pattern: /javascript\s*:/, message: "JavaScript URLs are not allowed" },
      { pattern: /data\s*:\s*text\/html/, message: "Data URLs with HTML are not allowed" },
      { pattern: /srcdoc\s*=/, message: "srcdoc attribute is not allowed" },
      
      // Loop bombing patterns
      { pattern: /while\s*\(\s*true\s*\)/, message: "Infinite loop: while(true)" },
      { pattern: /for\s*\(\s*;\s*;\s*\)/, message: "Infinite loop: for(;;)" },
      { pattern: /while\s*\(\s*1\s*\)/, message: "Infinite loop: while(1)" },
      { pattern: /for\s*\(\s*;[^;]*true[^;]*;\s*\)/, message: "Potential infinite loop in for statement" },
      
      // Prototype pollution
      { pattern: /__proto__/, message: "__proto__ manipulation is not allowed" },
      { pattern: /prototype\s*\[/, message: "Prototype manipulation is not allowed" },
      { pattern: /constructor\s*\./, message: "Constructor access is not allowed" },
      
      // File system indicators
      { pattern: /\b__dirname\b/, message: "__dirname is not allowed" },
      { pattern: /\b__filename\b/, message: "__filename is not allowed" },
      
      // Worker and threading
      { pattern: /Worker\s*\(/, message: "Web Workers are not allowed" },
      { pattern: /SharedArrayBuffer/, message: "SharedArrayBuffer is not allowed" },
      { pattern: /Atomics\s*\./, message: "Atomics operations are not allowed" },
      
      // Module system manipulation
      { pattern: /require\s*\.\s*cache/, message: "require.cache manipulation is not allowed" },
      { pattern: /require\s*\.\s*resolve/, message: "require.resolve is not allowed" },
      { pattern: /module\s*\.\s*exports/, message: "module.exports manipulation is not allowed" },
      
      // Buffer and binary operations
      { pattern: /Buffer\s*\./, message: "Buffer operations are not allowed" },
      { pattern: /ArrayBuffer/, message: "ArrayBuffer operations should be avoided" },
      
      // Encoding/decoding that could be used for obfuscation
      { pattern: /unescape\s*\(/, message: "unescape is not allowed" },
      { pattern: /decodeURI/, message: "URI decoding functions are not allowed" },
      
      // Console manipulation
      { pattern: /console\s*\.\s*clear/, message: "Console clearing is not allowed" },
      { pattern: /console\s*\[/, message: "Console manipulation is not allowed" },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      const match = pattern.exec(code);
      if (match) {
        const line = this.getLineNumber(code, match.index);
        return { 
          valid: false, 
          error: `${message} at line ${line}`,
          line,
          errorType: 'security'
        };
      }
    }

    // 3. Check for suspicious string patterns (potential obfuscation)
    const suspiciousPatterns = [
      /String\.fromCharCode\s*\(/,
      /\\x[0-9a-fA-F]{2}/,
      /\\u[0-9a-fA-F]{4}/,
      /\[(['"][^'"]*['"],?\s*){10,}\]/, // Large string arrays
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(code)) {
        const match = pattern.exec(code);
        const line = match ? this.getLineNumber(code, match.index) : 1;
        return {
          valid: false,
          error: `Suspicious code pattern detected at line ${line}`,
          line,
          errorType: 'security'
        };
      }
    }

    // 4. Parse into AST with enhanced validation
    let ast: acorn.Node;
    try {
      ast = acorn.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: false,
        allowHashBang: false,
      }) as acorn.Node;
    } catch (err: unknown) {
      if (err instanceof Error) {
        const lineMatch = err.message.match(/\((\d+):(\d+)\)/);
        if (lineMatch) {
          const line = parseInt(lineMatch[1]);
          const column = parseInt(lineMatch[2]);
          return { 
            valid: false, 
            error: `Syntax error at line ${line}, column ${column}`,
            line, 
            column,
            errorType: 'syntax'
          };
        }
        return { valid: false, error: `Syntax error: ${err.message}`, errorType: 'syntax' };
      }
      return { valid: false, error: "Code parsing failed", errorType: 'syntax' };
    }

    // 5. Enhanced AST analysis with complexity checks (using walk.simple to avoid stack overflow)
    try {
      let statementCount = 0;

      walk.simple(ast, {
        Statement: () => {
          statementCount++;
          if (statementCount > MAX_STATEMENTS) {
            throw new Error(`Script too complex: more than ${MAX_STATEMENTS} statements`);
          }
        },

        CallExpression: (node: acorn.CallExpression & acorn.Node) => {
          const callee = node.callee as acorn.Node;
          
          // Enhanced require() validation
          if (callee.type === 'Identifier' && (callee as acorn.Identifier).name === 'require') {
            if (node.arguments.length !== 1) {
              const line = node.loc?.start?.line || 1;
              throw new Error(`Invalid require() call at line ${line}`);
            }
            
            const arg = node.arguments[0];
            if (arg.type !== 'Literal' || typeof arg.value !== 'string') {
              const line = node.loc?.start?.line || 1;
              throw new Error(`Dynamic require() calls are not allowed at line ${line}`);
            }
            
            const moduleName = arg.value as string;
            if (!ALLOWED_MODULES.has(moduleName) && !moduleName.startsWith('@playwright/')) {
              const line = node.loc?.start?.line || 1;
              throw new Error(`Module '${moduleName}' is not allowed at line ${line}`);
            }
          }
          
          // Check for blocked function calls
          if (callee.type === 'MemberExpression') {
            const obj = (callee as acorn.MemberExpression).object as acorn.Node;
            if (obj.type === 'Identifier' && BLOCKED_IDENTIFIERS.has((obj as acorn.Identifier).name)) {
              const line = node.loc?.start?.line || 1;
              throw new Error(`Access to '${(obj as acorn.Identifier).name}' is not allowed at line ${line}`);
            }
          }
        },

        ImportDeclaration: (node: acorn.ImportDeclaration & acorn.Node) => {
          if (node.source && node.source.type === 'Literal' && typeof node.source.value === 'string') {
            const moduleName = node.source.value as string;
            if (!ALLOWED_MODULES.has(moduleName) && !moduleName.startsWith('@playwright/')) {
              const line = node.loc?.start?.line || 1;
              throw new Error(`Import of module '${moduleName}' is not allowed at line ${line}`);
            }
          }
        },

        Identifier: (node: acorn.Identifier & acorn.Node) => {
          if (BLOCKED_IDENTIFIERS.has(node.name)) {
            const line = node.loc?.start?.line || 1;
            throw new Error(`Usage of '${node.name}' is not allowed at line ${line}`);
          }
        },

        Literal: (node: acorn.Literal & acorn.Node) => {
          // Check for suspicious string literals
          if (typeof node.value === 'string' && node.value.length > 1000) {
            const line = node.loc?.start?.line || 1;
            throw new Error(`Suspicious long string literal at line ${line}`);
          }
        },
      });

      console.log('Enhanced validation passed. Complexity stats:', {
        statements: statementCount,
      });
      
      return { valid: true };
    } catch (error) {
      if (error instanceof Error) {
        const lineMatch = error.message.match(/at line (\d+)/);
        const line = lineMatch ? parseInt(lineMatch[1]) : undefined;
        console.warn(`Enhanced AST validation failed: ${error.message}`);
        return { 
          valid: false, 
          error: error.message, 
          line,
          errorType: error.message.includes('Too many') ? 'complexity' : 'security'
        };
      }
      return { valid: false, error: "Validation failed", errorType: 'security' };
    }
  }

  private getLineNumber(code: string, index: number): number {
    const lines = code.substring(0, index).split('\n');
    return lines.length;
  }
}

// Export a singleton instance
export const validationService = new ValidationService(); 