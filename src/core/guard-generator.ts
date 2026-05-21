import fs from "fs";
import path from "path";
import { GeneratorOptions, ModelFields } from "../types.js";
import { generateDMMFData } from "../lib/generate-dmmf-data.js";
import { toKebabCase } from "../lib/utils.js";

export async function generateGuards({
  schemaDir,
  dryRun = false,
}: GeneratorOptions) {
  const { dmmf, prismaFiles } = await generateDMMFData(schemaDir);

  const guardOutputDir = path.join(
    process.cwd(),
    "node_modules",
    ".prisma-guard",
    "guards",
  );
  if (!dryRun) {
    if (fs.existsSync(guardOutputDir)) {
      fs.rmSync(guardOutputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(guardOutputDir, { recursive: true });
  }

  const generatedFiles: string[] = [];

  for (const filePath of prismaFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    const modelNames = [...content.matchAll(/model\s+(\w+)\s+\{/g)].map(
      (m) => m[1],
    );

    if (modelNames.length === 0) continue;

    const models = dmmf.datamodel.models.filter((m) =>
      modelNames.includes(m.name),
    );
    if (models.length === 0) continue;

    const fileName = toKebabCase(path.basename(filePath, ".prisma"));
    const result: Record<string, ModelFields> = {};

    for (const model of models) {
      result[model.name] = {
        scalar: model.fields
          .filter((f) => ["scalar", "enum"].includes(f.kind))
          .map((f) => f.name),

        relations: model.fields
          .filter((f) => f.kind === "object")
          .map((f) => ({
            name: f.name,
            model: f.type,
          })),
      };
    }

    if (!dryRun) {
      const jsonPath = path.join(guardOutputDir, `${fileName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    }
    generatedFiles.push(fileName);
  }

  if (dryRun) {
    console.log(
      `[prisma-guard] [DRY-RUN] Would generate guards for files: ${generatedFiles.join(", ")}`,
    );
  }

  return generatedFiles;
}
