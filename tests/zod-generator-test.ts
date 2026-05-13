import fs from "fs";
import path from "path";
import { generateZod } from "../src/core/zod-generator.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runZodTests() {
  console.log("🚀 Running Zod Generator Tests...\n");

  const testSchemaDir = path.join(process.cwd(), "tests/tmp-schema");
  const testOutputDir = path.join(process.cwd(), "tests/tmp-output");

  // Create temporary schema
  if (!fs.existsSync(testSchemaDir)) fs.mkdirSync(testSchemaDir, { recursive: true });
  
  const prismaSchema = `
    /// @zod.refine(data => data.val > 0, "Must be positive")
    /// @zod.update.refine(data => !!data.val, "Val is required for update")
    model Test {
      id    String @id
      /// @zod.z.string()
      /// @zod.z.min(5)
      val   Int
    }

    /// @zod.omit
    model Omitted {
      id    String @id
    }
  `;

  fs.writeFileSync(path.join(testSchemaDir, "test.prisma"), prismaSchema);

  // Run Generator
  await generateZod({
    schemaDir: testSchemaDir,
    outputDir: testOutputDir,
    dryRun: false,
  });

  const outputPath = path.join(testOutputDir, "zod/test.ts");
  const indexPath = path.join(testOutputDir, "zod/index.ts");

  assert(fs.existsSync(outputPath), "Should generate test.ts");
  const content = fs.readFileSync(outputPath, "utf-8");

  // Test 1: Multiline Chaining
  assert(
    content.includes("val: z.string().min(5)"),
    "Should support multiline Zod decorators (chained string and min)"
  );

  // Test 2: Model-level Refinements (Create)
  assert(
    content.includes("export const TestSchema = z.object({") &&
    content.includes(".refine(data => data.val > 0, \"Must be positive\")"),
    "Should include shared refinement in Create schema"
  );

  // Test 3: Model-level Refinements (Update)
  assert(
    content.includes("export const TestUpdateSchema = TestSchema.partial()") &&
    content.includes(".refine(data => data.val > 0, \"Must be positive\")") &&
    content.includes(".refine(data => !!data.val, \"Val is required for update\")"),
    "Should include both shared and update-only refinements in Update schema"
  );

  // Test 4: Omission
  assert(!fs.existsSync(path.join(testOutputDir, "zod/omitted.ts")), "Should NOT generate file for omitted model");
  
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  assert(!indexContent.includes('export * from "./omitted"'), "Should NOT export omitted model in index.ts");
  assert(indexContent.includes('export * from "./test"'), "Should export non-omitted model in index.ts");

  console.log("\n🎉 All Zod Generator tests passed!");

  // Cleanup
  // fs.rmSync(testSchemaDir, { recursive: true, force: true });
  // fs.rmSync(testOutputDir, { recursive: true, force: true });
}

runZodTests().catch((e) => {
  console.error(`\n❌ Test failed: ${e.message}`);
  process.exit(1);
});
