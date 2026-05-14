import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

function validateConfig(config: any) {
  const stringFields = ["schemaDir", "outputDir"];
  const booleanFields = [
    "omitIds",
    "omitDates",
    "generateZod",
    "zod",
    "debug",
    "prettier",
    "skipGitignore",
  ];

  for (const field of stringFields) {
    if (config[field] !== undefined && typeof config[field] !== "string") {
      throw new Error(
        `[prisma-guard] Error: ${field} must be a string. Found: ${typeof config[field]}`,
      );
    }
  }

  for (const field of booleanFields) {
    if (config[field] !== undefined && typeof config[field] !== "boolean") {
      throw new Error(
        `[prisma-guard] Error: ${field} must be a boolean. Found: ${typeof config[field]}`,
      );
    }
  }

  if (config.typeMap) {
    if (typeof config.typeMap !== "object") {
      throw new Error(
        `[prisma-guard] Error: typeMap must be an object. Found: ${typeof config.typeMap}`,
      );
    }
    for (const [key, value] of Object.entries(config.typeMap)) {
      if (typeof value !== "string") {
        throw new Error(
          `[prisma-guard] Error: typeMap["${key}"] must be a string. Found: ${typeof value}`,
        );
      }
    }
  }
}

export async function loadConfigFile(reload = false) {
  const root = process.cwd();
  const jsPath = path.join(root, "prisma-guard.config.js");
  const mjsPath = path.join(root, "prisma-guard.config.mjs");
  const jsonPath = path.join(root, "prisma-guard.config.json");

  let config: any = {};

  const getUrl = (p: string) => {
    const url = pathToFileURL(p).href;
    return reload ? `${url}?t=${Date.now()}` : url;
  };

  if (fs.existsSync(jsPath)) {
    try {
      if (reload && typeof require !== "undefined") {
        try {
          delete require.cache[require.resolve(jsPath)];
        } catch (e) {}
      }
      const module = await import(getUrl(jsPath));
      config = module.default || module;
    } catch (e: any) {
      console.warn(
        `[prisma-guard] Warning: Failed to load ${jsPath}: ${e.message}`,
      );
    }
  } else if (fs.existsSync(mjsPath)) {
    try {
      if (reload && typeof require !== "undefined") {
        try {
          delete require.cache[require.resolve(mjsPath)];
        } catch (e) {}
      }
      const module = await import(getUrl(mjsPath));
      config = module.default || module;
    } catch (e: any) {
      console.warn(
        `[prisma-guard] Warning: Failed to load ${mjsPath}: ${e.message}`,
      );
    }
  } else if (fs.existsSync(jsonPath)) {
    try {
      config = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    } catch (e) {
      console.warn(`[prisma-guard] Warning: Failed to parse ${jsonPath}`);
    }
  }

  validateConfig(config);
  return config as Record<string, any>;
}

