import * as acorn from "acorn";
import * as walk from "acorn-walk";

const BLOCKED_MODULES = new Set([
  "fs",
  "child_process",
  "cluster",
  "worker_threads",
  "net",
  "http",
  "https",
  "dgram",
  "os",
  "inspector",
]);

// Add back blocked identifiers
const BLOCKED_IDENTIFIERS = new Set(["process", "Buffer", "global"]);

export function validateCode(code: string): { valid: boolean; error?: string } {
  // 1. Check for dangerous patterns using regex (before AST parsing)
  const infiniteLoopPatterns = [
    /while\s*\(\s*true\s*\)/,
    /for\s*\(\s*;\s*;\s*\)/,
    /while\s*\(\s*1\s*\)/,
    /for\s*\(\s*;[^;]*true[^;]*;\s*\)/,
  ];
  if (infiniteLoopPatterns.some((p) => p.test(code))) {
    return {
      valid: false,
      error: "Security Error: Potential infinite loop detected.",
    };
  }

  const dangerousPatterns = [
    /eval\s*\(/,
    /new\s+Function\s*\(/,
    /\bFunction\s*\(/, // Might catch legitimate uses, but safer to block
    /document\.write/,
    /\bwebpack\b/, // Example of blocking specific keywords if needed
    /\brequire\.resolve\b/,
    /\b__dirname\b/,
    /\b__filename\b/,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return {
        valid: false,
        error: `Security Error: Potentially dangerous code pattern detected: ${pattern.source}`,
      };
    }
  }

  // 3. Parse into AST
  let ast: acorn.Node;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 2020,
      sourceType: "module",
    }) as acorn.Node;
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { valid: false, error: `Syntax Error: ${err.message}` };
    }
    return { valid: false, error: "Syntax Error: Could not parse code." };
  }

  // 4. Walk the AST for specific security checks
  try {
    walk.simple(ast, {
      // Block require('module')
      CallExpression(node: acorn.CallExpression) {
        const isRequireCall =
          node.callee.type === "Identifier" &&
          (node.callee as acorn.Identifier).name === "require";
        if (isRequireCall && node.arguments.length === 1) {
          const arg = node.arguments[0];
          if (
            arg.type === "Literal" &&
            typeof (arg as acorn.Literal).value === "string"
          ) {
            const moduleName = (arg as acorn.Literal).value as string;
            if (BLOCKED_MODULES.has(moduleName)) {
              throw new Error(
                `Security Error: Requiring module '${moduleName}' is not allowed.`
              );
            }
          } else {
            // Block non-literal requires like require(variable)
            throw new Error(
              `Security Error: Dynamic require() calls are not allowed.`
            );
          }
        }
      },
      // Block import ... from 'module'
      ImportDeclaration(node: acorn.ImportDeclaration) {
        if (
          node.source &&
          node.source.type === "Literal" &&
          typeof (node.source as acorn.Literal).value === "string"
        ) {
          const moduleName = (node.source as acorn.Literal).value as string;
          if (BLOCKED_MODULES.has(moduleName)) {
            throw new Error(
              `Security Error: Importing module '${moduleName}' is not allowed.`
            );
          }
        }
      },
      // Block dynamic import('module')
      ImportExpression(node: acorn.ImportExpression) {
        if (
          node.source &&
          node.source.type === "Literal" &&
          typeof (node.source as acorn.Literal).value === "string"
        ) {
          const moduleName = (node.source as acorn.Literal).value as string;
          if (BLOCKED_MODULES.has(moduleName)) {
            throw new Error(
              `Security Error: Dynamic import of module '${moduleName}' is not allowed.`
            );
          }
        } else {
          // Block non-literal dynamic imports like import(variable)
          throw new Error(
            `Security Error: Dynamic imports with variable sources are not allowed.`
          );
        }
      },
      // Block specific identifiers
      Identifier(node: acorn.Identifier) {
        if (BLOCKED_IDENTIFIERS.has(node.name)) {
          throw new Error(
            `Security Error: Usage of '${node.name}' is not allowed.`
          );
        }
      },
    });

    return { valid: true };
  } catch (error) {
    if (error instanceof Error) {
      return { valid: false, error: error.message };
    }
    return { valid: false, error: "Unknown validation error" };
  }
}
