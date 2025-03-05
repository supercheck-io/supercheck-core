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
  let ast: Node;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 2020,
      sourceType: "module",
    }) as Node;
  } catch (err: unknown) {
    if (err instanceof Error) {
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
    return { valid: false, error: "Unknown validation error" };
  }
}
