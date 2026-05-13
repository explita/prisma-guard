import path from "path";
import fs from "fs";
import { defaultConfig } from "./constants.js";

export function createConfigFile() {
  const configPath = path.join(process.cwd(), "prisma-guard.config.js");
  if (fs.existsSync(configPath)) {
    console.log("[prisma-guard] Config file already exists.");
    return;
  }
  fs.writeFileSync(configPath, defaultConfig());
  console.log("[prisma-guard] Created prisma-guard.config.js");

  console.log("\n  \x1b[32m✔\x1b[0m \x1b[1mNext Steps:\x1b[0m");
  console.log("  1. Add your Prisma models to your schema files.");
  console.log("  2. Run \x1b[36mnpx prisma-guard\x1b[0m to generate your guards.");
  console.log("  3. Extend your Prisma client:");
  console.log("\n     \x1b[90mimport { PrismaClient } from \"@prisma/client\";\x1b[0m");
  console.log("     \x1b[90mimport { prismaGuard } from \"@explita/prisma-guard\";\x1b[0m");
  console.log("\n     \x1b[90mconst prisma = new PrismaClient().$extends(prismaGuard());\x1b[0m");

  console.log("\n  \x1b[32m💡 Tip:\x1b[0m \x1b[36mnpx prisma-guard\x1b[0m also generates Zod schemas.");
  console.log("     You can start importing them from your output directory immediately!\n");
}
