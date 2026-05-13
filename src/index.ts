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
export function defineConfig(config: import("./types.js").PrismaGuardConfig) {
  return config;
}

// 'z' starts with the global 'z' object (e.g. z.string())
export const z = createProxy("z") as unknown as typeof ZodType;

// 'pg' is for chaining onto existing schemas (e.g. .email().trim())
export const pg = createProxy("") as unknown as typeof ZodType;

// 'ref' is for referencing external variables (e.g. ref("constants").genders)
export const ref = (path: string) => createProxy(path, true);
