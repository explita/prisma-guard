import path from "path";
import fs from "fs";

export function updateGitignore(outputDir: string) {
  try {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      const relativeOutputDir = path.relative(process.cwd(), outputDir);

      if (
        relativeOutputDir &&
        !relativeOutputDir.startsWith("node_modules")
      ) {
        const zodIgnore = path.join(relativeOutputDir, "zod").replace(/\\/g, "/");
        const guardsIgnore = path
          .join(relativeOutputDir, "guards")
          .replace(/\\/g, "/");

        let updated = false;
        if (!content.includes(zodIgnore)) {
          fs.appendFileSync(gitignorePath, `\n# Prisma Guard\n${zodIgnore}\n`);
          console.log(`[prisma-guard] Added ${zodIgnore} to .gitignore`);
          updated = true;
        }
        if (!content.includes(guardsIgnore)) {
          if (!updated) fs.appendFileSync(gitignorePath, `\n# Prisma Guard\n`);
          fs.appendFileSync(gitignorePath, `${guardsIgnore}\n`);
          console.log(`[prisma-guard] Added ${guardsIgnore} to .gitignore`);
        }
      }
    }
  } catch (error: any) {
    console.error(`[prisma-guard] Error: ${error.message}`);
  }
}
