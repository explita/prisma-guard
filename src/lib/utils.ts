import path from "path";
import fs from "fs";

/**
 * Helper to convert PascalCase to kebab-case
 * e.g. "userProfile" -> "user-profile"
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Helper to extract decorator name from .use(name)
 * Supports: .use(name), .use("name"), .use('name')
 */
export function extractDecoratorName(line: string): string {
  const match = line.match(/\.use\(['"]?([\w-]+)['"]?\)/);
  return match ? match[1] : "";
}

export function getCurrentPackageVersion(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      console.error("[prisma-guard] package.json not found");
      return "0.0.0";
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return packageJson.version || "0.0.0";
  } catch (error) {
    console.error("[prisma-guard] Error getting package version:", error);
    return "0.0.0";
  }
}

/**
 * Format description lines into JSDoc format
 */
export function formatJsDoc(lines: string[], indent: string = ""): string {
  if (lines.length === 0) return "";
  
  // Join lines with an empty " * " line between them to preserve breaks in IDE hover
  const content = lines
    .map((l) => `${indent} * ${l}`)
    .join(`\n${indent} *\n`);

  return `${indent}/**\n${content}\n${indent} */\n`;
}
