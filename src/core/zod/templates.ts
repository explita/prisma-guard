export const REQUIRED_MESSAGE = "is required";

export function getConstantsContent() {
  return `export const REQUIRED_MESSAGE = "${REQUIRED_MESSAGE}";\n`;
}

export function getEnumContent(enums: readonly any[], suffix = "Enum") {
  let content = `import { z } from "zod";\n\n`;
  for (const enumDef of enums) {
    const values = enumDef.values.map((v: any) => `"${v.name}"`).join(", ");
    content += `export const ${enumDef.name}${suffix} = z.enum([${values}]);\n`;
  }
  return content;
}

export function getIndexContent(generatedFiles: string[], hasEnums: boolean, importSuffix = "") {
  const exports = generatedFiles.map((f) => `export * from "./${f}${importSuffix}";`);
  if (hasEnums) {
    exports.push(`export * from "./enums${importSuffix}";`);
  }
  return exports.join("\n");
}
