import fs from "fs";
import path from "path";
import { generateDMMFData } from "../lib/generate-dmmf-data.js";
import { formatJsDoc, toKebabCase } from "../lib/utils.js";
import { ZodGeneratorOptions } from "../types.js";
import { defaultTypeMap } from "../lib/constants.js";
import {
  collectCustomImports,
  generateFieldZod,
  parseModelDecorators,
} from "./zod/builders.js";
import {
  getConstantsContent,
  getEnumContent,
  getIndexContent,
} from "./zod/templates.js";
import { PrismaGuardError } from "../lib/error.js";

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
      .filter((m) => !m.documentation?.includes("@zod.omit"));

    if (models.length === 0) continue;

    const fileUsedEnums = new Set<string>();
    let modelsCode = "";

    for (const model of models) {
      let fieldsContent = "";
      for (const field of model.fields) {
        const result = generateFieldZod(
          field,
          {
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
          } as any,
          fileUsedEnums,
        );

        if (result) {
          const { zodType, descriptionLines } = result;
          if (descriptionLines.length > 0 && useJsDoc) {
            fieldsContent += formatJsDoc(descriptionLines, "  ");
          }
          fieldsContent += `  ${field.name}: ${zodType},\n`;
        }
      }

      const { create, update } = parseModelDecorators(model, decorators);

      const existingFieldNames = new Set<string>(
        model.fields.map((f: any) => f.name),
      );

      // Parse custom fields (@zod.add fieldName: zodType)
      if (model.documentation) {
        model.documentation.split("\n").forEach((line: string) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("@zod.add ")) {
            const parts = trimmed.replace("@zod.add ", "").split(":");

            const fieldName = parts[0].trim();
            const zodType = parts.slice(1).join(":").trim();

            if (parts.length < 2 || !fieldName || !zodType) {
              throw new PrismaGuardError(
                `Invalid format for @zod.add in model "${model.name}". ` +
                  `Expected "fieldName: zodType", but got "${trimmed.replace("@zod.add ", "")}".`,
              );
            }

            if (existingFieldNames.has(fieldName)) {
              throw new PrismaGuardError(
                `Duplicate field "${fieldName}" in model "${model.name}". ` +
                  `This field already exists in the database or was already added via @zod.add.`,
              );
            }

            fieldsContent += `  ${fieldName}: ${zodType},\n`;
            existingFieldNames.add(fieldName);
          }
        });
      }

      const descriptionLines =
        model.documentation
          ?.split("\n")
          .map((l: string) => l.trim())
          .filter(
            (l: string) => !l.startsWith("@zod") && !l.startsWith("@pg"),
          ) || [];

      const baseSchema = `z.object({\n${fieldsContent}})`;

      // Build Create Schema
      let createSchema = baseSchema;
      create.forEach((d) => {
        createSchema += d.startsWith(".") ? d : `.${d}`;
      });

      if (descriptionLines.length > 0 && !useJsDoc) {
        createSchema += `.describe(${JSON.stringify(descriptionLines.join("\n"))})`;
      }

      // Build Update Schema
      const sSuffix = schemaSuffix;
      let updateSchema = `${model.name}${sSuffix}.partial()`;
      update.forEach((d) => {
        updateSchema += d.startsWith(".") ? d : `.${d}`;
      });

      modelsCode += `/////////////////////////////////////////\n`;
      modelsCode += `// ${model.name.toUpperCase()} SCHEMA\n`;
      modelsCode += `/////////////////////////////////////////\n\n`;

      if (descriptionLines.length > 0 && useJsDoc) {
        modelsCode += formatJsDoc(descriptionLines);
      }
      modelsCode += `export const ${model.name}${sSuffix} = ${createSchema}\n\n`;
      modelsCode += `export const ${model.name}Update${sSuffix} = ${updateSchema}\n\n`;
      modelsCode += `export type ${model.name} = z.infer<typeof ${model.name}${sSuffix}>\n\n`;
      modelsCode += `export type ${model.name}Update = z.infer<typeof ${model.name}Update${sSuffix}>\n\n`;
    }

    // Post-process modelsCode to detect auto-imports via ref("constants.NAME")
    const autoImports = new Set<string>();
    modelsCode = modelsCode.replace(
      /__GUARD_REF__([a-zA-Z0-9_.()]+)/g,
      (match, fullPath) => {
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
    finalContent += `import { ${allConstantImports.join(", ")} } from "../lib/constants";\n`;

    if (fileUsedEnums.size > 0) {
      const eSuffix = enumSuffix;
      const enumImports = Array.from(fileUsedEnums)
        .sort()
        .map((e) => `${e}${eSuffix}`)
        .join(", ");
      finalContent += `import { ${enumImports} } from "./enums";\n`;
      fileUsedEnums.forEach((e) => globalUsedEnums.add(e));
    }

    const customImports = collectCustomImports(models, content);
    if (customImports.length > 0) {
      customImports.forEach((imp) => {
        finalContent += `${imp}\n`;
      });
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
      getIndexContent(generatedFiles, globalUsedEnums.size > 0),
    );
  }

  return dmmf.datamodel.models.map((m) => m.name);
}
