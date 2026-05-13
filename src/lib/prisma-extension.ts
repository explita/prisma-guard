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
  const outputDir =
    config.outputDir ||
    path.join(process.cwd(), "node_modules", ".prisma-guard");

  let modelFields: Record<string, ModelFields> = {};
  const guardDir = path.join(outputDir, "guards");

  // Load and merge all guard files
  if (fs.existsSync(guardDir)) {
    try {
      const files = fs.readdirSync(guardDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(guardDir, file), "utf-8");
        const data = JSON.parse(content);
        modelFields = { ...modelFields, ...data };
      }
    } catch (e) {
      // Ignore
    }
  }

  return Prisma.defineExtension((prisma) => {
    return prisma.$extends({
      name: "inputGuardExtension",
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // We only care about operations that take data input
            if (
              [
                "create",
                "update",
                "upsert",
                "createMany",
                "updateMany",
              ].includes(operation)
            ) {
              const fields = modelFields;
              if (fields && model) {
                if (
                  operation === "create" ||
                  operation === "update" ||
                  operation === "createMany" ||
                  operation === "updateMany" ||
                  operation === "upsert"
                ) {
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
                        model,
                        fields,
                        onStrip,
                      );
                    }
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
