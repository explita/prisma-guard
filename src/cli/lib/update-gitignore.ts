import path from "path";
import fs from "fs";

export function updateGitignore(outputDir: string) {
  try {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      const relativeOutputDir = path.relative(process.cwd(), outputDir);

      if (relativeOutputDir && !relativeOutputDir.startsWith("node_modules")) {
        const zodIgnore = path
          .join(relativeOutputDir, "zod")
          .replace(/\\/g, "/");

        const linesToAdd: string[] = [];
        if (!content.includes(zodIgnore)) linesToAdd.push(zodIgnore);

        if (linesToAdd.length > 0) {
          const prefix = content.includes("# Prisma Guard")
            ? ""
            : "\n# Prisma Guard\n";
          fs.appendFileSync(
            gitignorePath,
            `${prefix}${linesToAdd.join("\n")}\n`,
          );
          linesToAdd.forEach((line) =>
            console.log(`[prisma-guard] Added ${line} to .gitignore`),
          );
        }
      }
    }
  } catch (error: any) {
    console.error(`[prisma-guard] Error: ${error.message}`);
  }
}
