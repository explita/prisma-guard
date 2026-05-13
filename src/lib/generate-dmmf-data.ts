import path from "path";
import fs from "fs";
import { getDMMF } from "@prisma/internals";

function findPrismaFiles(dir: string) {
  const prismaFiles: string[] = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      prismaFiles.push(...findPrismaFiles(fullPath));
    } else if (file.endsWith(".prisma")) {
      prismaFiles.push(fullPath);
    }
  }

  return prismaFiles;
}

export async function generateDMMFData(
  schemaDir: string,
): Promise<{
  dmmf: Awaited<ReturnType<typeof getDMMF>>;
  prismaFiles: string[];
}> {
  if (!fs.existsSync(schemaDir)) {
    throw new Error(`Prisma schema directory not found at ${schemaDir}`);
  }

  const prismaFiles = findPrismaFiles(schemaDir);

  if (prismaFiles.length === 0) {
    throw new Error(`No .prisma files found in ${schemaDir}`);
  }

  const schema = prismaFiles
    .map((file) => fs.readFileSync(file, "utf-8"))
    .join("\n\n");

  const dmmf = await getDMMF({
    datamodel: schema,
  });

  return {
    dmmf,
    prismaFiles,
  };
}
