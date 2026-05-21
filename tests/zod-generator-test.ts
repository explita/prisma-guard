import fs from "fs";
import path from "path";
import { generateZod } from "../src/core/zod/zod-generator.js";

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
  if (!fs.existsSync(testSchemaDir))
    fs.mkdirSync(testSchemaDir, { recursive: true });

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

    model Parent {
      id       String @id
      /// @zod.include
      children Child[]
    }

    model Child {
      id       String @id
      name     String
      parentId String?
      parent   Parent? @relation(fields: [parentId], references: [id])
    }

    /// @zod.pick(name)
    model OmitExceptTest {
      id        String @id
      name      String
      age       Int
      createdAt DateTime
    }

    /// @zod.omit(age, createdAt)
    model OmitTest {
      id        String @id
      name      String
      age       Int
      createdAt DateTime
    }

    /// @zod.pick(email, password).as(Login)
    model UserPickTest {
      id        String @id
      email     String
      password  String
      name      String
      createdAt DateTime
    }

    /// @zod.include(ExtraPayload: z.object({
    /// @zod   name: z.string(),
    /// @zod   status: TestEnumEnum,
    /// @zod   child: z.relation("Child"),
    /// @zod }))

    /// @zod.include(myPresetDecorator)

    /// @zod.include(enumRefDecorator)

    /// @zod.include(refImportDecorator)

    enum TestEnum {
      ACTIVE
      INACTIVE
    }
  `;

  fs.writeFileSync(path.join(testSchemaDir, "test.prisma"), prismaSchema);

  // Run Generator
  await generateZod({
    schemaDir: testSchemaDir,
    outputDir: testOutputDir,
    dryRun: false,
    decorators: {
      myPresetDecorator: "z.object({ presetVal: z.string() })",
      enumRefDecorator: "z.object({ status: __GUARD_REF__TestEnum })",
      refImportDecorator:
        "z.object({ msg: __GUARD_REF__(messages).required__FROM__../../lib/messages })",
    },
  });

  const outputPath = path.join(testOutputDir, "zod/test.ts");
  const indexPath = path.join(testOutputDir, "zod/index.ts");

  assert(fs.existsSync(outputPath), "Should generate test.ts");
  const content = fs.readFileSync(outputPath, "utf-8");

  // Test: Relations
  assert(
    content.includes("children: z.array(z.lazy(() => ChildCreateSchema))"),
    "Should resolve z.relation('Child') to lazy ChildCreateSchema",
  );

  // Test 1: Multiline Chaining
  assert(
    content.includes("val: z.string().min(5)"),
    "Should support multiline Zod decorators (chained string and min)",
  );

  // Test 2: Model-level Refinements (Create)
  assert(
    content.includes("export const TestCreateSchema = TestBaseSchema") &&
      content.includes('.refine(data => data.val > 0, "Must be positive")'),
    "Should include shared refinement in Create schema",
  );

  // Test 3: Model-level Refinements (Update)
  assert(
    content.includes(
      "export const TestUpdateSchema = TestBaseSchema.partial()",
    ) &&
      content.includes('.refine(data => data.val > 0, "Must be positive")') &&
      content.includes(
        '.refine(data => !!data.val, "Val is required for update")',
      ),
    "Should include both shared and update-only refinements in Update schema",
  );

  // Test 3b: Scalar Schemas Refinements
  assert(
    content.includes(
      "export const TestCreateScalarSchema = TestBaseScalarSchema",
    ) && content.includes('.refine(data => data.val > 0, "Must be positive")'),
    "Should include refinements in Create Scalar schema",
  );
  assert(
    content.includes(
      "export const TestUpdateScalarSchema = TestBaseScalarSchema.partial()",
    ) &&
      content.includes('.refine(data => data.val > 0, "Must be positive")') &&
      content.includes(
        '.refine(data => !!data.val, "Val is required for update")',
      ),
    "Should include refinements in Update Scalar schema",
  );

  // Test 4: Omission
  assert(
    !fs.existsSync(path.join(testOutputDir, "zod/omitted.ts")),
    "Should NOT generate file for omitted model",
  );

  const indexContent = fs.readFileSync(indexPath, "utf-8");
  assert(
    !indexContent.includes('export * from "./omitted"'),
    "Should NOT export omitted model in index.ts",
  );
  assert(
    indexContent.includes('export * from "./test"'),
    "Should export non-omitted model in index.ts",
  );

  // Test 5: Omit all except create schema assertions
  assert(
    content.includes(
      "const OmitExceptTestBaseSchema = z.object({\n" +
        "  name: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "})",
    ),
    "Should only contain name field in OmitExceptTestBaseSchema",
  );

  // Test 5b: Omit all except update schema assertions (should have all fields)
  assert(
    content.includes(
      "const OmitExceptTestUpdateBaseSchema = z.object({\n" +
        "  id: z.string().trim(),\n" +
        "  name: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  age: z.number({ error: REQUIRED_MESSAGE }),\n" +
        "  createdAt: z.coerce.date({ error: REQUIRED_MESSAGE }),\n" +
        "})",
    ),
    "Update schema should contain all fields",
  );

  // Test 5c: Omit all except scalar schema assertions (should ignore omitAllExcept)
  assert(
    content.includes(
      "const OmitExceptTestBaseScalarSchema = z.object({\n" +
        "  id: z.string().trim().optional(),\n" +
        "  name: z.string().trim(),\n" +
        "  age: z.number(),\n" +
        "  createdAt: z.coerce.date(),\n" +
        "})",
    ),
    "Scalar schema should ignore omitAllExcept",
  );

  // Test 5d: Extra non-Prisma model schema assertions
  assert(
    content.includes("const ExtraPayloadBaseSchema = z.object({"),
    "Should generate ExtraPayloadBaseSchema",
  );
  assert(
    content.includes(
      "export const ExtraPayloadCreateSchema = ExtraPayloadBaseSchema",
    ),
    "Should export ExtraPayloadCreateSchema",
  );
  assert(
    content.includes("status: TestEnumEnum"),
    "Should map and import enum suffix correctly for extra schemas",
  );
  assert(
    content.includes("child: z.lazy(() => ChildCreateSchema)"),
    "Should rewrite and resolve z.relation('Child') inside extra schemas",
  );
  assert(
    content.includes(
      "const MyPresetDecoratorBaseSchema = z.object({ presetVal: z.string() })",
    ),
    "Should resolve shorthand @zod.include(decoratorName) and PascalCase the name",
  );
  assert(
    content.includes(
      "export type ExtraPayloadCreate = z.infer<typeof ExtraPayloadCreateSchema>",
    ),
    "Should generate type inference helper for extra schemas",
  );

  // Test 5e: __GUARD_REF__ enum resolution in extra schemas
  assert(
    content.includes(
      "const EnumRefDecoratorBaseSchema = z.object({ status: TestEnumEnum })",
    ),
    "Should resolve __GUARD_REF__EnumName to EnumNameEnum and auto-import",
  );
  // Test 5f: v.var() with explicit import path (__FROM__)
  assert(
    content.includes(
      "const RefImportDecoratorBaseSchema = z.object({ msg: messages.required })",
    ),
    "Should resolve __GUARD_REF__ with __FROM__ to the variable path",
  );
  assert(
    content.includes('import { messages } from "../../lib/messages";'),
    "Should generate import statement from __FROM__ import path",
  );
  // Test 5g: Model-level @zod.omit
  assert(
    content.includes(
      "const OmitTestBaseSchema = z.object({\n" +
        "  id: z.string().trim(),\n" +
        "  name: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "})",
    ),
    "Should omit specified fields in OmitTestBaseSchema",
  );

  assert(
    !content.includes("const OmitTestUpdateBaseSchema ="),
    "Should NOT generate OmitTestUpdateBaseSchema since fields are identical",
  );

  assert(
    content.includes(
      "export const OmitTestUpdateSchema = OmitTestBaseSchema.partial()",
    ),
    "Should export OmitTestUpdateSchema defined as OmitTestBaseSchema.partial()",
  );

  assert(
    content.includes(
      "const OmitTestBaseScalarSchema = z.object({\n" +
        "  id: z.string().trim().optional(),\n" +
        "  name: z.string().trim(),\n" +
        "  age: z.number(),\n" +
        "  createdAt: z.coerce.date(),\n" +
        "})",
    ),
    "Scalar schema should ignore model-level @zod.omit",
  );

  // Test 5h: Named pick schema and its variants
  assert(
    content.includes(
      "const LoginBaseSchema = z.object({\n" +
        "  email: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  password: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "})",
    ),
    "Should generate LoginBaseSchema containing only email and password",
  );

  assert(
    !content.includes("const LoginUpdateBaseSchema ="),
    "Should NOT generate LoginUpdateBaseSchema since fields are identical",
  );

  assert(
    content.includes("export const LoginCreateSchema = LoginBaseSchema"),
    "Should export LoginCreateSchema",
  );

  assert(
    content.includes(
      "export const LoginUpdateSchema = LoginBaseSchema.partial()",
    ),
    "Should export LoginUpdateSchema defined as LoginBaseSchema.partial()",
  );

  assert(
    content.includes(
      "const UserPickTestBaseSchema = z.object({\n" +
        "  id: z.string().trim(),\n" +
        "  email: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  password: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  name: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  createdAt: z.coerce.date({ error: REQUIRED_MESSAGE }),\n" +
        "})",
    ),
    "Should generate UserPickTestBaseSchema containing all fields",
  );

  assert(
    content.includes(
      "export type LoginCreate = z.infer<typeof LoginCreateSchema>",
    ),
    "Should export LoginCreate type",
  );

  assert(
    content.includes(
      "export type LoginUpdate = z.infer<typeof LoginUpdateSchema>",
    ),
    "Should export LoginUpdate type",
  );

  // Assert that no scalar variants (schemas or types) are generated for named picks
  assert(
    !content.includes("LoginBaseScalarSchema"),
    "Should NOT generate LoginBaseScalarSchema",
  );
  assert(
    !content.includes("LoginCreateScalarSchema"),
    "Should NOT generate LoginCreateScalarSchema",
  );
  assert(
    !content.includes("LoginUpdateScalarSchema"),
    "Should NOT generate LoginUpdateScalarSchema",
  );
  assert(
    !content.includes("export type LoginScalar ="),
    "Should NOT generate LoginScalar type",
  );
  assert(
    !content.includes("export type LoginScalarInput ="),
    "Should NOT generate LoginScalarInput type",
  );
  assert(
    !content.includes("export type LoginScalarUpdate ="),
    "Should NOT generate LoginScalarUpdate type",
  );
  assert(
    !content.includes("export type LoginCreateRequired ="),
    "Should NOT generate LoginCreateRequired type",
  );

  // Test 5i: Named pick schema bypassing local and global omissions
  const omissionBypassSchemaDir = path.join(
    process.cwd(),
    "tests/tmp-schema-bypass",
  );
  const omissionBypassOutputDir = path.join(
    process.cwd(),
    "tests/tmp-output-bypass",
  );
  if (!fs.existsSync(omissionBypassSchemaDir))
    fs.mkdirSync(omissionBypassSchemaDir, { recursive: true });

  const omissionBypassPrismaSchema = `
    /// @zod.omit(name)
    /// @zod.pick(id, name, secret, createdAt).as(VerifySecret)
    model OmitAndPickTest {
      id        String @id
      name      String
      /// @zod.omit
      secret    String
      createdAt DateTime
    }
  `;
  fs.writeFileSync(
    path.join(omissionBypassSchemaDir, "bypass.prisma"),
    omissionBypassPrismaSchema,
  );

  await generateZod({
    schemaDir: omissionBypassSchemaDir,
    outputDir: omissionBypassOutputDir,
    dryRun: false,
    omitIds: true,
    omitDates: true,
    zodOmit: ["secret"],
  });

  const bypassOutputPath = path.join(omissionBypassOutputDir, "zod/bypass.ts");
  assert(fs.existsSync(bypassOutputPath), "Should generate bypass.ts");
  const bypassContent = fs.readFileSync(bypassOutputPath, "utf-8");

  // 1. Assert that the main model OmitAndPickTest schema is NOT generated since it is empty
  assert(
    !bypassContent.includes("OmitAndPickTest"),
    "OmitAndPickTest schemas and types should not be created since they are completely empty",
  );

  // 2. Assert that the named pick schema VerifySecret INCLUDES all picked fields
  assert(
    bypassContent.includes(
      "const VerifySecretBaseSchema = z.object({\n" +
        "  id: z.string().trim(),\n" +
        "  name: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  secret: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),\n" +
        "  createdAt: z.coerce.date({ error: REQUIRED_MESSAGE }),\n" +
        "})",
    ),
    "VerifySecretBaseSchema should include all picked fields bypassing local/global omissions",
  );

  // Clean up bypass dirs
  fs.rmSync(omissionBypassSchemaDir, { recursive: true, force: true });
  fs.rmSync(omissionBypassOutputDir, { recursive: true, force: true });

  // Test 6: Verify error throwing on nonexistent fields
  const invalidSchemaDir = path.join(process.cwd(), "tests/tmp-schema-invalid");
  const invalidOutputDir = path.join(process.cwd(), "tests/tmp-output-invalid");
  if (!fs.existsSync(invalidSchemaDir))
    fs.mkdirSync(invalidSchemaDir, { recursive: true });

  const invalidPrismaSchema = `
    /// @zod.pick(nonexistentField)
    model Invalid {
      id   String @id
      name String
    }
  `;
  fs.writeFileSync(
    path.join(invalidSchemaDir, "invalid.prisma"),
    invalidPrismaSchema,
  );

  let didThrow = false;
  try {
    await generateZod({
      schemaDir: invalidSchemaDir,
      outputDir: invalidOutputDir,
      dryRun: false,
    });
  } catch (e: any) {
    didThrow = true;
    assert(
      e.message.includes(
        'Field "nonexistentField" specified in @zod.pick on model "Invalid" does not exist.',
      ),
      "Should throw clear error with missing field info",
    );
  }
  assert(
    didThrow,
    "Should throw error when a nonexistent field is listed in @zod.pick",
  );

  // Clean up invalid dirs
  fs.rmSync(invalidSchemaDir, { recursive: true, force: true });
  fs.rmSync(invalidOutputDir, { recursive: true, force: true });

  // Test 6b: Verify error throwing on nonexistent fields in @zod.omit
  if (!fs.existsSync(invalidSchemaDir))
    fs.mkdirSync(invalidSchemaDir, { recursive: true });

  const invalidOmitPrismaSchema = `
    /// @zod.omit(nonexistentOmitField)
    model InvalidOmit {
      id   String @id
      name String
    }
  `;
  fs.writeFileSync(
    path.join(invalidSchemaDir, "invalid.prisma"),
    invalidOmitPrismaSchema,
  );

  let didThrowOmit = false;
  try {
    await generateZod({
      schemaDir: invalidSchemaDir,
      outputDir: invalidOutputDir,
      dryRun: false,
    });
  } catch (e: any) {
    didThrowOmit = true;
    assert(
      e.message.includes(
        'Field "nonexistentOmitField" specified in @zod.omit on model "InvalidOmit" does not exist.',
      ),
      "Should throw clear error with missing field info for @zod.omit",
    );
  }
  assert(
    didThrowOmit,
    "Should throw error when a nonexistent field is listed in @zod.omit",
  );

  // Clean up invalid dirs
  fs.rmSync(invalidSchemaDir, { recursive: true, force: true });
  fs.rmSync(invalidOutputDir, { recursive: true, force: true });

  // Test 6c: Verify error throwing on nonexistent fields in @zod.pick(...).as(...)
  if (!fs.existsSync(invalidSchemaDir))
    fs.mkdirSync(invalidSchemaDir, { recursive: true });

  const invalidNamedPickPrismaSchema = `
    /// @zod.pick(nonexistentNamedPickField).as(Login)
    model InvalidNamedPick {
      id   String @id
      name String
    }
  `;
  fs.writeFileSync(
    path.join(invalidSchemaDir, "invalid.prisma"),
    invalidNamedPickPrismaSchema,
  );

  let didThrowNamedPick = false;
  try {
    await generateZod({
      schemaDir: invalidSchemaDir,
      outputDir: invalidOutputDir,
      dryRun: false,
    });
  } catch (e: any) {
    didThrowNamedPick = true;
    assert(
      e.message.includes(
        'Field "nonexistentNamedPickField" specified in @zod.pick(...).as(Login) on model "InvalidNamedPick" does not exist.',
      ),
      "Should throw clear error with missing field info for @zod.pick(...).as(...)",
    );
  }
  assert(
    didThrowNamedPick,
    "Should throw error when a nonexistent field is listed in @zod.pick(...).as(...)",
  );

  // Clean up invalid dirs
  fs.rmSync(invalidSchemaDir, { recursive: true, force: true });
  fs.rmSync(invalidOutputDir, { recursive: true, force: true });

  // Test 7: Verify error throwing on nonexistent shorthand/named decorator key in @zod.include
  if (!fs.existsSync(invalidSchemaDir))
    fs.mkdirSync(invalidSchemaDir, { recursive: true });

  const invalidIncludePrismaSchema = `
    /// @zod.include(nonexistentDecorator)
    model InvalidInclude {
      id   String @id
    }
  `;
  fs.writeFileSync(
    path.join(invalidSchemaDir, "invalid.prisma"),
    invalidIncludePrismaSchema,
  );

  let didThrowInclude = false;
  try {
    await generateZod({
      schemaDir: invalidSchemaDir,
      outputDir: invalidOutputDir,
      dryRun: false,
      decorators: {},
    });
  } catch (e: any) {
    didThrowInclude = true;
    assert(
      e.message.includes(
        'Decorator "nonexistentDecorator" not found in config. Check your prisma-guard.config.(js|mjs|json).',
      ),
      "Should throw clear error with missing decorator info",
    );
  }
  assert(
    didThrowInclude,
    "Should throw error when a nonexistent decorator is referenced in @zod.include",
  );

  console.log("\n🎉 All Zod Generator tests passed!");

  // Cleanup
  // fs.rmSync(testSchemaDir, { recursive: true, force: true });
  // fs.rmSync(testOutputDir, { recursive: true, force: true });
}

runZodTests().catch((e) => {
  console.error(`\n❌ Test failed:`, e);
  process.exit(1);
});
