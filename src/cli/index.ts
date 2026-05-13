#!/usr/bin/env node
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { generateFields } from "../core/field-generator.js";
import { generateZod } from "../core/zod-generator.js";
import { generateMetadata } from "../core/metadata-generator.js";
import { loadConfigFile } from "../lib/load-config-file.js";
import { printHelp } from "./lib/help-info.js";
import { allowedArgs } from "./lib/constants.js";
import { updateGitignore } from "./lib/update-gitignore.js";
import { createConfigFile } from "./lib/create-config-file.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const command = args[0] && !args[0].startsWith("-") ? args[0] : "generate";
  const flags = args.filter((a) => a.startsWith("--"));

  // Configuration state
  let config = await loadConfigFile();
  let schemaDir = "";
  let outputDir = "";
  let hasCustomOutputDir = false;
  let dryRun = false;
  let omitIds = false;
  let omitDates = false;
  let generateZodFlag = false;
  let skipGitignore = false;
  let prettierFlag = true;
  let typeMap: any = {};

  function refreshParams() {
    schemaDir =
      args.find((a) => a.startsWith("--schema-dir="))?.split("=")[1] ||
      config.schemaDir ||
      path.join(process.cwd(), "prisma");

    const customOutputDir = args.find((a) => a.startsWith("--output-dir="));
    outputDir =
      customOutputDir?.split("=")[1] ||
      config.outputDir ||
      path.join(process.cwd(), "node_modules", ".prisma-guard");
    hasCustomOutputDir = !!customOutputDir || !!config.outputDir;

    dryRun = args.includes("--dry-run");
    omitIds = args.includes("--omit-ids") || config.omitIds;
    omitDates = args.includes("--omit-dates") || config.omitDates;
    generateZodFlag =
      args.includes("--zod") ||
      args.includes("--generate-zod") ||
      config.generateZod;

    skipGitignore = args.includes("--skip-gitignore") || config.skipGitignore;
    prettierFlag = args.includes("--prettier")
      ? true
      : args.includes("--no-prettier")
        ? false
        : config.prettier !== undefined
          ? config.prettier
          : true;
    typeMap = config.typeMap || {};
  }

  // Initial params
  refreshParams();

  const installVscode = args.includes("--vscode");

  // Validate flags
  for (const flag of flags) {
    const name = flag.split("=")[0];
    if (!allowedArgs.includes(name)) {
      console.error(`[prisma-guard] Error: Unknown argument "${name}"`);
      console.log(
        `[prisma-guard] Allowed arguments: ${allowedArgs.join(", ")}`,
      );
      process.exit(1);
    }
  }

  async function runZodGenerate(prefix = "") {
    console.log(
      `[prisma-guard] ${dryRun ? "[DRY-RUN] " : ""}${prefix}Generating Zod schemas...`,
    );
    const models = await generateZod({
      ...config,
      schemaDir,
      outputDir,
      omitIds,
      omitDates,
      dryRun,
      typeMap,
    });
    console.log(
      `[prisma-guard] Successfully generated Zod schemas for ${models.length} models.`,
    );

    // Run Prettier
    if (!dryRun && hasCustomOutputDir && prettierFlag) {
      runPrettier(outputDir);
    }
  }

  async function runMetadataGenerate() {
    console.log(
      `[prisma-guard] ${dryRun ? "[DRY-RUN] " : ""}Generating Zod metadata...`,
    );
    await generateMetadata({
      schemaDir,
      outputDir,
      dryRun,
      installVscode,
    });
  }

  async function runFieldGenerate() {
    console.log(
      `[prisma-guard] ${dryRun ? "[DRY-RUN] " : ""}Generating fields mapping...`,
    );
    console.log(`[prisma-guard] Schema directory: ${schemaDir}`);
    console.log(`[prisma-guard] Output directory: ${outputDir}`);

    await generateFields({ schemaDir, outputDir, dryRun });
    if (!dryRun) {
      console.log(`[prisma-guard] Successfully generated fields mapping.`);
    }
  }

  async function runAll() {
    await runFieldGenerate();
    if (generateZodFlag) {
      await runZodGenerate("  └─ ");
    }

    // Bake config for runtime extension
    if (!dryRun) {
      const configJson = JSON.stringify(config, null, 2);
      const bootstrapDir = path.join(
        process.cwd(),
        "node_modules",
        ".prisma-guard",
      );
      if (!fs.existsSync(bootstrapDir))
        fs.mkdirSync(bootstrapDir, { recursive: true });
      fs.writeFileSync(
        path.join(bootstrapDir, "runtime-config.json"),
        configJson,
      );
    }

    // Update .gitignore
    if (!skipGitignore) {
      updateGitignore(outputDir);
    }
  }

  try {
    if (command === "init") {
      createConfigFile();
      return;
    }

    const isWatch = args.includes("--watch") || args.includes("-w");

    if (command === "generate") {
      await runAll();

      if (isWatch) {
        filesWatcher({
          schemaDir,
          runGenerators: async (label: string) => {
            if (label.includes("Config")) {
              config = await loadConfigFile(true);
              refreshParams();
            }
            await runAll();
          },
        });
      }
    } else if (command === "zod") {
      await runZodGenerate();
      if (isWatch) {
        filesWatcher({
          schemaDir,
          runGenerators: async (label: string) => {
            if (label.includes("Config")) {
              config = await loadConfigFile(true);
              refreshParams();
            }
            await runZodGenerate();
          },
        });
      }
    } else if (command === "metadata") {
      await runMetadataGenerate();
    } else {
      printHelp();
    }
  } catch (error: any) {
    console.error(`[prisma-guard] Error: ${error.message}`);
    process.exit(1);
  }
}

function runPrettier(outputDir: string) {
  const dirs = ["guards", "zod"];
  try {
    const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
    const targetPaths = dirs
      .map((d) => `"${path.join(absoluteOutputDir, d)}/**/*.{ts,json}"`)
      .join(" ");

    console.log(`[prisma-guard] Running Prettier on ${dirs.join(", ")}...`);
    execSync(`npx prettier --write ${targetPaths} --no-semi`, {
      stdio: "inherit",
    });
    console.log(`[prisma-guard] Prettier completed.`);
  } catch (e: any) {
    console.error(`[prisma-guard] Prettier warning: ${e.message}`);
  }
}

function filesWatcher({
  schemaDir,
  runGenerators,
}: {
  schemaDir: string;
  runGenerators: (label: string) => Promise<void>;
}) {
  console.log(`\n[prisma-guard] Watching for changes in: ${schemaDir}`);
  let timeout: NodeJS.Timeout;

  const handleUpdate = async (label: string) => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      console.log(`[prisma-guard] ${label} detected. Re-generating...`);
      try {
        await runGenerators(label);
        console.log(`[prisma-guard] Waiting for changes...\n`);
      } catch (e: any) {
        console.error(`[prisma-guard] Watch error: ${e.message}`);
      }
    }, 200);
  };

  // Watch Schema
  fs.watch(schemaDir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith(".prisma")) {
      handleUpdate(`Change in ${filename}`);
    }
  });

  // Watch Config (only if not JSON)
  const jsConfigPath = path.join(process.cwd(), "prisma-guard.config.js");
  const mjsConfigPath = path.join(process.cwd(), "prisma-guard.config.mjs");

  [jsConfigPath, mjsConfigPath].forEach((p) => {
    if (fs.existsSync(p)) {
      fs.watch(p, (eventType) => {
        if (eventType === "change") {
          handleUpdate(`Config change (${path.basename(p)})`);
        }
      });
    }
  });

  // Keep process alive
  return new Promise(() => {});
}

main();
