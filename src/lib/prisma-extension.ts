import { Prisma } from "@prisma/client/extension";
import { PrismaGuardOptions, ModelFields } from "../types.js";
import { stripExtraFields } from "./strip-fields.js";
import fs from "fs";
import path from "path";

/**
 * Creates a Prisma extension that guards your inputs against database operations
 */
export function prismaGuard(options: PrismaGuardOptions = {}) {
  // 1. Start with empty config
  const config: PrismaGuardOptions = {};

  // 2. Try project-local bootstrap config (to find custom outputDir from .js/.mjs)
  // This avoids pnpm/symlink issues by staying project-local
  const possiblePaths = [
    path.join(process.cwd(), "prisma-guard.config.json"),
    path.join(
      process.cwd(),
      "node_modules",
      ".prisma-guard",
      "runtime-config.json",
    ),
  ];

  for (const bootstrapPath of possiblePaths) {
    if (fs.existsSync(bootstrapPath)) {
      try {
        const baked = JSON.parse(fs.readFileSync(bootstrapPath, "utf-8"));
        Object.assign(config, baked);
        break;
      } catch (e) {
        // Ignore
      }
    }
  }

  // 3. Override with manual options (highest priority)
  Object.assign(config, options);

  // 4. Resolve outputDir
  const guardDir = path.join(
    process.cwd(),
    "node_modules",
    ".prisma-guard",
    "guards",
  );

  let modelFields: Record<string, ModelFields> = {};

  // Load and merge all guard files
  if (config.debug)
    console.log(`[prisma-guard] Searching for guards in: ${guardDir}`);
  if (fs.existsSync(guardDir)) {
    try {
      const files = fs.readdirSync(guardDir).filter((f) => f.endsWith(".json"));
      if (config.debug)
        console.log(`[prisma-guard] Found ${files.length} guard files.`);
      for (const file of files) {
        const content = fs.readFileSync(path.join(guardDir, file), "utf-8");
        const data = JSON.parse(content);
        modelFields = { ...modelFields, ...data };
      }
    } catch (e) {
      if (config.debug)
        console.error(`[prisma-guard] Error loading guards: ${e}`);
    }
  } else {
    if (config.debug)
      console.warn(`[prisma-guard] Guard directory not found: ${guardDir}`);
  }

  return Prisma.defineExtension((prisma) => {
    return prisma.$extends({
      name: "inputGuardExtension",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const writeOperations = [
              "create",
              "update",
              "upsert",
              "createMany",
              "updateMany",
              "createManyAndReturn",
              "updateManyAndReturn",
            ];

            if (writeOperations.includes(operation)) {
              // Find the model configuration (case-insensitive)
              const modelKey = Object.keys(modelFields).find(
                (k) => k.toLowerCase() === model.toLowerCase(),
              );
              const modelConfig = modelKey ? modelFields[modelKey] : undefined;

              if (modelConfig) {
                const onStrip = config.debug
                  ? (field: string, modelName: string) => {
                      console.log(
                        `[prisma-guard] Stripping extra field "${field}" from model "${modelName}"`,
                      );
                    }
                  : undefined;

                const dataKeys = ["data", "create", "update"];
                for (const key of dataKeys) {
                  if ((args as any)[key]) {
                    (args as any)[key] = stripExtraFields(
                      (args as any)[key],
                      modelKey!,
                      modelFields,
                      onStrip,
                    );
                  }
                }
              }
            }
            return query(args);
          },
        },
      },
    });
  });
}
