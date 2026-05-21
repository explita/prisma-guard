import type { z as ZodType } from "zod";
import { createProxy } from "./lib/zod-proxy.js";
export type { PrismaGuardOptions, PrismaGuardConfig } from "./types.js";
export { prismaGuard } from "./lib/prisma-extension.js";

/**
 * Helper function for defining Prisma Guard configuration with full TypeScript IntelliSense.
 *
 * @param config - The configuration object
 * @returns The same configuration object (typed)
 *
 * @example
 * ```typescript
 * import { defineConfig } from "@explita/prisma-guard";
 *
 * export default defineConfig({
 *   schemaDir: "./prisma",
 *   outputDir: "./src/generated",
 *   omitIds: true,
 *   autoTrim: true
 * });
 * ```
 */
export function defineConfig<T extends Record<string, unknown>>(
  config: import("./types.js").PrismaGuardConfig<T>,
) {
  return config;
}

// 'z' starts with the global 'z' object (e.g. z.string())
const z = createProxy("z") as unknown as typeof ZodType;

// 'pg' is for chaining onto existing schemas (e.g. .email().trim())
const pg = createProxy("") as unknown as typeof ZodType;

// 'ref' is for referencing external variables (e.g. ref("constants").genders)
const ref = (path: string, importPath?: string) =>
  createProxy(path, true, importPath);

/**
 * Prisma Guard Validator API
 *
 * Provides powerful, intuitive ways to customize Zod schema generation:
 * - Use `chain` to add validations to inferred Prisma types (e.g., `validator.chain.email()`)
 * - Use `var` to reference external variables/constants (e.g., `validator.var("constants.EMAIL")`)
 * - Use the terse `v` proxy directly to completely override the inferred type (e.g., `v.string()`)
 *
 * @example
 * ```ts
 * import { v } from "@explita/prisma-guard";
 *
 * export default defineConfig({
 *   decorators: {
 *     // Chain validations onto existing type
 *     email: v.chain.email().trim().toLowerCase(),
 *
 *     // Override type completely (no .override needed!)
 *     status: v.enum(["active", "inactive"]),
 *
 *     // Reference external variable
 *     message: v.var("constants.REQUIRED_MESSAGE")
 *   }
 * })
 * ```
 */
export const validator = {
  /**
   * Chain additional validations onto Prisma's inferred type
   *
   * Use this when you want to keep Prisma's base type inference
   * (e.g., String → z.string(), Int → z.number()) but add
   * additional Zod methods like `.email()`, `.min()`, `.trim()`.
   *
   * @example
   * ```ts
   * validator.chain.email().min(5).trim()
   * // Results in: z.string().email().min(5).trim()
   * ```
   *
   * @returns Proxy with Zod chainable methods
   */
  chain: pg,

  /**
   * Reference external variables or constants
   *
   * Use this when you want to reference values defined outside
   * the generated schema, such as error messages from a constants
   * file or configuration values.
   *
   * The path will be automatically imported if it follows the
   * pattern `file.variable` or `file.subpath.variable`.
   * Wrap in parentheses to suppress auto-import: `(file).var`
   *
   * Pass a second argument to specify the import path explicitly.
   * The named export is extracted from the variable path.
   *
   * @param path - Dot notation path to the variable
   * @param importPath - Optional import path (e.g., "../../lib/messages")
   * @returns Proxy that resolves to the referenced variable
   *
   * @example
   * ```ts
   * // Auto-imports: import { REQUIRED_MESSAGE } from "../lib/constants"
   * validator.var("constants.REQUIRED_MESSAGE")
   *
   * // No auto-import (manual import expected)
   * validator.var("(myConfig).validation.emailRegex")
   *
   * // Explicit import path: import { messages } from "../../lib/messages"
   * validator.var("(messages).required", "../../lib/messages")
   * ```
   */
  var: ref,

  /**
   * Reference and auto-import relation schemas
   *
   * Use this when you want to define validations for nested relation
   * fields (e.g. orderItems OrderItem[]) by reusing the automatically
   * generated schemas for that model.
   *
   * Automatically resolves to the correct Create or Update schema at
   * compile time, and injects the necessary imports.
   *
   * @param modelName - The PascalCase name of the relation model (e.g., "OrderItem")
   * @returns Proxy representing the relation schema
   *
   * @example
   * ```ts
   * orderItems: v.array(v.relation("OrderItem"))
   * ```
   */
  relation: (modelName: string) => createProxy(`z.relation("${modelName}")`),
};

/**
 * Prisma Guard Validator API (Terse Alias)
 *
 * This proxy delegates to `z` by default for complete type overrides,
 * but also provides direct access to `chain`, `var`, and `relation` for a unified API.
 *
 * @example
 * ```ts
 * v.string().min(5)           // Override (direct call)
 * v.chain.email().trim()      // Chain
 * v.var("REQUIRED_MESSAGE")   // Reference
 * v.relation("OrderItem")   // Relation
 * ```
 */
export const v = new Proxy(validator, {
  get(target, prop) {
    if (prop === "chain") return validator.chain;
    if (prop === "var") return validator.var;
    if (prop === "relation") return validator.relation;
    return (z as any)[prop];
  },
}) as typeof z & typeof validator;
