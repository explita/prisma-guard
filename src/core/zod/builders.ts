import { PrismaGuardError } from "../../lib/error.js";
import { extractDecoratorName } from "../../lib/utils.js";
import { PrismaGuardConfig } from "../../types.js";

/**
 * Parses model and field documentation to collect custom imports
 * Also scans the raw file content for "orphan" imports not attached to models
 */
export function collectCustomImports(
  models: readonly any[],
  rawContent?: string,
): string[] {
  const customImports: string[] = [];
  let lastImportIndex = -1;

  // 1. Scan raw content for orphan/file-level imports
  if (rawContent) {
    rawContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("///") && trimmed.includes("@zod.import ")) {
        const imp = trimmed.split("@zod.import ")[1].trim();
        if (!customImports.includes(imp)) {
          customImports.push(imp);
          lastImportIndex = customImports.length - 1;
        }
      } else if (
        trimmed.startsWith("///") &&
        trimmed.includes("@zod.") &&
        !trimmed.includes("@zod.import ")
      ) {
        // Other decorator found, stop the import continuation
        lastImportIndex = -1;
      } else if (
        trimmed.startsWith("///") &&
        trimmed.includes("@zod") &&
        lastImportIndex !== -1
      ) {
        // Multi-line continuation for orphan imports
        const zodPart = trimmed.split("///")[1].trim();
        const continuation = zodPart.startsWith("@zod ")
          ? zodPart.substring(5)
          : zodPart.startsWith("@zod")
            ? zodPart.substring(4)
            : "";
        if (!customImports[lastImportIndex].includes(continuation)) {
          customImports[lastImportIndex] += "\n" + continuation;
        }
      } else if (trimmed && !trimmed.startsWith("///")) {
        lastImportIndex = -1;
      }
    });
  }

  // 2. Scan models and fields (existing logic for attached imports)
  for (const model of models) {
    if (model.documentation) {
      model.documentation.split("\n").forEach((line: string) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("@zod.import ")) {
          const imp = trimmed.replace("@zod.import ", "");
          if (!customImports.includes(imp)) {
            customImports.push(imp);
            lastImportIndex = customImports.length - 1;
          }
        } else if (trimmed.startsWith("@zod.")) {
          lastImportIndex = -1;
        } else if (trimmed.startsWith("@zod") && lastImportIndex !== -1) {
          const continuation = trimmed.startsWith("@zod ")
            ? trimmed.substring(5)
            : trimmed.startsWith("@zod")
              ? trimmed.substring(4)
              : "";
          if (!customImports[lastImportIndex].includes(continuation)) {
            customImports[lastImportIndex] += "\n" + continuation;
          }
        } else {
          lastImportIndex = -1;
        }
      });
    }

    if (model.documentation?.includes("@zod.omit")) {
      continue;
    }

    for (const field of model.fields) {
      if (field.documentation) {
        lastImportIndex = -1;
        field.documentation.split("\n").forEach((line: string) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("@zod.import ")) {
            const imp = trimmed.replace("@zod.import ", "");
            if (!customImports.includes(imp)) {
              customImports.push(imp);
              lastImportIndex = customImports.length - 1;
            }
          } else if (trimmed.startsWith("@zod.")) {
            lastImportIndex = -1;
          } else if (trimmed.startsWith("@zod") && lastImportIndex !== -1) {
            const continuation = trimmed.startsWith("@zod ")
              ? trimmed.substring(5)
              : trimmed.startsWith("@zod")
                ? trimmed.substring(4)
                : "";
            if (!customImports[lastImportIndex].includes(continuation)) {
              customImports[lastImportIndex] += "\n" + continuation;
            }
          } else {
            lastImportIndex = -1;
          }
        });
      }
    }
  }

  // Smart Merge Imports
  const groupedNamed = new Map<string, Set<string>>();
  const defaultImports = new Map<string, string>();
  const sideEffectImports = new Set<string>();

  customImports.forEach((imp) => {
    // Better parsing for multiline imports
    const fromIndex = imp.lastIndexOf(" from ");
    if (fromIndex !== -1) {
      const members = imp.substring(0, fromIndex).trim();
      const sourcePath = imp
        .substring(fromIndex + 6)
        .trim()
        .replace(/['"]/g, "");

      if (members.startsWith("{")) {
        const named = members
          .replace(/[{}]/g, "")
          .split(/[\s,]+/) // Split by comma or whitespace
          .map((m) => m.trim())
          .filter(Boolean);
        const set = groupedNamed.get(sourcePath) || new Set<string>();
        named.forEach((n) => set.add(n));
        groupedNamed.set(sourcePath, set);
      } else {
        // Default or * as
        defaultImports.set(sourcePath, members);
      }
    } else {
      // Side-effect import e.g. import "reflect-metadata"
      sideEffectImports.add(imp.replace(/['"]/g, "").trim());
    }
  });

  const mergedResults: string[] = [];
  const allSources = Array.from(
    new Set([
      ...groupedNamed.keys(),
      ...defaultImports.keys(),
      ...sideEffectImports,
    ]),
  ).sort();

  allSources.forEach((source) => {
    if (sideEffectImports.has(source)) {
      mergedResults.push(`import "${source}"`);
      return;
    }

    const named = groupedNamed.get(source);
    const def = defaultImports.get(source);

    let line = "";
    if (def) line += def;
    if (def && named && named.size > 0) line += ", ";
    if (named && named.size > 0) {
      line += `{ ${Array.from(named).sort().join(", ")} }`;
    }

    mergedResults.push(`import ${line} from "${source}"`);
  });

  return mergedResults;
}

/**
 * Transforms a DMMF Field into a Zod type string
 */
export function generateFieldZod(
  field: any,
  config: PrismaGuardConfig,
  usedEnums?: Set<string>,
): { zodType: string; descriptionLines: string[] } | null {
  if (field.kind === "object") return null;

  // Check for explicit inclusion first (bypasses all omissions)
  const isExplicitlyIncluded = field.documentation?.includes("@zod.include");

  // Omit IDs
  if (config.omitIds && field.isId && !isExplicitlyIncluded) return null;

  // Omit Dates
  if (config.omitDates && !isExplicitlyIncluded) {
    const dateNames = ["createdAt", "created_at", "updatedAt", "updated_at"];
    if (dateNames.includes(field.name) || field.isUpdatedAt) {
      return null;
    }
  }

  // Omit via Global Config
  if (config.zodOmit?.includes(field.name) && !isExplicitlyIncluded) {
    return null;
  }

  // Omit via Decorator
  if (field.documentation?.includes("@zod.omit")) {
    return null;
  }

  let zodType = config.typeMap?.[field.type] || "z.any()";
  let isEnumUsed = false;

  if (field.kind === "enum") {
    const eSuffix = config.enumSuffix;
    zodType = `${field.type}${eSuffix}`;
    isEnumUsed = true;
  }

  // Apply list/array before required/optional
  if (field.isList) {
    zodType = `z.array(${zodType})`;
  }

  const hasDefaultValue = field.default !== undefined && field.default !== null;

  // --- Process Documentation (Decorators & Descriptions) ---
  const zodDecorators: string[] = [];
  const descriptionLines: string[] = [];
  let hasCustomBase = false;
  let lastDecoratorIndex = -1;

  if (field.documentation) {
    field.documentation.split("\n").forEach((line: string) => {
      const trimmed = line.trim();

      // Skip internal directive
      if (trimmed === "@zod.include") return;

      if (trimmed.startsWith("@zod.import ")) {
        lastDecoratorIndex = -1;
        return;
      }

      // Handle @zod.use(name)
      if (trimmed.startsWith("@zod.use(")) {
        const name = extractDecoratorName(trimmed);
        const preset = config.decorators?.[name];
        if (name && !preset) {
          throw new PrismaGuardError(
            `Decorator "${name}" not found in config. Check your prisma-guard.config.js.`,
          );
        }
        if (preset) {
          const presetStr = String(preset);
          if (presetStr.startsWith("z.") || presetStr.startsWith("override ")) {
            const cleanPreset = presetStr.replace(/^override\s+/, "");
            zodType = cleanPreset;
            hasCustomBase = true;
            isEnumUsed = false;
          } else {
            const chainPart = presetStr.startsWith(".")
              ? presetStr.slice(1)
              : presetStr;
            zodType = `${zodType}.${chainPart}`;
          }
        }
        return;
      }

      // Handle general Zod methods
      if (trimmed.startsWith("@zod.")) {
        const command = trimmed.replace("@zod.", "");

        // Skip internal directive again (safety check)
        if (command === "include") return;

        if (command.startsWith("z.") || command.startsWith("override ")) {
          const cleanCommand = command.replace("override ", "");

          if (!hasCustomBase) {
            zodType = cleanCommand;
            hasCustomBase = true;
            isEnumUsed = false;
          } else {
            const chainPart = cleanCommand.startsWith("z.")
              ? cleanCommand.slice(2)
              : cleanCommand;
            zodType = `${zodType}.${chainPart}`;
          }
          zodDecorators.length = 0;
          lastDecoratorIndex = -1;
        } else {
          zodDecorators.push(command);
          lastDecoratorIndex = zodDecorators.length - 1;
          hasCustomBase = true;
        }
      } else if (trimmed.startsWith("@zod")) {
        // Continuation lines
        const continuation = trimmed.startsWith("@zod ")
          ? trimmed.substring(5)
          : trimmed.startsWith("@zod")
            ? trimmed.substring(4)
            : "";

        if (lastDecoratorIndex !== -1) {
          zodDecorators[lastDecoratorIndex] += "\n" + continuation;
        } else if (hasCustomBase) {
          zodType += "\n" + continuation;
        }
      } else if (trimmed !== undefined) {
        descriptionLines.push(trimmed);
        lastDecoratorIndex = -1;
      }
    });
  }

  // --- Post-decorator Logic ---
  if (isEnumUsed && usedEnums) {
    usedEnums.add(field.type);
  }

  // Handle Nullability (Required/Optional)
  if (!field.isRequired) {
    // Only add .nullish() if it's not already overridden as optional/nullish in decorators
    const hasNullabilityOverride = zodDecorators.some(
      (d) =>
        d.includes("optional") ||
        d.includes("nullable") ||
        d.includes("nullish"),
    );
    if (!hasNullabilityOverride) {
      zodType = `${zodType}.nullish()`;
    }
  } else if (!hasDefaultValue) {
    // Required field logic
    if (
      field.type === "String" &&
      !zodType.includes(".min") &&
      !hasCustomBase
    ) {
      zodType = `${zodType}.min(1, { message: REQUIRED_MESSAGE })`;
    } else if (
      field.kind !== "enum" &&
      !hasCustomBase &&
      !zodType.startsWith("z.any") &&
      !zodType.startsWith("z.unknown") &&
      !zodType.includes(".min")
    ) {
      // For non-string/non-enum required types, add required_error
      zodType = `${zodType.replace("()", "({ error: REQUIRED_MESSAGE })")}`;
    }
  }

  // Handle Default Values
  if (field.default !== undefined) {
    let defaultValue: string | undefined;

    if (
      typeof field.default === "string" ||
      typeof field.default === "number" ||
      typeof field.default === "boolean"
    ) {
      defaultValue =
        typeof field.default === "string"
          ? `"${field.default}"`
          : String(field.default);
    } else if (
      typeof field.default === "object" &&
      field.default !== null &&
      (field.default as any).name === "now"
    ) {
      defaultValue = "() => new Date()";
    }

    // if Decimal or BigInt and the default is a literal
    if (
      ["Decimal", "BigInt"].includes(field.type) &&
      typeof field.default !== "object"
    ) {
      defaultValue = `"${field.default}"`;
    }

    if (defaultValue !== undefined) {
      zodType = `${zodType}.default(${defaultValue})`;
    }
  }

  // Add decorators to the chain
  zodDecorators.forEach((decorator) => {
    const call = decorator.startsWith(".") ? decorator : `.${decorator}`;
    zodType += call;
  });

  if (descriptionLines.length > 0 && !config.useJsDoc) {
    zodType += `.describe(${JSON.stringify(descriptionLines.join("\n"))})`;
  }

  return { zodType, descriptionLines };
}

/**
 * Parses model-level decorators for create, update, and shared schemas
 */
export function parseModelDecorators(
  model: any,
  decorators?: Record<string, string>,
) {
  const create: string[] = [];
  const update: string[] = [];
  const shared: string[] = [];
  let lastType: "create" | "update" | "shared" | null = null;

  if (model.documentation) {
    model.documentation.split("\n").forEach((line: string) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("@zod.import ")) {
        lastType = null;
        return;
      }

      // Handle @zod.use(name) for models
      if (trimmed.includes(".use(")) {
        const isCreate = trimmed.startsWith("@zod.create.use(");
        const isUpdate = trimmed.startsWith("@zod.update.use(");
        const isShared = trimmed.startsWith("@zod.use(");

        if (isCreate || isUpdate || isShared) {
          const name = extractDecoratorName(trimmed);
          const preset = decorators?.[name];
          if (name && !preset) {
            throw new PrismaGuardError(
              `Model decorator "${name}" not found in config. Check your prisma-guard.config.js.`,
            );
          }
          if (preset) {
            const presetStr = String(preset);
            if (isCreate) create.push(presetStr);
            else if (isUpdate) update.push(presetStr);
            else shared.push(presetStr);
          }
          return;
        }
      }

      if (trimmed.startsWith("@zod.create.")) {
        create.push(trimmed.replace("@zod.create.", ""));
        lastType = "create";
      } else if (trimmed.startsWith("@zod.update.")) {
        update.push(trimmed.replace("@zod.update.", ""));
        lastType = "update";
      } else if (trimmed.startsWith("@zod.")) {
        // Skip @zod.add which is handled by zod-generator.ts
        if (trimmed.startsWith("@zod.add ")) return;

        shared.push(trimmed.replace("@zod.", ""));
        lastType = "shared";
      } else if (trimmed.startsWith("@zod")) {
        const continuation = trimmed.startsWith("@zod ")
          ? trimmed.substring(5)
          : trimmed.startsWith("@zod")
            ? trimmed.substring(4)
            : "";

        if (lastType === "create" && create.length > 0) {
          create[create.length - 1] += "\n" + continuation;
        } else if (lastType === "update" && update.length > 0) {
          update[update.length - 1] += "\n" + continuation;
        } else if (lastType === "shared" && shared.length > 0) {
          shared[shared.length - 1] += "\n" + continuation;
        }
      } else {
        lastType = null;
      }
    });
  }

  return { create: [...shared, ...create], update: [...shared, ...update] };
}
