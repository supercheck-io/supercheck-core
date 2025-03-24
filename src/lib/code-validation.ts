import * as acorn from "acorn";
import type { Node } from "acorn";

const BLOCKED_MODULES: string[] = [
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
const BLOCKED_IDENTIFIERS: string[] = ["process", "Buffer", "global"];

/**
 * Type guard to check if a value is an Acorn AST node.
 */
function isNode(x: unknown): x is Node {
  return typeof x === "object" && x !== null && "type" in x;
}

/**
 * Recursively walk an AST node structure.
 * @param node - An AST node, an array of nodes, or null.
 * @param visitors - An object mapping node type names to visitor functions.
 */
function walkAst(
  node: Node | Node[] | null,
  visitors: Record<string, (node: Node) => void>
): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walkAst(child, visitors));
    return;
  }
  if (!node || !isNode(node)) return;

  if (visitors[node.type]) {
    visitors[node.type](node);
  }

  // Iterate over the node's own properties.
  for (const key of Object.keys(node)) {
    // We use a type assertion here because acorn nodes are untyped.
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      walkAst(child, visitors);
    } else if (child && typeof child === "object" && isNode(child)) {
      walkAst(child, visitors);
    }
  }
}

/**
 * Validate user script by scanning its AST:
 * - Block references to BLOCKED_MODULES in imports.
 * - Block usage of BLOCKED_IDENTIFIERS.
 * - Check for infinite loops or suspicious patterns.
 */
export function validateCode(code: string): { valid: boolean; error?: string } {
  // Check for potentially dangerous patterns in all scripts
  // Simple infinite loop detection
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
      return {
        valid: false,
        error: `Security Error: Potentially dangerous code pattern detected: ${pattern}`,
      };
    }
  }

  // Skip TypeScript validation for Playwright test scripts
  // Check for both exact matches and more general Playwright patterns
  if (
    code.includes("import { test, expect } from '@playwright/test'") ||
    code.includes('import { test, expect } from "@playwright/test"') ||
    code.includes("request.get(") ||
    code.includes("request.post(") ||
    code.includes("request.put(") ||
    code.includes("request.delete(") ||
    /test\(\s*["'].*["'],\s*async/.test(code)
  ) {
    return { valid: true };
  }

  let ast: Node;
  try {
    // First, check for TypeScript-specific syntax
    const typescriptPatterns = [
      // Type annotations with colon
      /\w+\s*:\s*{[^}]*}\s*=>/, // (param: { type }) =>
      /\w+\s*:\s*\w+(\[\])?\s*[,\)]/, // functionName(param: Type)
      /\w+\s*:\s*\w+(\[\])?\s*=>/, // (param: Type) =>
      /:\s*\w+(\[\])?\s*[,\)=]/, // : Type, or : Type) or : Type=

      // Interface definitions
      /interface\s+\w+/,

      // Type aliases
      /type\s+\w+\s*=/,

      // Generics
      /<\w+>(?=\()/, // functionName<T>()
      /<\w+,\s*\w+>(?=\()/, // functionName<T, U>()

      // TypeScript-specific keywords
      /\b(readonly|namespace|declare|abstract|implements|private|protected|public|override|keyof|typeof|infer)\b/,
    ];

    for (const pattern of typescriptPatterns) {
      if (pattern.test(code)) {
        return {
          valid: false,
          error:
            "TypeScript syntax detected. This playground only supports JavaScript. Please remove type annotations and TypeScript-specific syntax.",
        };
      }
    }

    ast = acorn.parse(code, {
      ecmaVersion: 2020,
      sourceType: "module",
    }) as Node;
  } catch (err: unknown) {
    if (err instanceof Error) {
      // Check if the error message suggests TypeScript syntax
      const errorMsg = err.message;

      if (
        errorMsg.includes(":") &&
        (errorMsg.includes("Unexpected token") ||
          errorMsg.includes("Unexpected character"))
      ) {
        // This might be TypeScript syntax error
        return {
          valid: false,
          error:
            "Syntax Error: The code contains invalid syntax. This playground only supports JavaScript.",
        };
      }

      return { valid: false, error: `Syntax Error: ${err.message}` };
    }
    return { valid: false, error: "Syntax Error" };
  }

  try {
    walkAst(ast, {
      ImportDeclaration(node) {
        // Using a cast here since acorn's AST types might not include `source`
        const moduleName = (node as unknown as { source: { value: string } })
          .source?.value as string | undefined;
        if (moduleName && BLOCKED_MODULES.includes(moduleName)) {
          throw new Error(
            `Security Error: Importing module '${moduleName}' is not allowed.`
          );
        }
      },
      ImportExpression(node) {
        if (
          (node as unknown as { source: { type: string } }).source?.type ===
          "Literal"
        ) {
          const moduleName = (node as unknown as { source: { value: string } })
            .source.value as string | undefined;
          if (moduleName && BLOCKED_MODULES.includes(moduleName)) {
            throw new Error(
              `Security Error: Dynamic import of module '${moduleName}' is not allowed.`
            );
          }
        }
      },
      Identifier(node) {
        const name = (node as unknown as { name: string }).name as
          | string
          | undefined;
        if (name && BLOCKED_IDENTIFIERS.includes(name)) {
          throw new Error(`Security Error: Usage of '${name}' is not allowed.`);
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
