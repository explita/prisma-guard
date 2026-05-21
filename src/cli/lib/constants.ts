import { getCurrentPackageVersion } from "../../lib/utils";

export const allowedArgs = [
  "--schema-dir",
  "--output-dir",
  "--omit-ids",
  "--omit-dates",
  "--dry-run",
  "--zod",
  "--no-zod",
  "--help",
  "-h",
  "metadata",
  "--vscode",
  "--skip-gitignore",
  "--prettier",
  "--no-prettier",
  "--watch",
  "-w",
];

export const shortFlags = {
  "--schema-dir": "-s",
  "--output-dir": "-o",
  "--omit-ids": "-i",
  "--omit-dates": "-d",
  "--dry-run": "-r",
  "--zod": "-z",
  "--help": "-h",
  "--vscode": "-v",
  "--skip-gitignore": "-s",
  "--prettier": "-p",
  "--no-prettier": "-np",
  "--watch": "-w",
};

export const defaultConfig = () => {
  const version = getCurrentPackageVersion();
  const versionComment = `// Version: ${version}`;
  return `${versionComment}
import { defineConfig, v } from "@explita/prisma-guard";

export default defineConfig({
  debug: false,
  outputDir: "./generated",
  schemaDir: "./prisma",
  omitDates: true,
  omitIds: true,
  generateZod: true,
  zodOmit: [],
  prettier: true,
  skipGitignore: false,
  decorators: {
    // Example: email: v.chain.email().trim().toLowerCase(),
  },
  typeMap: {
    // Example: "User.email": v.override.string().email(),
  },
  autoTrim: true,
  enumSuffix: "Enum",
  schemaSuffix: "Schema",
  defaultsOnOverride: false,
  fullScalar: true,
});
`;
};
