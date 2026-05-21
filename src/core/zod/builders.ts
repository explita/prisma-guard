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

    if (
      model.documentation
        ?.split("\n")
        .some((l: string) => l.trim() === "@zod.omit")
    ) {
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
  ignoreOmissions: boolean = false,
  isScalar: boolean = false,
  pickFields?: Set<string>,
  modelOmitFields?: Set<string>,
): { zodType: string; descriptionLines: string[] } | null {
  if (field.kind === "object") {
    if (isScalar) return null;
    const hasDecorator =
      field.documentation &&
      field.documentation
        .split("\n")
        .some((l: string) => l.trim().startsWith("@zod."));
    if (!hasDecorator) return null;
  }

  // Check for explicit inclusion first (bypasses all omissions)
  const isExplicitlyIncluded = field.documentation?.includes("@zod.include");

  if (!ignoreOmissions) {
    // Keep only specified fields (model-level @zod.pick)
    if (pickFields && !pickFields.has(field.name) && !isExplicitlyIncluded) {
      return null;
    }

    // Omit specified fields (model-level @zod.omit(field1, field2, ...))
    if (
      modelOmitFields &&
      modelOmitFields.has(field.name) &&
      !isExplicitlyIncluded
    ) {
      return null;
    }

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
  }

  let zodType = config.typeMap?.[field.type] || "z.any()";
  let isEnumUsed = false;

  if (field.kind === "object") {
    zodType = `z.relation("${field.type}")`;
  }

  if (field.kind === "enum") {
    const eSuffix = config.enumSuffix;
    zodType = `${field.type}${eSuffix}`;
    isEnumUsed = true;
  }

  // Apply list/array before required/optional
  if (field.isList) {
    zodType = `z.array(${zodType})`;
  }

  // --- Process Documentation (Decorators & Descriptions) ---
  const zodDecorators: string[] = [];
  const descriptionLines: string[] = [];
  let hasCustomBase = false;
  let isOverride = false;
  const hasDefaultValue =
    (field.default !== undefined && field.default !== null) ||
    field.isId ||
    field.isUpdatedAt;

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
            isOverride = true;
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

        // Skip internal directives
        if (command === "include" || command === "omit") return;

        const isOverrideCommand =
          command.startsWith("z.") ||
          command.startsWith("override ") ||
          command.startsWith("coerce.") ||
          command.startsWith("enum(");

        if (isOverrideCommand) {
          let cleanCommand = command.replace("override ", "");
          if (
            cleanCommand.startsWith("coerce.") ||
            cleanCommand.startsWith("enum(")
          ) {
            cleanCommand = "z." + cleanCommand;
          }

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

  // --- Process Decorators for Logic ---
  const cleanDecorators = zodDecorators.map((d) =>
    d.startsWith(".") ? d : `.${d}`,
  );

  if (!isOverride) {
    isOverride = cleanDecorators.some(
      (d) => d.startsWith(".z.") || d.startsWith(".override "),
    );
  }

  // Check for absolute override
  const absoluteOverride = cleanDecorators.find(
    (d) => d.startsWith(".z.") || d.startsWith(".override "),
  );

  if (absoluteOverride) {
    zodType = absoluteOverride.startsWith(".override ")
      ? absoluteOverride.replace(".override ", "")
      : absoluteOverride.substring(1); // Remove leading dot
  }

  // --- Post-decorator Logic ---
  if (isEnumUsed && usedEnums) {
    usedEnums.add(field.type);
  }

  // Handle Required validation (min 1) before decorators
  if (!field.isRequired && !isOverride) {
    // Skip
  } else if (!hasDefaultValue && !isOverride && !isScalar) {
    // Required field logic
    if (
      field.type === "String" &&
      !zodType.includes(".min") &&
      !zodDecorators.some((d) => d.includes(".min"))
    ) {
      zodType = `${zodType}.min(1, { message: REQUIRED_MESSAGE })`;
    } else if (
      field.kind !== "enum" &&
      !zodType.startsWith("z.any") &&
      !zodType.startsWith("z.unknown") &&
      !zodType.includes(".min") &&
      !zodDecorators.some((d) => d.includes(".min"))
    ) {
      // For non-string/non-enum required types, add required_error
      zodType = `${zodType.replace("()", "({ error: REQUIRED_MESSAGE })")}`;
    }
  }

  // Add decorators to the chain
  zodDecorators.forEach((decorator) => {
    const call = decorator.startsWith(".") ? decorator : `.${decorator}`;
    zodType += call;
  });

  // Handle Nullability (Required/Optional)
  if (!field.isRequired && !isOverride) {
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
  }

  // Handle Default Values
  if (
    field.default !== undefined &&
    !zodType.includes(".default(") &&
    (!isOverride || config.defaultsOnOverride)
  ) {
    let defaultValue: string | undefined;

    if (
      typeof field.default === "string" ||
      typeof field.default === "number" ||
      typeof field.default === "boolean"
    ) {
      if (
        zodType.startsWith("z.record") ||
        zodType.startsWith("z.array") ||
        zodType.includes(".record(") ||
        zodType.includes(".array(")
      ) {
        defaultValue = String(field.default);
      } else {
        defaultValue =
          typeof field.default === "string"
            ? `"${field.default}"`
            : String(field.default);
      }
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
      if (zodType.includes("number") || zodType.includes("coerce.number")) {
        defaultValue = String(field.default);
      } else if (
        zodType.includes("bigint") ||
        zodType.includes("coerce.bigint")
      ) {
        defaultValue = `${field.default}n`;
      } else {
        defaultValue = `"${field.default}"`;
      }
    }

    if (defaultValue !== undefined) {
      zodType = `${zodType}.default(${defaultValue})`;
    }
  }

  // Handle Scalar Mode Optionality - MUST COME AFTER .default()
  if (isScalar && hasDefaultValue) {
    const alreadyOptional =
      zodType.includes(".optional()") ||
      zodType.includes(".nullish()") ||
      zodType.includes(".default(");
    if (!alreadyOptional) {
      zodType = `${zodType}.optional()`;
    }
  }

  if (descriptionLines.length > 0 && !config.useJsDoc) {
    zodType += `.describe(${JSON.stringify(descriptionLines.join("\n"))})`;
  }

  return {
    zodType,
    descriptionLines,
  };
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
              `Model decorator "${name}" not found in config. Check your prisma-guard.config.(js|mjs|json).`,
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
        if (trimmed.startsWith("@zod.create.omit(")) return;
        if (trimmed.startsWith("@zod.create.pick(")) return;
        create.push(trimmed.replace("@zod.create.", ""));
        lastType = "create";
      } else if (trimmed.startsWith("@zod.update.")) {
        if (trimmed.startsWith("@zod.update.omit(")) return;
        if (trimmed.startsWith("@zod.update.pick(")) return;
        update.push(trimmed.replace("@zod.update.", ""));
        lastType = "update";
      } else if (trimmed.startsWith("@zod.")) {
        // Skip @zod.add variations which are handled by zod-generator.ts
        if (trimmed.startsWith("@zod.add")) return;
        if (trimmed.startsWith("@zod.pick")) return;
        if (trimmed.startsWith("@zod.omit(")) return;

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

/**
 * Parses extra non-Prisma schemas defined in comments via @zod.include(...)
 *
 * Supports two forms:
 * 1. Shorthand:  /// @zod.include(decoratorName)
 *    Looks up `decoratorName` in the decorators config, PascalCases it for the schema name.
 * 2. Inline:     /// @zod.include(SchemaName: z.object({...}))
 *    Uses the inline schema definition directly.
 */
export function parseExtraSchemas(
  rawContent: string,
  decorators?: Record<string, string>,
): { name: string; schema: string }[] {
  const lines = rawContent.split("\n");
  const extraSchemas: { name: string; schema: string }[] = [];

  let currentName: string | null = null;
  let currentContent = "";
  let parenCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("///")) {
      currentName = null;
      continue;
    }

    // Extract comment content (after "///")
    const commentContent = trimmed.substring(3).trim();

    if (currentName === null) {
      // Form 1: Shorthand — @zod.include(decoratorName)
      const shorthandMatch = commentContent.match(
        /^@zod\.include\(\s*(\w+)\s*\)$/,
      );
      if (shorthandMatch) {
        const decoratorKey = shorthandMatch[1];
        if (!decorators?.[decoratorKey]) {
          throw new PrismaGuardError(
            `Decorator "${decoratorKey}" not found in config. Check your prisma-guard.config.(js|mjs|json).`,
          );
        }
        // PascalCase the decorator key for the schema name
        const schemaName =
          decoratorKey.charAt(0).toUpperCase() + decoratorKey.slice(1);
        extraSchemas.push({
          name: schemaName,
          schema: String(decorators[decoratorKey]),
        });

        continue;
      }

      // Form 2: Inline — @zod.include(Name: z.object({...}))
      const inlineMatch = commentContent.match(
        /^@zod\.include\(\s*(\w+)\s*:\s*(.*)/,
      );
      if (inlineMatch) {
        currentName = inlineMatch[1];
        const rest = inlineMatch[2];
        parenCount = 1; // we've seen the opening parenthesis of include(
        currentContent = "";

        // Count parens in the rest of this line
        let foundEnd = false;
        for (let i = 0; i < rest.length; i++) {
          const char = rest[i];
          if (char === "(") parenCount++;
          else if (char === ")") parenCount--;

          if (parenCount === 0) {
            currentContent += rest.substring(0, i);
            foundEnd = true;
            break;
          }
        }

        if (foundEnd) {
          let schemaStr = currentContent.trim();
          if (/^\w+$/.test(schemaStr)) {
            if (!decorators?.[schemaStr]) {
              throw new PrismaGuardError(
                `Decorator "${schemaStr}" not found in config. Check your prisma-guard.config.(js|mjs|json).`,
              );
            }
            schemaStr = String(decorators[schemaStr]);
          }
          extraSchemas.push({ name: currentName, schema: schemaStr });
          currentName = null;
        } else {
          currentContent += rest + "\n";
        }
      }
    } else {
      // We are in multi-line continuation mode.
      let lineText = commentContent;
      if (lineText.startsWith("@zod. ")) {
        lineText = lineText.substring(6);
      } else if (lineText.startsWith("@zod.")) {
        lineText = lineText.substring(5);
      } else if (lineText.startsWith("@zod ")) {
        lineText = lineText.substring(5);
      } else if (lineText.startsWith("@zod")) {
        lineText = lineText.substring(4);
      }

      let foundEnd = false;
      for (let i = 0; i < lineText.length; i++) {
        const char = lineText[i];
        if (char === "(") parenCount++;
        else if (char === ")") parenCount--;

        if (parenCount === 0) {
          currentContent += lineText.substring(0, i);
          foundEnd = true;
          break;
        }
      }

      if (foundEnd) {
        let schemaStr = currentContent.trim();
        if (/^\w+$/.test(schemaStr)) {
          if (!decorators?.[schemaStr]) {
            throw new PrismaGuardError(
              `Decorator "${schemaStr}" not found in config. Check your prisma-guard.config.(js|mjs|json).`,
            );
          }
          schemaStr = String(decorators[schemaStr]);
        }
        extraSchemas.push({ name: currentName, schema: schemaStr });
        currentName = null;
      } else {
        currentContent += lineText + "\n";
      }
    }
  }

  return extraSchemas;
}
