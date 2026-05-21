import fs from "fs";
import path from "path";
import { generateDMMFData } from "../../lib/generate-dmmf-data.js";
import {
  extractDecoratorName,
  formatJsDoc,
  toKebabCase,
} from "../../lib/utils.js";
import { ZodGeneratorOptions } from "../../types.js";
import { defaultTypeMap } from "../../lib/constants.js";
import {
  collectCustomImports,
  generateFieldZod,
  parseModelDecorators,
  parseExtraSchemas,
} from "./builders.js";
import {
  getConstantsContent,
  getEnumContent,
  getIndexContent,
} from "./templates.js";
import { PrismaGuardError } from "../../lib/error.js";

export async function generateZod({
  schemaDir,
  outputDir,
  omitIds = false,
  omitDates = false,
  dryRun = false,
  typeMap = {},
  decorators = {},
  zodOmit = [],
  autoTrim = true,
  schemaSuffix = "Schema",
  enumSuffix = "Enum",
  useJsDoc = false,
  defaultsOnOverride = false,
  fullScalar = true,
  importSuffix = "",
}: ZodGeneratorOptions) {
  const { dmmf, prismaFiles } = await generateDMMFData(schemaDir);

  const finalTypeMap = { ...defaultTypeMap, ...typeMap } as Record<
    string,
    string
  >;

  if (autoTrim === false) {
    if (finalTypeMap.String === "z.string().trim()") {
      finalTypeMap.String = "z.string()";
    }
    if (finalTypeMap.BigInt === "z.string().trim()") {
      finalTypeMap.BigInt = "z.string()";
    }
  }

  const zodOutputDir = path.join(outputDir, "zod");
  if (!dryRun) {
    if (fs.existsSync(zodOutputDir)) {
      fs.rmSync(zodOutputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(zodOutputDir, { recursive: true });

    // 0. Generate Lib and Constants (Idempotent)
    const libDir = path.join(outputDir, "lib");
    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }

    const constantsPath = path.join(libDir, "constants.ts");
    if (!fs.existsSync(constantsPath)) {
      fs.writeFileSync(constantsPath, getConstantsContent());
    }
  }

  const generatedFiles: string[] = [];
  const globalUsedEnums = new Set<string>();

  // Map every model name to its containing Prisma file name (kebab-cased)
  const modelToFileMap = new Map<string, string>();
  for (const filePath of prismaFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const modelNames = [...content.matchAll(/model\s+(\w+)\s+\{/g)].map(
      (m) => m[1],
    );
    const fileKebabName = toKebabCase(path.basename(filePath, ".prisma"));
    for (const modelName of modelNames) {
      modelToFileMap.set(modelName, fileKebabName);
    }
    const extra = parseExtraSchemas(content, decorators);
    for (const item of extra) {
      modelToFileMap.set(item.name, fileKebabName);
    }
    const namedPickMatches = [
      ...content.matchAll(/@zod\.pick\(([^)]*)\)\s*\.as\s*\((\w+)\)/g),
    ];
    for (const match of namedPickMatches) {
      const alias = match[2];
      modelToFileMap.set(alias, fileKebabName);
    }
  }

  // Build a set of known enum names for resolving references in extra schemas
  const knownEnumNames = new Set(dmmf.datamodel.enums.map((e) => e.name));

  for (const filePath of prismaFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const modelNames = [...content.matchAll(/model\s+(\w+)\s+\{/g)].map(
      (m) => m[1],
    );

    const lines = content.split("\n");
    const models = dmmf.datamodel.models
      .filter((m) => modelNames.includes(m.name))
      .map((m) => {
        // Smart documentation resolver
        const modelLineIndex = lines.findIndex(
          (l) =>
            l.trim().startsWith(`model ${m.name}`) ||
            l.trim().startsWith(`enum ${m.name}`),
        );

        if (modelLineIndex > 0) {
          let i = modelLineIndex - 1;
          const orphanDocs: string[] = [];
          while (i >= 0) {
            const line = lines[i].trim();
            if (line.startsWith("///")) {
              orphanDocs.unshift(line);
            } else if (line === "") {
              // Skip blank lines
            } else {
              break;
            }
            i--;
          }

          if (orphanDocs.length > 0) {
            const rawDocs = orphanDocs
              .map((line) => line.replace("///", "").trim())
              .join("\n");

            if (rawDocs) {
              return { ...m, documentation: rawDocs };
            }
          }
        }
        return m;
      })
      .filter(
        (m) =>
          !m.documentation?.split("\n").some((l) => l.trim() === "@zod.omit"),
      );

    const extraSchemas = parseExtraSchemas(content, decorators);
    if (models.length === 0 && extraSchemas.length === 0) continue;

    const fileUsedEnums = new Set<string>();
    const fileUsedRelations = new Set<string>();
    const refImports = new Map<string, Set<string>>(); // importPath -> Set of named exports
    let modelsCode = "";

    for (const model of models) {
      // Parse @zod.pick(...) and @zod.pick(...).as(...) from model documentation
      let pickFields: Set<string> | undefined;
      const namedPicks: { name: string; fields: Set<string> }[] = [];
      if (model.documentation) {
        for (const line of model.documentation.split("\n")) {
          const trimmed = line.trim();
          const asMatch = trimmed.match(
            /^@zod\.pick\(([^)]*)\)\s*\.as\s*\((\w+)\)$/,
          );
          if (asMatch) {
            const fields = asMatch[1]
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean);
            const alias = asMatch[2];
            namedPicks.push({ name: alias, fields: new Set(fields) });
          } else {
            const match = trimmed.match(/^@zod\.pick\(([^)]*)\)$/);
            if (match) {
              const fields = match[1]
                .split(",")
                .map((f) => f.trim())
                .filter(Boolean);
              pickFields = new Set(fields);
            }
          }
        }
      }

      // Parse @zod.omit(field1, field2, ...) from model documentation
      let modelOmitFields: Set<string> | undefined;
      if (model.documentation) {
        for (const line of model.documentation.split("\n")) {
          const trimmed = line.trim();
          const match = trimmed.match(/^@zod\.omit\(([^)]*)\)$/);
          if (match) {
            const fields = match[1]
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean);
            modelOmitFields = new Set(fields);
            break;
          }
        }
      }

      const fieldConfig = {
        schemaDir,
        outputDir,
        omitIds,
        omitDates,
        typeMap: finalTypeMap,
        decorators,
        zodOmit,
        autoTrim,
        schemaSuffix,
        enumSuffix,
        useJsDoc,
        defaultsOnOverride,
        fullScalar,
      };

      const { create, update } = parseModelDecorators(model, decorators);

      const existingFieldNames = new Set<string>(
        model.fields.map((f) => f.name),
      );

      // Parse custom fields (@zod.add fieldName: zodType)
      const customFields: { name: string; type: string }[] = [];
      let lastFieldIndex = -1;

      if (model.documentation) {
        model.documentation.split("\n").forEach((line: string) => {
          const trimmed = line.trim();

          // Case 1: Shorthand ///@zod.add.use(presetName)
          if (trimmed.startsWith("@zod.add.use(")) {
            const presetName = extractDecoratorName(trimmed);
            const preset = decorators?.[presetName];

            if (!presetName || !preset) {
              throw new PrismaGuardError(
                `Invalid shorthand @zod.add.use in model "${model.name}". ` +
                  `Preset "${presetName}" not found in config decorators.`,
              );
            }

            if (existingFieldNames.has(presetName)) {
              throw new PrismaGuardError(
                `Duplicate field "${presetName}" in model "${model.name}".`,
              );
            }

            customFields.push({ name: presetName, type: String(preset) });
            lastFieldIndex = customFields.length - 1;
            existingFieldNames.add(presetName);
            return;
          }

          // Case 2: Explicit ///@zod.add fieldName: zodType
          if (trimmed.startsWith("@zod.add ")) {
            const parts = trimmed.replace("@zod.add ", "").split(":");

            const fieldName = parts[0].trim();
            let zodType = parts.slice(1).join(":").trim();

            if (parts.length < 2 || !fieldName || !zodType) {
              throw new PrismaGuardError(
                `Invalid format for @zod.add in model "${model.name}". ` +
                  `Expected "fieldName: zodType", but got "${trimmed.replace("@zod.add ", "")}".`,
              );
            }

            if (existingFieldNames.has(fieldName)) {
              throw new PrismaGuardError(
                `Duplicate field "${fieldName}" in model "${model.name}".`,
              );
            }

            // Resolve .use() inside zodType
            while (zodType.includes(".use(")) {
              const presetName = extractDecoratorName(zodType);
              const preset = decorators?.[presetName];
              if (!preset) break;

              // Simple replace for common patterns
              zodType = zodType
                .replace(`.use(${presetName})`, String(preset))
                .replace(`.use("${presetName}")`, String(preset))
                .replace(`.use('${presetName}')`, String(preset));
            }

            customFields.push({ name: fieldName, type: zodType });
            lastFieldIndex = customFields.length - 1;
            existingFieldNames.add(fieldName);
          } else if (
            trimmed.startsWith("@zod.") &&
            !trimmed.startsWith("@zod.add ")
          ) {
            lastFieldIndex = -1;
          } else if (trimmed.startsWith("@zod") && lastFieldIndex !== -1) {
            const continuation = trimmed.startsWith("@zod ")
              ? trimmed.substring(5)
              : trimmed.substring(4);
            customFields[lastFieldIndex].type += "\n" + continuation;
          } else {
            lastFieldIndex = -1;
          }
        });
      }

      if (pickFields) {
        for (const fieldName of pickFields) {
          if (!existingFieldNames.has(fieldName)) {
            throw new PrismaGuardError(
              `Field "${fieldName}" specified in @zod.pick on model "${model.name}" does not exist.`,
            );
          }
        }
      }

      if (modelOmitFields) {
        for (const fieldName of modelOmitFields) {
          if (!existingFieldNames.has(fieldName)) {
            throw new PrismaGuardError(
              `Field "${fieldName}" specified in @zod.omit on model "${model.name}" does not exist.`,
            );
          }
        }
      }

      for (const np of namedPicks) {
        for (const fieldName of np.fields) {
          if (!existingFieldNames.has(fieldName)) {
            throw new PrismaGuardError(
              `Field "${fieldName}" specified in @zod.pick(...).as(${np.name}) on model "${model.name}" does not exist.`,
            );
          }
        }
      }

      const targetSchemas = [
        {
          targetName: model.name,
          currentPickFields: pickFields,
          isNamedPick: false,
        },
        ...namedPicks.map((np) => ({
          targetName: np.name,
          currentPickFields: np.fields,
          isNamedPick: true,
        })),
      ];

      for (const {
        targetName,
        currentPickFields,
        isNamedPick,
      } of targetSchemas) {
        let fieldsContent = "";
        let updateFieldsContent = "";
        let scalarFieldsContent = "";

        for (const field of model.fields) {
          if (
            isNamedPick &&
            currentPickFields &&
            !currentPickFields.has(field.name)
          ) {
            continue;
          }

          // Standard field for Create Schema (with omissions + omitAllExcept)
          const result = generateFieldZod(
            field,
            fieldConfig,
            fileUsedEnums,
            isNamedPick,
            false,
            currentPickFields,
            modelOmitFields,
          );

          if (result) {
            const { zodType, descriptionLines } = result;
            if (descriptionLines.length > 0 && useJsDoc) {
              fieldsContent += formatJsDoc(descriptionLines, "  ");
            }
            fieldsContent += `  ${field.name}: ${zodType},\n`;
          }

          // Standard field for Update Schema (with omissions, ignores omitAllExcept)
          const updateResult = generateFieldZod(
            field,
            fieldConfig,
            fileUsedEnums,
            isNamedPick,
            false,
            undefined, // We already filtered fields in the loop if isNamedPick is true
            modelOmitFields,
          );

          if (updateResult) {
            const { zodType, descriptionLines } = updateResult;
            if (descriptionLines.length > 0 && useJsDoc) {
              updateFieldsContent += formatJsDoc(descriptionLines, "  ");
            }
            updateFieldsContent += `  ${field.name}: ${zodType},\n`;
          }

          // Full scalar field (ignoring omissions)
          if (fullScalar && !isNamedPick) {
            const scalarResult = generateFieldZod(
              field,
              fieldConfig,
              fileUsedEnums,
              true, // ignoreOmissions
              true, // isScalar
              undefined, // We already filtered fields in the loop if isNamedPick is true
            );
            if (scalarResult) {
              const isUpdatedAt =
                field.isUpdatedAt ||
                ["updatedAt", "updated_at"].includes(field.name);

              if (!isUpdatedAt) {
                scalarFieldsContent += `  ${field.name}: ${scalarResult.zodType},\n`;
              }
            }
          }
        }

        customFields.forEach((cf) => {
          if (!currentPickFields || currentPickFields.has(cf.name)) {
            fieldsContent += `  ${cf.name}: ${cf.type},\n`;
          }
          if (
            !isNamedPick ||
            (currentPickFields && currentPickFields.has(cf.name))
          ) {
            updateFieldsContent += `  ${cf.name}: ${cf.type},\n`;
            if (fullScalar && !isNamedPick) {
              scalarFieldsContent += `  ${cf.name}: ${cf.type},\n`;
            }
          }
        });

        if (fieldsContent.trim() === "") {
          continue;
        }

        const sSuffix = schemaSuffix;

        // Collect relations used in this model's fields
        const relationMatches = [
          ...fieldsContent.matchAll(/z\.relation\(['"](\w+)['"]\)/g),
          ...updateFieldsContent.matchAll(/z\.relation\(['"](\w+)['"]\)/g),
        ];
        relationMatches.forEach((m) => fileUsedRelations.add(m[1]));

        const scalarRelationMatches = [
          ...scalarFieldsContent.matchAll(/z\.relation\(['"](\w+)['"]\)/g),
        ];
        scalarRelationMatches.forEach((m) => fileUsedRelations.add(m[1]));

        // Replace z.relation("ModelName") with actual lazy-loaded schema names
        fieldsContent = fieldsContent.replace(
          /z\.relation\(['"](\w+)['"]\)/g,
          `z.lazy(() => $1Create${sSuffix})`,
        );
        updateFieldsContent = updateFieldsContent.replace(
          /z\.relation\(['"](\w+)['"]\)/g,
          `z.lazy(() => $1Create${sSuffix})`,
        );
        scalarFieldsContent = scalarFieldsContent.replace(
          /z\.relation\(['"](\w+)['"]\)/g,
          `z.lazy(() => $1Create${sSuffix})`,
        );

        const descriptionLines =
          model.documentation
            ?.split("\n")
            .map((l: string) => l.trim())
            .filter(
              (l: string) => !l.startsWith("@zod") && !l.startsWith("@pg"),
            ) || [];

        const baseSchema = `z.object({\n${fieldsContent}})`;
        const updateBaseSchema = `z.object({\n${updateFieldsContent}})`;

        // Schema and Type names
        const baseName = `${targetName}Base${sSuffix}`;
        const updateBaseName = `${targetName}UpdateBase${sSuffix}`;
        const createName = `${targetName}Create${sSuffix}`;
        const updateName = `${targetName}Update${sSuffix}`;
        const baseScalarName = `${targetName}BaseScalar${sSuffix}`;
        const createScalarName = `${targetName}CreateScalar${sSuffix}`;
        const updateScalarName = `${targetName}UpdateScalar${sSuffix}`;

        const createType = `${targetName}Create`;
        const inputType = `${targetName}Input`;
        const updateType = `${targetName}Update`;
        const scalarType = `${targetName}Scalar`;
        const scalarInputType = `${targetName}ScalarInput`;
        const scalarUpdateType = `${targetName}ScalarUpdate`;
        const createRequiredType = `${targetName}CreateRequired`;

        // Build Create Schema
        let createSchema = baseName;
        if (!isNamedPick) {
          create.forEach((d) => {
            createSchema += d.startsWith(".") ? d : `.${d}`;
          });
        }

        if (descriptionLines.length > 0 && !useJsDoc && !isNamedPick) {
          createSchema += `.describe(${JSON.stringify(descriptionLines.join("\n"))})`;
        }

        // Build Update Schema
        const fieldsAreIdentical =
          fieldsContent.trim() === updateFieldsContent.trim();
        const updateBaseRef = fieldsAreIdentical ? baseName : updateBaseName;
        let updateSchema = `${updateBaseRef}.partial()`;
        if (!isNamedPick) {
          update.forEach((d) => {
            updateSchema += d.startsWith(".") ? d : `.${d}`;
          });
        }

        modelsCode += `/////////////////////////////////////////\n`;
        modelsCode += `// ${targetName.toUpperCase()} SCHEMA\n`;
        modelsCode += `/////////////////////////////////////////\n\n`;

        if (descriptionLines.length > 0 && useJsDoc && !isNamedPick) {
          modelsCode += formatJsDoc(descriptionLines);
        }

        modelsCode += `const ${baseName} = ${baseSchema}\n\n`;
        if (!fieldsAreIdentical) {
          modelsCode += `const ${updateBaseName} = ${updateBaseSchema}\n\n`;
        }
        modelsCode += `export const ${createName} = ${createSchema}\n\n`;
        modelsCode += `export const ${updateName} = ${updateSchema}\n\n`;

        if (fullScalar && !isNamedPick) {
          let baseScalarSchema = `z.object({\n${scalarFieldsContent}})`;

          let createScalarSchema = baseScalarName;
          if (!isNamedPick) {
            create.forEach((d) => {
              createScalarSchema += d.startsWith(".") ? d : `.${d}`;
            });
          }

          let updateScalarSchema = `${baseScalarName}.partial()`;
          if (!isNamedPick) {
            update.forEach((d) => {
              updateScalarSchema += d.startsWith(".") ? d : `.${d}`;
            });
          }

          modelsCode += `const ${baseScalarName} = ${baseScalarSchema}\n\n`;
          modelsCode += `export const ${createScalarName} = ${createScalarSchema}\n\n`;
          modelsCode += `export const ${updateScalarName} = ${updateScalarSchema}\n\n`;
        }

        modelsCode += `export type ${createType} = z.infer<typeof ${createName}>\n`;
        modelsCode += `export type ${inputType} = z.input<typeof ${createName}>\n`;
        modelsCode += `export type ${updateType} = z.infer<typeof ${updateName}>\n`;

        if (fullScalar && !isNamedPick) {
          modelsCode += `export type ${scalarType} = z.infer<typeof ${createScalarName}>\n`;
          modelsCode += `export type ${scalarInputType} = z.input<typeof ${createScalarName}>\n`;
          modelsCode += `export type ${scalarUpdateType} = z.infer<typeof ${updateScalarName}>\n`;
          modelsCode += `export type ${createRequiredType} = Omit<${scalarType}, 'id' | 'createdAt' | 'updatedAt'>\n`;
        }
        modelsCode += `\n`;
      }
    }

    for (const { name, schema } of extraSchemas) {
      // Collect relations used in the extra schema
      const relationMatches = [
        ...schema.matchAll(/z\.relation\(['"](\w+)['"]\)/g),
      ];
      relationMatches.forEach((m) => fileUsedRelations.add(m[1]));

      // Replace z.relation("ModelName") with actual lazy-loaded schema names
      let processedSchema = schema.replace(
        /z\.relation\(['"](\w+)['"]\)/g,
        `z.lazy(() => $1Create${schemaSuffix})`,
      );

      // Resolve __GUARD_REF__ references: match known enum names and apply suffix
      processedSchema = processedSchema.replace(
        /__GUARD_REF__((?:(?!__FROM__)[a-zA-Z0-9_.()])+)(?:__FROM__([^\s,})]+))?/g,
        (_match, fullPath: string, fromPath?: string) => {
          // Check if the ref matches a known enum name
          if (knownEnumNames.has(fullPath)) {
            fileUsedEnums.add(fullPath);
            return `${fullPath}${enumSuffix}`;
          }

          // Extract the import name from the variable path
          const extractName = (varPath: string): string => {
            const parenMatch = varPath.match(/^\((\w+)\)/);
            if (parenMatch) return parenMatch[1];
            return varPath.split(".")[0];
          };

          // If explicit import path is provided via __FROM__
          if (fromPath) {
            const importName = extractName(fullPath);
            const existing = refImports.get(fromPath) || new Set<string>();
            existing.add(importName);
            refImports.set(fromPath, existing);
            return fullPath.replace(/^\((.*?)\)/, "$1");
          }

          // Otherwise, treat as a regular ref (constants, etc.)
          if (fullPath.startsWith("(")) {
            return fullPath.replace(/^\((.*?)\)/, "$1");
          }
          return fullPath;
        },
      );

      // Detect any enum suffix references in the schema to add them to fileUsedEnums
      const enumRegex = new RegExp(`(\\w+)${enumSuffix}`, "g");
      const enumMatches = [...processedSchema.matchAll(enumRegex)];
      enumMatches.forEach((m) => fileUsedEnums.add(m[1]));

      const baseName = `${name}Base${schemaSuffix}`;
      const updateBaseName = `${name}UpdateBase${schemaSuffix}`;
      const createName = `${name}Create${schemaSuffix}`;
      const updateName = `${name}Update${schemaSuffix}`;

      const createType = `${name}Create`;
      const inputType = `${name}Input`;
      const updateType = `${name}Update`;

      modelsCode += `/////////////////////////////////////////\n`;
      modelsCode += `// ${name.toUpperCase()} (EXTRA SCHEMA)\n`;
      modelsCode += `/////////////////////////////////////////\n\n`;
      modelsCode += `const ${baseName} = ${processedSchema}\n\n`;
      modelsCode += `const ${updateBaseName} = ${baseName}\n\n`;
      modelsCode += `export const ${createName} = ${baseName}\n\n`;
      modelsCode += `export const ${updateName} = ${updateBaseName}.partial()\n\n`;

      if (fullScalar) {
        const baseScalarName = `${name}BaseScalar${schemaSuffix}`;
        const createScalarName = `${name}CreateScalar${schemaSuffix}`;
        const updateScalarName = `${name}UpdateScalar${schemaSuffix}`;
        const scalarType = `${name}Scalar`;
        const scalarInputType = `${name}ScalarInput`;
        const scalarUpdateType = `${name}ScalarUpdate`;
        const createRequiredType = `${name}CreateRequired`;

        modelsCode += `const ${baseScalarName} = ${baseName}\n\n`;
        modelsCode += `export const ${createScalarName} = ${baseScalarName}\n\n`;
        modelsCode += `export const ${updateScalarName} = ${baseScalarName}.partial()\n\n`;

        modelsCode += `export type ${createType} = z.infer<typeof ${createName}>\n`;
        modelsCode += `export type ${inputType} = z.input<typeof ${createName}>\n`;
        modelsCode += `export type ${updateType} = z.infer<typeof ${updateName}>\n`;
        modelsCode += `export type ${scalarType} = z.infer<typeof ${createScalarName}>\n`;
        modelsCode += `export type ${scalarInputType} = z.input<typeof ${createScalarName}>\n`;
        modelsCode += `export type ${scalarUpdateType} = z.infer<typeof ${updateScalarName}>\n`;
        modelsCode += `export type ${createRequiredType} = Omit<${scalarType}, 'id' | 'createdAt' | 'updatedAt'>\n`;
      } else {
        modelsCode += `export type ${createType} = z.infer<typeof ${createName}>\n`;
        modelsCode += `export type ${inputType} = z.input<typeof ${createName}>\n`;
        modelsCode += `export type ${updateType} = z.infer<typeof ${updateName}>\n`;
      }
      modelsCode += `\n`;
    }

    // Post-process modelsCode to detect auto-imports via ref("constants.NAME")
    // and explicit import paths via __FROM__
    const autoImports = new Set<string>();
    modelsCode = modelsCode.replace(
      /__GUARD_REF__((?:(?!__FROM__)[a-zA-Z0-9_.()])+)(?:__FROM__([^\s,})]+))?/g,
      (_match, fullPath: string, fromPath?: string) => {
        // Extract the import name from the variable path
        // e.g. "(messages).required" -> "messages", "myModule.thing" -> "myModule"
        const extractImportName = (varPath: string): string => {
          const parenMatch = varPath.match(/^\((\w+)\)/);
          if (parenMatch) return parenMatch[1];
          return varPath.split(".")[0];
        };

        // If explicit import path is provided via __FROM__
        if (fromPath) {
          const importName = extractImportName(fullPath);
          const existing = refImports.get(fromPath) || new Set<string>();
          existing.add(importName);
          refImports.set(fromPath, existing);
          // Strip parens and resolve the variable path
          return fullPath.replace(/^\((.*?)\)/, "$1");
        }

        // If it's an ignored reference e.g. (constants).genders
        if (fullPath.startsWith("(")) {
          return fullPath.replace(/^\((.*?)\)/, "$1");
        }

        if (fullPath.startsWith("constants.")) {
          const name = fullPath.replace("constants.", "");
          const base = name.split(".")[0];
          autoImports.add(base);
          return name;
        }
        return fullPath;
      },
    );

    // Build final file content
    const fileName = toKebabCase(path.basename(filePath, ".prisma"));
    let finalContent = `import { z } from "zod";\n`;

    const allConstantImports = Array.from(
      new Set(["REQUIRED_MESSAGE", ...autoImports]),
    ).sort();
    finalContent += `import { ${allConstantImports.join(", ")} } from "../lib/constants${importSuffix}";\n`;

    if (fileUsedEnums.size > 0) {
      const eSuffix = enumSuffix;
      const enumImports = Array.from(fileUsedEnums)
        .sort()
        .map((e) => `${e}${eSuffix}`)
        .join(", ");
      finalContent += `import { ${enumImports} } from "./enums${importSuffix}";\n`;
      fileUsedEnums.forEach((e) => globalUsedEnums.add(e));
    }

    const currentFileModelNames = new Set(models.map((mod) => mod.name));
    if (fileUsedRelations.size > 0) {
      Array.from(fileUsedRelations)
        .filter((m) => !currentFileModelNames.has(m))
        .sort()
        .forEach((m) => {
          const kebabName = modelToFileMap.get(m) || toKebabCase(m);
          const createImport = `${m}Create${schemaSuffix}`;
          const updateImport = `${m}Update${schemaSuffix}`;

          const importedTypes: string[] = [];
          if (modelsCode.includes(createImport)) {
            importedTypes.push(createImport);
          }
          if (modelsCode.includes(updateImport)) {
            importedTypes.push(updateImport);
          }

          if (importedTypes.length > 0) {
            finalContent += `import { ${importedTypes.join(", ")} } from "./${kebabName}${importSuffix}";\n`;
          }
        });
    }

    const customImports = collectCustomImports(models, content);
    if (customImports.length > 0) {
      customImports.forEach((imp) => {
        finalContent += `${imp}\n`;
      });
    }

    // Inject imports from v.var("path", "importPath")
    if (refImports.size > 0) {
      for (const [importPath, names] of refImports) {
        const sortedNames = Array.from(names).sort().join(", ");
        finalContent += `import { ${sortedNames} } from "${importPath}";\n`;
      }
    }

    finalContent += `\n${modelsCode}`;

    if (!dryRun) {
      fs.writeFileSync(path.join(zodOutputDir, `${fileName}.ts`), finalContent);
    }
    generatedFiles.push(fileName);
  }

  // 3. Finalize Output
  if (!dryRun) {
    if (globalUsedEnums.size > 0) {
      const filteredEnums = dmmf.datamodel.enums.filter((e) =>
        globalUsedEnums.has(e.name),
      );
      const eSuffix = enumSuffix;
      fs.writeFileSync(
        path.join(zodOutputDir, "enums.ts"),
        getEnumContent(filteredEnums, eSuffix),
      );
    }

    fs.writeFileSync(
      path.join(zodOutputDir, "index.ts"),
      getIndexContent(generatedFiles, globalUsedEnums.size > 0, importSuffix),
    );
  }

  return dmmf.datamodel.models.map((m) => m.name);
}
