import { defineConfig } from "@explita/prisma-guard";

export default defineConfig({
  schemaDir: "./prisma",
  outputDir: "./src/generated",
  omitIds: true,
  omitDates: true,
  zodOmit: ["password"], // Global omission - password won't be in the public UserCreateSchema
  importSuffix: ".js",
});
