import * as acorn from 'acorn';

// Define blocked modules & identifiers
const BLOCKED_MODULES = [
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
];
const BLOCKED_IDENTIFIERS = ["process", "Buffer", "global"];

/**
 * Recursively walk an AST node structure.
 */
function walkAst(node: any, visitors: Record<string, (node: any) => void>) {
  if (Array.isArray(node)) {
    node.forEach((child) => walkAst(child, visitors));
    return;
  }
  if (!node || typeof node.type !== "string") return;

  if (visitors[node.type]) {
    visitors[node.type](node);
  }

  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const child = node[key];
      if (child && typeof child === "object") {
        walkAst(child, visitors);
      }
    }
  }
}

/**
 * Validate user script by scanning its AST:
 * - Block references to BLOCKED_MODULES in imports
 * - Block usage of BLOCKED_IDENTIFIERS
 * - Check for infinite loops or suspicious patterns (eval, new Function, etc.)
 */
export function validateCode(code: string): { valid: boolean; error?: string } {
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: "module" });
  } catch (err: any) {
    return { valid: false, error: `Syntax Error: ${err.message}` };
  }

  try {
    walkAst(ast, {
      ImportDeclaration(node) {
        const moduleName = node.source.value;
        if (BLOCKED_MODULES.includes(moduleName)) {
          throw new Error(
            `Security Error: Importing module '${moduleName}' is not allowed.`
          );
        }
      },
      ImportExpression(node) {
        if (node.source?.type === "Literal") {
          const moduleName = node.source.value;
          if (BLOCKED_MODULES.includes(moduleName)) {
            throw new Error(
              `Security Error: Dynamic import of module '${moduleName}' is not allowed.`
            );
          }
        }
      },
      Identifier(node) {
        if (BLOCKED_IDENTIFIERS.includes(node.name)) {
          throw new Error(
            `Security Error: Usage of '${node.name}' is not allowed.`
          );
        }
      },
    });

    // Simple infinite loop detection
    const infiniteLoopPatterns = [
      /while\s*\(\s*true\s*\)/,
      /for\s*\(\s*;\s*;\s*\)/,
      /while\s*\(\s*1\s*\)/,
      /for\s*\(\s*;[^;]*true[^;]*;\s*\)/,
    ];
    if (infiniteLoopPatterns.some((p) => p.test(code))) {
      throw new Error("Security Error: Potential infinite loop detected.");
    }

    // Block dangerous patterns (eval, new Function, etc.)
    const dangerousPatterns = [
      /eval\s*\(/,
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
        throw new Error(
          `Security Error: Potentially dangerous code pattern detected: ${pattern}`
        );
      }
    }

    return { valid: true };
  } catch (error) {
    if (error instanceof Error) {
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Unknown validation error' };
  }
}
