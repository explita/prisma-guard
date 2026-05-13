import fs from "fs";
import path from "path";
import { generateZod } from "../src/core/zod-generator.js";
import { z, pg, ref } from "../src/index.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runMultilineTests() {
  console.log("🚀 Running Multiline Decorator & Import Tests...\n");

  // Verify Proxy (using template literal to trigger toString)
  assert(
    `${z.string().min(8)}` === "z.string().min(8)",
    "Proxy 'z' should build string",
  );
  assert(
    `${pg.email().trim()}` === ".email().trim()",
    "Proxy 'pg' should build chain string",
  );
  assert(
    `${z.enum(ref("constants").genders)}` ===
      "z.enum(__GUARD_REF__constants.genders)",
    "ref() should allow raw variable references with internal tag",
  );
  
  // Verify Deep Stringify (objects with functions)
  const complex = z.enum(["A", "B"], {
    error: (issue: any) => issue.code
  });
  assert(
    `${complex}`.includes("error:") && `${complex}`.includes("issue.code"),
    "Proxy should deep-stringify objects with functions"
  );

  const testSchemaDir = path.join(process.cwd(), "tests/tmp-schema-multiline");
  const testOutputDir = path.join(process.cwd(), "tests/tmp-output-multiline");

  if (!fs.existsSync(testSchemaDir))
    fs.mkdirSync(testSchemaDir, { recursive: true });

  const prismaSchema = `
    ///@zod.import {
    ///@zod    isEmailAvailable,
    ///@zod  } from "../validations"

    ///@zod.create.check((ctx) => {
    ///@zod  if (!ctx.value.email) return;
    ///@zod })

    ///@zod.use(modelCheck)

    model Employee {
      id    String @id
      /// @zod.refine((val) => {
      /// @zod   return val.length > 0;
      /// @zod })
      name  String
      /// @zod.use("email")
      email String?
      /// @zod.use('password')
      password String @default("123456")
    }
  `;

  fs.writeFileSync(path.join(testSchemaDir, "employee.prisma"), prismaSchema);

  // Run Generator
  await generateZod({
    schemaDir: testSchemaDir,
    outputDir: testOutputDir,
    dryRun: false,
    decorators: {
      email: `${pg.email().min(5)}`,
      password: `${z.string().min(8)}`,
      modelCheck: ".check((ctx) => { console.log('model check'); })",
    },
  });

  const outputPath = path.join(testOutputDir, "zod/employee.ts");
  assert(fs.existsSync(outputPath), "Should generate employee.ts");
  const rawContent = fs.readFileSync(outputPath, "utf-8");
  const content = rawContent.replace(/\r\n/g, "\n");

  // Test 1: Multiline Import (now merged into single line)
  assert(
    content.includes('import { isEmailAvailable } from "../validations"'),
    "Should support multiline @zod.import (and merge it)",
  );

  // Test 2: Multiline Model-level Check
  const modelCheckRegex =
    /\.check\(\(ctx\) => \{\n\s*if \(!ctx\.value\.email\) return;\n\s*\}\)/;
  assert(
    modelCheckRegex.test(content),
    "Should support multiline @zod.create.check",
  );

  // Test 3: Multiline Field-level Refine
  const fieldRefineRegex =
    /\.refine\(\(val\) => \{\n\s*return val\.length > 0;\n\s*\}\)/;
  assert(
    fieldRefineRegex.test(content),
    "Should support multiline field-level @zod.refine",
  );

  // Test 4: Named Decorator (@zod.use)
  assert(
    content.includes(".email().min(5)"),
    "Should support named decorators via @zod.use",
  );
  assert(
    content.includes("password: z.string().min(8)"),
    "Should support override named decorators",
  );

  assert(
    content.includes(".check((ctx) => { console.log('model check'); })"),
    "Should support model-level named decorators",
  );

  // Test 5: Ensure Import is NOT chained onto Schema
  assert(
    !content.includes("}).import"),
    "Should NOT chain @zod.import onto the schema object",
  );

  console.log("\n🎉 Multiline tests passed!");
}

runMultilineTests().catch((e) => {
  console.error(`\n❌ Test failed: ${e.message}`);
  process.exit(1);
});
