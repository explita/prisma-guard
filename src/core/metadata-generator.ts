import { z } from "zod";
import fs from "fs";
import path from "path";
import { GeneratorOptions } from "../types.js";

export type MetadataOptions = GeneratorOptions & {
  installVscode?: boolean;
};

export async function generateMetadata({
  outputDir,
  dryRun = false,
  installVscode = false,
}: MetadataOptions) {
  // Common methods shared by almost all Zod types
  const commonMethods = [
    "optional",
    "nullable",
    "nullish",
    "default",
    "describe",
    "refine",
    "superRefine",
    "transform",
    "pipe",
    "catch",
    "brand",
    "readonly",
  ];

  function getMethods(zodType: any) {
    const proto = Object.getPrototypeOf(zodType);
    const methods = Object.getOwnPropertyNames(proto).filter((name) => {
      try {
        return typeof zodType[name] === "function" && !name.startsWith("_");
      } catch (e) {
        return false;
      }
    });

    // Merge with common methods and remove duplicates
    return Array.from(new Set([...methods, ...commonMethods])).sort();
  }

  const metadata = {
    version: (z as any).version || "unknown",
    types: {
      String: getMethods(z.string()),
      Number: getMethods(z.number()),
      BigInt: getMethods(z.bigint()),
      Boolean: getMethods(z.boolean()),
      Date: getMethods(z.date()),
      Symbol: getMethods(z.symbol()),
      Any: getMethods(z.any()),
      Unknown: getMethods(z.unknown()),
      Never: getMethods(z.never()),
      Void: getMethods(z.void()),
      Array: getMethods(z.array(z.any())),
      Object: getMethods(z.object({})),
    },
    // Global Zod methods (e.g. z.string(), z.number())
    global: Object.getOwnPropertyNames(z)
      .filter(
        (name) =>
          typeof (z as any)[name] === "function" && !name.startsWith("_"),
      )
      .sort(),
  };

  if (!dryRun) {
    // Generate VS Code Snippets
    const snippets: Record<string, any> = {};
    const allMethods = new Set<string>();

    Object.values(metadata.types).forEach((methods) => {
      methods.forEach((m) => allMethods.add(m));
    });

    allMethods.forEach((method) => {
      snippets[`Zod ${method}`] = {
        prefix: [
          `///@zod.${method}`,
          `///@zod.z.${method}`,
          `/// @zod.${method}`,
          `/// @zod.z.${method}`,
        ],
        body: `${method}(\${1})`,
        description: `Zod validation method: ${method}`,
        scope: "prisma",
      };
    });

    // Add special decorators
    snippets["Zod Import"] = {
      prefix: ["///@zod.import", "/// @zod.import"],
      body: 'import { ${1:messages} } from "${2:@/constants}"',
      description: "Import external constants for Zod schemas",
      scope: "prisma",
    };

    snippets["Zod Omit"] = {
      prefix: ["///@zod.omit", "/// @zod.omit"],
      body: "omit",
      description: "Omit this field from the Zod schema",
      scope: "prisma",
    };

    snippets["Zod Override"] = {
      prefix: ["///@zod.override", "/// @zod.override"],
      body: "override z.${1:string()}",
      description: "Override the entire Zod schema for this field",
      scope: "prisma",
    }

    if (installVscode) {
      const vscodeDir = path.join(process.cwd(), ".vscode");
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }
      const targetSnippetPath = path.join(
        vscodeDir,
        "prisma-guard.code-snippets",
      );
      fs.writeFileSync(targetSnippetPath, JSON.stringify(snippets, null, 2));
      console.log(`[prisma-guard] Installed snippets to ${targetSnippetPath}`);

      // Ensure .vscode is in .gitignore
      try {
        const gitignorePath = path.join(process.cwd(), ".gitignore");
        let gitignore = "";
        if (fs.existsSync(gitignorePath)) {
          gitignore = fs.readFileSync(gitignorePath, "utf-8");
        }

        if (!gitignore.split("\n").some((line) => line.trim() === ".vscode" || line.trim() === ".vscode/")) {
          const prefix = gitignore.length > 0 && !gitignore.endsWith("\n") ? "\n" : "";
          fs.appendFileSync(gitignorePath, `${prefix}.vscode/\n`);
          console.log("[prisma-guard] Added .vscode/ to .gitignore");
        }
      } catch (e) {
        // Silently fail if .gitignore is not accessible
      }
    }
  } else {
    console.log(
      "[prisma-guard] [DRY-RUN] Would generate Zod metadata and snippets.",
    );
  }

  return metadata;
}
