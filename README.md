# Prisma Guard

<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:30px">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://prisma.io"><img src="https://img.shields.io/badge/Prisma-7.x-2D3748.svg" alt="Prisma" /></a>
  <a href="https://zod.dev"><img src="https://img.shields.io/badge/Zod-4.x-3E6B9B.svg" alt="Zod" /></a>
  <a href="https://github.com/explita/prisma-guard"><img src="https://img.shields.io/badge/Zero--Config-Magic-6A0DAD?style=flat-square" alt="Zero-Config" /></a>
</div>

The ultimate Prisma companion for **input sanitization** and **professional Zod schema generation**. Protect your database from unknown fields and validate your data with zero-effort, type-safe schemas.

## 📋 Table of Contents

- [🚀 Why Prisma Guard?](#-why-prisma-guard)
- [✌️ Two Ways to Use Prisma Guard](#️-two-ways-to-use-prisma-guard)
- [📦 Installation](#-installation)
- [🛠️ Configuration](#-configuration)
  - [Custom Type Mappings](#custom-type-mappings)
- [📖 Features & Usage](#-features--usage)
  - [Smart Multi-File Grouping](#smart-multi-file-grouping)
  - [Zod Schema Generation](#zod-schema-generation)
  - [Multi-line Comment Decorators](#multi-line-comment-decorators)
  - [Named Decorators (@zod.use)](#named-decorators-zoduse)
  - [Persistence & Customization](#-persistence--customization)
  - [Model-Level Refinements](#model-level-refinements)
  - [Custom Virtual Fields (@zod.add)](#custom-virtual-fields-zodadd)
  - [Handling Arrays](#handling-arrays)
  - [Extra Non-Prisma Schemas (@zod.include)](#extra-non-prisma-schemas-zodinclude)
  - [Omission & Customization](#omission--customization)
  - [Watch Mode (Developer Experience)](#watch-mode-developer-experience)
- [🪄 IDE Integration](#-ide-integration-the-magic)
- [🛡️ Prisma Extension](#-prisma-extension-the-guard)
  - [⚠️ Understanding the Guard's Boundaries](#️-understanding-the-guards-boundaries)
- [🚀 Production & CI/CD](#-production--cicd)
- [🏗️ Architecture](#-architecture)
- [⚡ Performance](#-performance)
- [🔧 Troubleshooting](#-troubleshooting)
- [💖 Support the Mission](#-support-the-mission)
- [📜 License](#-license)

#

## 🚀 Why Prisma Guard?

Prisma is great, but validating inputs and stripping unknown fields can be a manual chore. **Prisma Guard** bridges this gap by providing:

1.  🛡️ **Runtime Protection**: A Prisma extension that silently strips unknown fields from your queries.
2.  ⚡ **Zod Generation**: Automatically transforms your Prisma models into robust, decorated Zod schemas.
3.  🧙 **IDE Superpowers**: Automated VS Code snippets and metadata for a seamless developer experience.
4.  ✨ **Zero-Config**: Automatic `.gitignore` management, Prettier formatting, and folder cleanup.
5.  📋 **CLI Command Reference**: A comprehensive CLI command reference with detailed information about each command and its flags, with quick start examples.

#

## ✌️ Two Ways to Use Prisma Guard

### Mode 1: Runtime Protection Only

- Add the extension to your Prisma client
- No Zod schemas generated
- Fields silently stripped
- **Best for:** Quick protection, no validation needs

### Mode 2: Full Validation (Recommended)

- Generate Zod schemas
- Validate before database operations
- Provide clear error messages to users
- **Best for:** Production APIs, user input validation

#

## 📦 Installation

```bash
npm install @explita/prisma-guard
```

### ⚡ Quick Start (2 minutes)

```bash
# 1. Create your config
npx prisma-guard init

# 2. Create Prisma Schema files
# Place these files in the schema directory (default: ./prisma)
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

# 3. Generate schemas
npx prisma-guard

# 4. Use in your code
import { PrismaClient } from "@prisma/client";
import { prismaGuard } from "@explita/prisma-guard";

const prisma = new PrismaClient().$extends(prismaGuard());

// That's it! Extra fields are automatically stripped

```

#

## 🛠️ Configuration

You can use a `.json` file, or a `.js` / `.mjs` file for full type safety and logic.

Example: `prisma-guard.config.(js|mjs|json)`

#

### Option A: `.js` or `.mjs` with `defineConfig` (Recommended)

This provides full IntelliSense and type checking:

```javascript
import { defineConfig } from "@explita/prisma-guard";

export default defineConfig({
  schemaDir: "./prisma",
  outputDir: "./generated",
  omitIds: true,
  omitDates: true, // Automatically skip createdAt/updatedAt
  autoTrim: true, // Automatically add .trim() to all strings (default: true)
  schemaSuffix: "Schema", // Suffix for generated schemas (default: "Schema")
  enumSuffix: "Enum", // Suffix for generated enums (default: "Enum")
  useJsDoc: false, // Use /** */ instead of .describe()
  typeMap: {
    DateTime: "z.string().datetime()",
  },
  zodOmit: ["password", "secret", "resetToken"], // Global omission
  defaultsOnOverride: false, // Keep @default() when using @zod.z.override

  // Without this (default: false):
  // /// @zod.z.enum(["A","B"])  → z.enum(["A","B"])  (default LOST)

  // With this (true):
  // /// @zod.z.enum(["A","B"])  → z.enum(["A","B"]).default("A") (default KEPT)

  decorators: {
    // 🔗 Chain validations onto inferred Prisma types
    email: v.chain.email().trim().toLowerCase(),

    // 🤝 Auto-imported and lazy-loaded relations
    orderItems: v.array(v.relation("OrderItem")),

    // 🛡️ Auto-imported validation constants
    message: v.var("constants.REQUIRED_MESSAGE"),
  },
});
```

### Option B: `.js` or `.mjs` with JSDoc

If you don't want to import the helper:

```javascript
/** @type {import('@explita/prisma-guard').PrismaGuardConfig} */
export default {
  schemaDir: "./prisma",
  // IntelliSense works here too!
};
```

### Option C: `.json`

```json
{
  "schemaDir": "./prisma",
  "outputDir": "./generated",
  "omitIds": true,
  "omitDates": true,
  "autoTrim": true,
  "schemaSuffix": "Schema",
  "enumSuffix": "Enum",
  "useJsDoc": false,
  "generateZod": true,
  "debug": false,
  "typeMap": {
    "DateTime": "z.string().datetime()"
  }
}
```

#

### Configuration Notes:

- **`schemaDir`**: Optional. Defaults to `"./prisma"`. Path to the directory containing your Prisma schema files.
- **`outputDir`**: Optional. Defaults to `node_modules/.prisma-guard`.
  - This is the directory for your generated **Zod schemas**.
  - **Note**: Internal guard files (JSON) are ALWAYS written to `node_modules/.prisma-guard` regardless of this setting to keep your project clean.
  - If you need Zod schemas in your code, set this to a committed directory (e.g., `./src/generated`).
- **`omitIds`**: Optional. Defaults to `false`. Remove all `@id` fields from generated Zod schemas.
- **`omitDates`**: Optional. Defaults to `false`. Remove timestamp fields (e.g., `createdAt` and `updatedAt`) from generated schemas.
- **`generateZod`**: Optional. Defaults to `true`. Whether to generate Zod schemas. If `false`, only the runtime guard utilities are generated.
- **`zodOmit`**: Optional. Defaults to `[]`. Global list of field names to omit from ALL generated Zod schemas (e.g., `["password", "secret"]`).
- **`autoTrim`**: Optional. Defaults to `true`. Automatically add `.trim()` to all `z.string()` validations.
- **`schemaSuffix`**: Optional. Defaults to `"Schema"`. Suffix appended to generated Zod schema names (e.g., `UserSchema`).
- **`enumSuffix`**: Optional. Defaults to `"Enum"`. Suffix appended to generated Zod enum schemas (e.g., `RoleEnum`).
- **`useJsDoc`**: Optional. Defaults to `false`. Use `/** */` comments in generated TypeScript files instead of `.describe()`.
- **`debug`**: Optional. Defaults to `false`. Enable debug logging to console.
- **`prettier`**: Optional. Defaults to `true`. Set to `false` to disable automatic Prettier formatting on generated files.
- **`skipGitignore`**: Optional. Defaults to `false`. Set to `true` to prevent the tool from automatically updating your `.gitignore`.
- **`typeMap`**: Optional. You only need to provide the types you want to **override**.
- **`decorators`**: Optional. Named validation decorators for reuse across your Prisma schema with `/// @zod.use(name)`.
- **`fullScalar`**: Optional. Defaults to `true`. When enabled, the generator creates additional Scalar-focused Zod schemas and TypeScript types (e.g. `ServiceScalar`, `ServiceCreateRequired`) that are highly ergonomic for service-layer inputs.
- **`defaultsOnOverride`**: Optional. Defaults to `false`. By default, using an absolute override (`///@zod.z.` or `override `) strips Prisma's `@default()` from the Zod schema. Set to `true` to force appending `.default()` even on overridden fields.
- **`importSuffix`**: Optional. Defaults to `""`. Suffix appended to internally generated relative imports (e.g., `".js"`). Useful for Node ESM or certain bundler setups.

> **✨ Zero-Config Magic**: Prisma Guard automatically manages your `.gitignore`, formats generated code with Prettier, and cleans up old folders. No manual setup required.

#

### Custom Type Mappings:

| Prisma Type | Default Zod Mapping                 |
| :---------- | :---------------------------------- |
| `String`    | `z.string().trim()`                 |
| `Int`       | `z.number()`                        |
| `BigInt`    | `z.string().trim()`                 |
| `Float`     | `z.number()`                        |
| `Decimal`   | `z.union([z.number(), z.string()])` |
| `Boolean`   | `z.boolean()`                       |
| `DateTime`  | `z.coerce.date()`                   |
| `Json`      | `z.unknown()`                       |
| `Bytes`     | `z.instanceof(Buffer)`              |

#

## 📖 Features & Usage

### Smart Multi-File Grouping

Prisma Guard respects your organization. If you use multiple `.prisma` files (e.g., via Prisma's `prismaSchemaFolder` feature), the generator will mirror that structure.

- `schema/user.prisma` → `generated/zod/user.ts`
- `schema/product.prisma` → `generated/zod/product.ts`

This keeps your schemas clean and prevents massive, unmanageable files.

#

### Zod Schema Generation

Transform your `.prisma` files into kebab-cased `.ts` files containing Zod schemas for every model.

```bash
npx prisma-guard generate
# Or just generate the Zod schemas
npx prisma-guard zod
```

### 💎 Advanced Type Ergonomics

Prisma Guard doesn't just generate schemas; it provides a complete set of TypeScript types for your entire application lifecycle.

By default (via `fullScalar: true`), every model generates **Dual Schemas**:

1.  **Public Schemas** (`UserCreateSchema`): Respects your `zodOmit` and `@zod.omit` rules. Perfect for API validation.
2.  **Scalar Schemas** (`UserCreateScalarSchema`): Includes **every** database field. Perfect for internal services and DB operations.

#### Generated Types Reference

For a model named `Service`, the following types are exported:

| Type                        | Description                                                                                                       |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **`ServiceCreate`**         | The output of `ServiceCreateSchema`. Restricted for public APIs.                                                  |
| **`ServiceInput`**          | The raw input for `ServiceCreateSchema` (before Zod defaults).                                                    |
| **`ServiceUpdate`**         | Partial version of `ServiceCreate` for patch operations.                                                          |
| **`ServiceScalar`**         | The internal database record (includes omitted fields).                                                           |
| **`ServiceScalarInput`**    | Raw input for the scalar schema.                                                                                  |
| **`ServiceScalarUpdate`**   | Partial version of the internal record.                                                                           |
| **`ServiceCreateRequired`** | **The ultimate service type.** Omits all fields with defaults (id, createdAt, etc.) but requires internal fields. |

> [!TIP]
> **Internal Service Layer**: Always use **`ModelCreateRequired`** for your service functions. It ensures you provide required internal fields (like `tenantId`) while keeping DB-managed fields (like `id` or `status`) optional!

#

#### `fullScalar` Code Generation Comparison

For a model with omitted fields, here is what gets generated under both configurations:

#

##### Option A: `fullScalar: true` (Default)

Under this setting, the generator produces both **Public** (omission-aware) and **Scalar** (database-complete) schemas:

```typescript
// generated/zod/service.ts
import { z } from "zod";

// 1. Public Schema (respects @zod.omit, zodOmit config, @zod.pick, etc.)
export const ServiceCreateSchema = z.object({
  name: z.string().trim().min(1),
  // 'secretApiKey' and 'tenantId' are omitted from the public schema
});

export const ServiceUpdateSchema = ServiceCreateSchema.partial();

// 2. Scalar Schema (ignores omissions, contains all database fields)
export const ServiceCreateScalarSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  secretApiKey: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  createdAt: z.coerce.date(),
});

export const ServiceUpdateScalarSchema = ServiceCreateScalarSchema.partial();

// Exports all 7 types (ServiceCreate, ServiceInput, ServiceUpdate, ServiceScalar, ServiceScalarInput, ServiceScalarUpdate, ServiceCreateRequired)
```

#

##### Option B: `fullScalar: false`

If you only need public validation schemas and want to keep output file size minimal:

```typescript
// generated/zod/service.ts
import { z } from "zod";

// ONLY Public Schemas are generated
export const ServiceCreateSchema = z.object({
  name: z.string().trim().min(1),
});

export const ServiceUpdateSchema = ServiceCreateSchema.partial();

// NO Scalar schemas or Scalar/Required types are generated.
// Exports ONLY 3 base types (ServiceCreate, ServiceInput, ServiceUpdate).
```

#

### Multi-line Comment Decorators

Use triple-slash (`///`) comments to fine-tune your schemas. We support complex, multi-line logic for refinements and checks.

**Prisma Schema:**

```prisma
/// @zod.create.check(ctx => {
/// @zod   if (ctx.value.role === 'ADMIN' && !ctx.value.secret) {
/// @zod     ctx.issues.push({ code: 'custom', message: 'Admin needs a secret' });
/// @zod   }
/// @zod })
model User {
  id    String @id
  role  String
  /// @zod.optional()
  secret String?
}
```

**Generated Zod:**

```typescript
// generated/zod/user.ts
import { z } from "zod";
import { REQUIRED_MESSAGE } from "../lib/constants";

export const UserSchema = z
  .object({
    id: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
    role: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
    secret: z.string().trim().nullish().optional(),
  })
  .check((ctx) => {
    if (ctx.value.role === "ADMIN" && !ctx.value.secret) {
      ctx.issues.push({ code: "custom", message: "Admin needs a secret" });
    }
  });
```

#

### Named Decorators (@zod.use)

For complex validation logic that you use frequently, you can define "Named Decorators" in your `prisma-guard.config.js`. This keeps your Prisma schema clean and centralizes your validation logic.

#### 1. Define Decorators in Config

```javascript
// prisma-guard.config.js
import { defineConfig, v } from "@explita/prisma-guard";

export default defineConfig({
  decorators: {
    // Chain validations onto existing type
    email: v.chain.email().trim().toLowerCase(),

    // A complete override (direct call on v)
    strongPassword: v.string().min(12).regex(/[A-Z]/),

    // A complex model check
    ownerCheck: v.chain.check((ctx) => {
      if (!ctx.value.userId) return false;
      return true;
    }),
  },
});
```

#

#### 2. Use in Prisma Schema

```prisma
/// @zod.use(ownerCheck)
model Project {
  id    String @id
  /// @zod.use(email)
  email String
}
```

**Generated Zod:**

```typescript
// generated/zod/project.ts
import { z } from "zod";
import { REQUIRED_MESSAGE } from "../lib/constants";

export const ProjectSchema = z
  .object({
    id: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
    email: z.string().trim().email().trim().toLowerCase(),
  })
  .check((ctx) => {
    if (!ctx.value.userId) return false;
    return true;
  });
```

#

> [!TIP]
> **Autocomplete & IntelliSense**: Always use the **`v`** proxy (or the full `validator` object) imported from `@explita/prisma-guard`. It provides full autocomplete for your decorators while allowing the generator to correctly stringify your validation logic into the generated files.

#### 🤔 Why `v` instead of standard Zod `z`?

While `v` looks and feels exactly like standard Zod (e.g., `v.string().min(8)`), you **must** use `v` instead of importing standard `z` from `"zod"` in your configuration. Here is why:

1. **Proxy Serialization (Stringification)**: Under the hood, `v` is a specialized JavaScript Proxy. Instead of executing Zod validation when the config is loaded, it recursively stringifies your calls (e.g., compile-time representation `"z.string().min(8)"`) so that the code generator can inject actual clean Zod code into your generated schema files. Standard `z` cannot be stringified this way.
2. **Unified API Capabilities**: `v` combines full Zod type definitions with Prisma Guard's custom validation primitives in a single unified namespace:
   - `v.chain` - for chaining validations onto inferred types without overriding them.
   - `v.var(...)` - for referencing external constants/messages and triggering auto-imports.
3. **Prevent Import Conflicts**: Using `v` avoids naming collisions in configuration files where standard Zod's `z` might also need to be imported for other local helper validations.

#

## 🎯 Quick Reference: `v` API

| What you want                   | How to write                                         |
| ------------------------------- | ---------------------------------------------------- |
| Add validation to existing type | `v.chain.email().trim()`                             |
| Replace type completely         | `v.string().min(8)` or `v.enum([...])`               |
| Reference external variable     | `v.var("constants.MSG")`                             |
| Ref variable with import path   | `v.var("(messages).required", "../../lib/messages")` |
| Reference relation schemas      | `v.array(v.relation("Child"))`                       |
| Complex nested types            | `v.record(v.string(), v.any())`                      |

> **Remember**: `v` does it all. No need for multiple imports!

### When to use `v.chain` vs direct `v`?

```javascript
// ✅ Use v.chain when you want to KEEP Prisma's type inference
// Example: String field stays z.string(), but add .email()
email: v.chain.email().trim();

// ✅ Use direct v when you want to REPLACE Prisma's type inference
// Example: String field becomes z.enum() instead
role: v.enum(["ADMIN", "USER"]);

// ❌ Don't use v.chain for type replacement (it won't work)
role: v.chain.enum(["ADMIN"]); // Won't work!

// ✅ Do use direct v for complex nested types
metadata: v.record(v.string(), v.any());

// ✅ Do use v.relation for nested relation fields
// (automatically imports & resolves to the correct Create vs Update schema variant!)
orderItems: v.array(v.relation("OrderItem"));
```

### 🔗 Native Zero-Config Relations

Instead of defining relation schemas in `prisma-guard.config.js` and using `v.relation(...)`, you can simply annotate your relation fields directly in your Prisma schema with **`/// @zod.include`**:

```prisma
model OtherOrder {
  id    String        @id

  /// @zod.include
  items OtherItem[]
}
```

The compiler will automatically:

1. Detects that `items` is a list of `OtherItem` relations.
2. Generate it as **`items: z.array(z.lazy(() => OtherItemCreateSchema))`** (with lazy loading to prevent circular/evaluation order issues).
3. **Inject the necessary imports** at the top of the file automatically!

No custom decorators, no config updates. It just works!

> [!NOTE]
> **Why are relation fields excluded by default?**
>
> By default, `prisma-guard` excludes relation fields (like `items OtherItem[]`) from your generated validation schemas:
>
> 1. **Avoids Payload Validation Bloat**: Relations are typically optional or loaded on-demand (e.g., via Prisma's `include` queries). If relations were included by default, your schemas would force validation of entire, deeply-nested relational objects even for basic requests.
> 2. **Prevents Circular Reference Complexity**: Auto-generating deep relation trees creates massive, heavily interconnected Zod object graphs. This can introduce runtime performance overhead and circular instantiation bugs.
> 3. **Maintains Clear Validation Boundaries**: Keeping relations opt-in keeps your Zod schemas compact and aligned with single-model boundaries. You should only use `/// @zod.include` on fields where you explicitly intend to accept and validate nested relation writes.

> [!TIP]
> **`v.relation()` vs `/// @zod.include`**
>
> Both achieve the same result. Choose based on your preference:
>
> - **Config-level**: Use `v.relation()` in `decorators` for reusable relation patterns
> - **Schema-level**: Use `/// @zod.include` for one-off relations right in your Prisma file

### 🔄 Handling Circular Relations

Prisma Guard automatically detects circular relations and uses `z.lazy()`:

```prisma
model Category {
  id       String     @id
  parent   Category?  @relation("parent")

  /// @zod.include  // Safe! Uses z.lazy()
  children Category[] @relation("parent")
}
```

#

### 📦 Extra Non-Prisma Schemas (`@zod.include`)

Beyond annotating relation fields, `@zod.include` can also define **completely new schemas** that aren't tied to any Prisma model. These "extra schemas" are generated into the same file as the surrounding models, with full Create/Update/Scalar variants and type inference.

There are **three forms**:

#### Form 1: Shorthand — Config Decorator Lookup

Reference a decorator from your `prisma-guard.config.js` by name. The schema name is automatically PascalCased.

**Config:**

```javascript
import { defineConfig, v } from "@explita/prisma-guard";

export default defineConfig({
  decorators: {
    updateQueueItem: v.object({
      id: v.string().min(1, v.var("(messages).required", "../../lib/messages")),
      status: v.var("AppointmentStatus"),
    }),
  },
});
```

**Prisma schema:**

```prisma
/// @zod.include(updateQueueItem)
```

**Generated output** — `UpdateQueueItemBaseSchema`, `UpdateQueueItemCreateSchema`, etc. with auto-resolved enum imports and `v.var` import paths.

#

#### Form 2: Named Decorator Reference

Explicitly name the schema and reference a config decorator:

```prisma
/// @zod.include(UpdateQueueItem: updateQueueItem)
```

Same as Form 1, but you control the generated schema name (`UpdateQueueItem`) independently from the decorator key.

#

#### Form 3: Inline Raw Zod Schema

Define the schema directly in `.prisma` comments using **raw Zod code** (not `v`):

```prisma
/// @zod.include(UpdateQueueItem: z.object({
///   @zod id: z.string().min(1, messages.required),
///   @zod status: AppointmentStatusEnum,
/// @zod }))
```

> [!IMPORTANT]
> **Inline schemas must use raw Zod code** (`z.object`, `z.string`, etc.), not the `v` proxy.
> The `v` proxy only works inside `prisma-guard.config.js` because it's JavaScript that gets executed and stringified at config load time. In `.prisma` comments, the text is parsed as-is.

#### Smart Features

- **Enum resolution**: References like `v.var("AppointmentStatus")` in config decorators are automatically matched against your Prisma enum names, suffixed (e.g., `AppointmentStatusEnum`), and auto-imported.
- **Import generation**: `v.var("(messages).required", "../../lib/messages")` generates `import { messages } from "../../lib/messages";` with Set-based dedup.
- **Relation support**: `z.relation("Child")` in inline schemas is resolved to `z.lazy(() => ChildCreateSchema)` with auto-imports.
- **Full schema variants**: Every extra schema gets `BaseSchema`, `CreateSchema`, `UpdateSchema` (partial), scalar variants, and inferred types — just like Prisma models.

#

### 🚀 Quick Reference: `@zod.include`

| What you want              | How to write                                         |
| -------------------------- | ---------------------------------------------------- |
| Reference config decorator | `/// @zod.include(updateQueueItem)`                  |
| Name + config decorator    | `/// @zod.include(UpdateQueueItem: updateQueueItem)` |
| Inline schema              | `/// @zod.include(Name: z.object({...}))`            |

> [!TIP]
> **Which form should I use?**
>
> - **Shorthand**: When you already have a decorator in config
> - **Named Reference**: When the decorator name differs from desired schema name
> - **Inline Raw Zod**: When the schema is one-off or complex

#

### 🛠️ Persistence & Customization

Prisma Guard generates a `lib/constants.ts` file in your output directory.

- **Persistence**: Unlike the `zod/` folder (which is reset every time), the `lib/` folder is **persistent**.
- **Version Control**: Our `metadata --vscode` command automatically adds `zod/` to your `.gitignore`, but it **leaves `lib/` alone**. You should commit the `lib/` folder to your repository so your team shares the same validation constants.
- **Custom Messages**: You can change the `REQUIRED_MESSAGE` in `lib/constants.ts` to whatever you like.
- **The `v.var()` Helper**: Reference external variables and optionally handle imports automatically.

| Syntax                     | Behavior                                | Generated Output                         |
| :------------------------- | :-------------------------------------- | :--------------------------------------- |
| `v.var("constants.MSG")`   | **Auto-import** from `lib/constants.ts` | `import { MSG } from "../lib/constants"` |
| `v.var("(constants).VAL")` | **Ignore** (No auto-import)             | `constants.VAL` (assumes manual import)  |
| `v.var("myVar")`           | **Raw Reference** (No auto-import)      | `myVar` (assumes manual import)          |

- **Ignored References**: Wrap a part in parentheses to suppress the auto-import (e.g., `v.var("(constants).genders")`). This is useful if you've already imported the variable manually using `///@zod.import`.

```javascript
// prisma-guard.config.js
import { v } from "@explita/prisma-guard";

export default {
  decorators: {
    // This will auto-import { EMAIL_MESSAGE } from "../lib/constants"
    // and generate: .email(EMAIL_MESSAGE)
    email: v.string().email(v.var("constants.EMAIL_MESSAGE")),

    // This will NOT auto-import anything (useful if you have manual imports)
    // and generate: .enum(constants.genders)
    gender: v.enum(v.var("(constants).genders")),

    // This will auto-import { OrderItemCreateSchema } from the correct file (e.g. ./order-item)
    // and generate lazy-loaded relation field: z.lazy(() => OrderItemCreateSchema)
    // Alternatively, just annotate the relation in your Prisma schema with ///@zod.include
    orderItems: v.array(v.relation("OrderItem")),
  },
};
```

#

### Real-World Example

Here's how everything works together:

```ts
// In lib/constants.ts (persistent, user-editable)
export const REQUIRED_MESSAGE = "This field is required";
export const EMAIL_MESSAGE = "Please enter a valid email address";

// In config (decorators)
email: v.string().email(v.var("constants.EMAIL_MESSAGE"));

// Generated output
import { EMAIL_MESSAGE } from "../lib/constants";
email: z.string()
  .trim()
  .min(1, { message: REQUIRED_MESSAGE })
  .email(EMAIL_MESSAGE);
```

#

### 📦 Sharing Decorators Across Projects!

> [!TIP]
> As your team grows, you can extract common decorators into a shared npm package (e.g., `@acmecorp/prisma-validators`). Import them in your config and reuse across all your services!

Create a shared decorator library:

```javascript
// @mycompany/prisma-decorators
import { v } from "@explita/prisma-guard";

export const companyDecorators = {
  email: v.chain.email().trim().toLowerCase(),
  taxId: v.string().regex(/^\d{2}-\d{5}$/),
  phoneNumber: v.chain.regex(/^\+?[\d\s-]{10,}$/),
  // Automatically imports { genders } from "../lib/constants"
  gender: v.enum(v.var("constants.genders")),
};

// In your project:
import { defineConfig } from "@explita/prisma-guard";
import { companyDecorators } from "@mycompany/prisma-decorators";

export default defineConfig({
  decorators: companyDecorators,
});
```

##

**📖 Understanding the `validator` API (alias `v`)**:

```markdown
- `v.chain` - Use for **chainable methods** (e.g., `.email()`, `.trim()`)
- `v.<zodMethod>` - Call Zod methods directly on `v` for **complete overrides** (e.g., `v.string().email()`)
- `v.var` - Use for **external variables** (e.g., `constants.genders`)
```

#

### Model-Level Refinements

Apply validation logic to the entire model, and even target specific operations (`create` vs `update`).

| Decorator                     | Applied To                     |
| :---------------------------- | :----------------------------- |
| `/// @zod.refine(...)`        | Both Create & Update schemas   |
| `/// @zod.create.refine(...)` | Only the main Schema           |
| `/// @zod.update.refine(...)` | Only the Partial Update Schema |
| `/// @zod.use(name)`          | Shared preset decorator        |
| `/// @zod.create.use(name)`   | Create-only preset decorator   |
| `/// @zod.update.use(name)`   | Update-only preset decorator   |

#

### Custom Virtual Fields (`@zod.add`)

Add fields to the Zod schema that do not exist in the database. Perfect for `confirmPassword` or `terms` checkboxes.
This must be added at the **Model level**.

#### Option 1: Explicit Definition

```prisma
/// @zod.add confirmPassword: z.string().min(8)
/// @zod.add terms: z.boolean().refine(v => v === true, "Must accept terms")
model User {
  id       Int    @id
  password String
}
```

#### Option 2: Shorthand (`@zod.add.use`)

If you have a named decorator in your config (e.g., `confirmPassword`), you can use this shorthand. The field name will automatically match the decorator name.

```prisma
/// @zod.add.use(confirmPassword)
model User {
  id       Int    @id
  password String
}
```

#

**Generated Output:**

```typescript
export const UserSchema = z.object({
  id: z.number(),
  password: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
  confirmPassword: z.string().min(8),
  terms: z.boolean().refine((v) => v === true, "Must accept terms"),
});
```

#

### Handling Arrays

While Prisma Guard automatically wraps list fields in `z.array()`, you can use overrides for more complex array validation (like minimum length).

**Option A: Inline Override**

```prisma
model Post {
  /// @zod.z.array(z.string()).min(1)
  tags String[]
}
```

**Option B: Named Decorator (Recommended)**

```javascript
// prisma-guard.config.js
decorators: {
  tags: v.array(v.string()).min(1).max(5),
}
```

```prisma
model Post {
  /// @zod.use(tags)
  tags String[]
}
```

#

### Omission & Customization

- **Model Omission**: Add `/// @zod.omit` at the top of a model to skip generating its file.
- **Model-Level Pick (`@zod.pick`)**: Keep ONLY specified fields in the generated `Create` schema. All other fields are automatically omitted from validation.

  **Prisma Schema:**

  ```prisma
  /// @zod.pick(email, username)
  model User {
    id        String   @id
    email     String
    username  String
    password  String  // Automatically omitted from validation
    createdAt DateTime @default(now())
  }
  ```

  **Generated Zod Schema:**

  ```typescript
  export const UserCreateSchema = z.object({
    email: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
    username: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
  });
  ```

- **Named Picks (`@zod.pick(...).as(...)`)**: Generate a separate secondary Zod schema and TypeScript types under a custom name, leaving the main model schema fully intact.

  Unlike a standard model-level `@zod.pick`, which filters the main generated schemas (e.g. `UserCreateSchema`), appending `.as(AliasName)` keeps the main model schemas intact and generates a separate, complete suite of Zod schemas and TypeScript types prefixed with `AliasName`.

  > [!IMPORTANT]
  > **Omission Bypassing**: Fields explicitly picked in a named pick will **bypass** all local model-level omissions (`@zod.omit(...)`), local field-level omissions (`/// @zod.omit`), and global configuration omissions (`omitIds`, `omitDates`, and `zodOmit`). This ensures your custom sub-schema contains exactly the fields you specified.

  **Prisma Schema:**

  ```prisma
  /// @zod.omit(name)
  /// @zod.pick(id, name, secret, createdAt).as(VerifySecret)
  model OmitAndPickTest {
    id        String   @id
    name      String
    /// @zod.omit
    secret    String
    createdAt DateTime
  }
  ```

  **Generated Outputs:**

  Since the main model `OmitAndPickTest` has all of its fields omitted, no schemas or types are generated for it.

  The named pick schema will bypass omissions and generate a complete suite of schemas and types:

  ```typescript
  // Named Pick - contains all picked fields
  export const VerifySecretCreateSchema = z.object({
    id: z.string().trim(),
    name: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
    secret: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
    createdAt: z.coerce.date({ error: REQUIRED_MESSAGE }),
  });

  export const VerifySecretUpdateSchema = VerifySecretCreateSchema.partial();

  export type VerifySecretCreate = z.infer<typeof VerifySecretCreateSchema>;
  export type VerifySecretInput = z.input<typeof VerifySecretCreateSchema>;
  export type VerifySecretUpdate = z.infer<typeof VerifySecretUpdateSchema>;
  // ... including all Scalar and CreateRequired variants!
  ```

- **Model-Level Omit (`@zod.omit(...)`)**: Omit specified fields from both the generated `Create` and `Update` schemas (the omitted fields will still be included in the `Scalar` schemas).

  **Prisma Schema:**

  ```prisma
  /// @zod.omit(password)
  model User {
    id       String @id
    email    String
    password String // Omitted from Create/Update validation
  }
  ```

  **Generated Zod Schema:**

  ```typescript
  export const UserCreateSchema = z.object({
    id: z.string().trim(),
    email: z.string().trim().min(1, { message: REQUIRED_MESSAGE }),
  });
  ```

- **Field Omission**: Add `/// @zod.omit` to a field to remove it from the schema.
- **Global Omission**: Add `zodOmit: ["password", "secret"]` to your config to omit fields globally.
- **`@zod.include`**: Override global omission for a specific field (e.g., `/// @zod.include`).
- **`@zod.add`**: Add custom fields (e.g., `/// @zod.add confirmPassword: z.string()`).
- **`@zod.override`**: Bypass default mapping (e.g., `/// @zod.override z.string().uuid()`).
- **`@zod.z.`**: Shorthand for overrides (e.g., `/// @zod.z.email().min(5)`).
- **`@zod.import`**: Add custom imports to the top of the file.

> [!IMPORTANT]
> **Absolute Overrides vs. Decorators**:
>
> - Use **Decorators** (e.g., `/// @zod.min(5)`) to **append** logic to the inferred Prisma type.
> - Use **Absolute Overrides** (e.g., `/// @zod.z.`) to **replace** the inferred type entirely.
>
> You **must** use an absolute override for:
>
> 1. **Coercion**: `z.coerce.number()` (because `.coerce` is not a method on schema instances).
> 2. **Type Changes**: Changing a `String` field to `z.enum()` or `z.any()`.
> 3. **Complex Structures**: Using `z.union()`, `z.record()`, or `z.lazy()`.

#

#### Watch Mode (Developer Experience)

Tired of manually running the generator every time you tweak your Prisma schema? Use the built-in watcher to automatically re-generate your Zod schemas and guards whenever a `.prisma` file is saved.

```bash
npx prisma-guard --watch
# or
npx prisma-guard -w
```

The watcher is highly optimized with a built-in debounce, ensuring it only triggers once even if your IDE performs multiple rapid saves. It's designed to stay out of your way while keeping your codebase perfectly in sync with your database models.

#

### 🪄 IDE Integration (The Magic)

Get full autocompletion for `@zod` decorators inside your `.prisma` files.

```bash
npx prisma-guard metadata --vscode
```

**This command does three things:**

1.  **Generates Snippets**: Creates `prisma.code-snippets` with every Zod method (`.email()`, `.min()`, etc.).
2.  **Installs Snippets**: Places them in your `.vscode/` folder.
3.  **Protects Your Repo**: Automatically adds the `zod/` folder and `.vscode/` to your `.gitignore`.

#

## 🛡️ Prisma Extension (The Guard)

Add the extension to your Prisma client to enable automatic field stripping at runtime.

```typescript
import { PrismaClient } from "@prisma/client";
import { prismaGuard } from "@explita/prisma-guard";

const prisma = new PrismaClient().$extends(prismaGuard());

// Any extra fields passed to 'data' will be silently stripped
await prisma.user.create({
  data: {
    email: "user@example.com",
    poisonField: "will be removed",
  },
});
```

#

### ⚠️ Understanding the Guard's Boundaries

#### Prisma Guard strips from:

- `data` in create/update operations
- Nested `create`/`update`/`upsert` in relations

#### Prisma Guard does NOT strip from:

- `where` clauses (would break queries)
- `select`/`include` (output filtering is your responsibility)
- `orderBy`, `groupBy`, `having` clauses

#### Prisma still validates:

- Field name typos (throws error)
- Missing required fields (throws error)
- Type mismatches (throws error)

**Think of Prisma Guard as a filter, not a validator.**

```typescript
// ✅ Extra field - stripped
await prisma.user.create({
  data: { email: "test@test.com", oldField: "deprecated" },
}); // Works fine

// ❌ Typo - Prisma throws
await prisma.user.create({
  data: { emial: "test@test.com" },
}); // Error: Unknown argument `emial`

// ❌ Missing required - Prisma throws
await prisma.user.create({
  data: { name: "John" }, // email is required
}); // Error: Missing required argument `email`
```

#

## 🚀 Production & CI/CD

Since the `zod/` and `guards/` folders are ignored by Git, you must generate them during your build process (on your server or CI/CD).

Update your `package.json` scripts:

```json
{
  "scripts": {
    "prisma:guard": "npx prisma-guard --no-prettier --skip-gitignore",
    "build": "pnpm prisma:guard && next build",
    "// or for general TS projects": "pnpm prisma:guard && tsc"
  }
}
```

> **Note:** If your config file does not contain `generateZod: true`, you can force it via the `--zod` flag. Conversely, use `--no-zod` to skip schema generation during your build if you only need the runtime guards.

#

### CLI Command Reference

| Command                              | Description                                           |
| :----------------------------------- | :---------------------------------------------------- |
| `npx prisma-guard init`              | Creates a default `prisma-guard.config.js` file       |
| `npx prisma-guard`                   | Runs both field generation and Zod schema generation. |
| `npx prisma-guard zod`               | Generates only the Zod schemas.                       |
| `npx prisma-guard metadata --vscode` | Generates metadata and VS Code snippets.              |
| `npx prisma-guard --watch` or `-w`   | Watch mode - auto-regenerate on schema changes        |

**Common Flags:**

- `--dry-run`: See what would be generated without writing to disk.
- `--vscode`: Automatically install snippets and update `.gitignore` (used with `metadata`).
- `--schema-dir`: Override the Prisma schema directory.
- `--output-dir`: Override the output directory for Zod schemas.
- `--omit-ids`: Force omit `@id` fields from generated Zod schemas.
- `--omit-dates`: Force omit date fields (createdAt, updatedAt) from schemas.
- `--zod`: Force Zod generation even if disabled in config.
- `--no-zod`: Skip Zod generation even if enabled in config.
- `--skip-gitignore`: Skip automatic `.gitignore` updates.
- `--no-prettier`: Disable automatic Prettier formatting.
- `--prettier`: Force Prettier formatting even if disabled in config.
- `--help` or `-h`: Show the help information.
- `--watch` or `-w`: Watch for changes in your Prisma schema files

#

## 🏗️ Architecture

- **Kebab-Case Output**: `UserModel` becomes `user.ts`.
- **Base Object Pattern**: To prevent duplication, we define a private base object. `CreateSchema` builds directly from it, and `UpdateSchema` intelligently uses `.partial()` of the base when possible, otherwise it generates its own tailored partial base object.
- **Prettier Support**: Automatically formats generated files using your local Prettier config.

#

## ⚡ Performance

The runtime guard is designed for ultra-low latency, introducing virtually zero friction into your database request path.

### 📊 Real Benchmark Results

Running the `stripExtraFields` routine over **100,000 recursive sanitization iterations** on a payload with nested writes:

- **Total duration**: `221.26ms`
- **Average per query**: **`2.21 microseconds` (`0.0022ms`)**

> 💡 **Under-promise, Over-deliver:** The actual sanitization runs **135x faster** than our conservative `~0.3ms` estimate.

> **Want to run these benchmarks locally?**  
> (Cloned repository required) Run `npm run benchmark` in the package root.

### 🛠️ Why It's So Fast

1. **Strict $O(n)$ Complexity**: Instead of dynamically traversing arbitrary keys from raw user input, the sanitizer loops strictly over the predefined fields in the model schema (where $n = S + R$ fields). All field membership operations (`key in data`) compile to highly optimized $O(1)$ V8 engine lookups.
2. **Memoized Whitelists**: The schema definitions (scalars and relations) are parsed and cached in memory **exactly once** during the application's bootstrap phase. At query runtime, there is **zero filesystem I/O** or JSON parsing overhead.
3. **Hot-Path Early Exits**: If a field is a scalar value (e.g., a string, number, or boolean), the algorithm exits immediately (`typeof data !== "object"`). This prevents unnecessary nested recursion checks.
4. **Call Stack Protection**: Recursion depth is hard-limited to 10 levels to prevent call stack exhaustion or resource exhaustion from circular references.

### 💡 Real-World Impact

If a database query takes **10-50ms**, adding **0.0022ms** introduces **virtually 0% overhead**.

**Benchmark Environment:**

- **CPU:** Intel(R) Core(TM) i7-7500U CPU @ 2.70GHz
- **Node.js:** v22.14.0
- **OS:** Microsoft Windows 11 Home (64-bit)
- **Payload:** Complex nested object with 2 levels of nested write operations

### Worst-Case Performance

Even under heavy loads, maximum recursion depth (10 levels), and models with 100+ fields:

- **Max observed overhead**: ~15-20 microseconds
- **Still negligible** compared to network latency (10-50ms)

### Memory Footprint

- **Cache Size:** ~2-5KB per model in-memory
- **No Per-Query Allocations:** Reuses structure signatures; no memory churn
- **GC Pressure:** Virtually zero (no garbage collection overhead)

#

## 🔧 Troubleshooting

### "Cannot find module '../generated/zod/user'"

Run `npx prisma-guard` to generate schemas.

### VS Code snippets not working

Reload VS Code window (Cmd/Ctrl + Shift + P → "Developer: Reload Window")

### My custom decorators aren't being applied

Check that `decorators` is in your config and you're using `/// @zod.use(name)` where `name` is the name of the decorator in your config.

### My @default values disappeared from Zod schemas!

If you're using `/// @zod.z.` overrides and your Prisma `@default()` isn't showing up:

**Fix:** Set `defaultsOnOverride: true` in your config.

**Why:** By default, explicit overrides assume you want full control, including default values. Set to `true` to automatically append `.default()` to your overrides.

### Prisma is yelling about missing required fields!

**The Scenario:** You generated your Prisma Guard field mappings, later added a new required column to your Prisma schema, but _forgot to regenerate_. Prisma Guard's runtime stripper did exactly what it was designed to do—it didn't recognize the new field, stripped it from your input, and then Prisma yelled at you because a required field was missing!

**The Fix:** Always remember to run `npx prisma-guard` after modifying your schema to update your mappings, or use `npx prisma-guard --watch` during development to avoid this completely!

> **Pro Tip:** If you're ever unsure why data isn't saving or why Prisma is complaining, temporarily set `debug: true` in your `prisma-guard.config.js`. You'll get helpful console logs like: `[prisma-guard] Stripping extra field "newColumn" from model "User"`!

#

### 🌟 Community Decorators (Coming Soon)

As the Prisma Guard community grows, we expect to see shared decorator packages emerge for common validation patterns:

- `@company/validators` - Internal company validation rules
- `@opensource/email-validators` - Email format and deliverability checks
- `@opensource/id-validators` - Tax IDs, SSNs, VAT numbers, etc.

_Have a useful decorator collection? Let us know and we'll feature it here!_

#

## 💖 Support the Mission

Prisma Guard is built to save developers time and prevent costly database errors. If it has helped you, please consider supporting the project to ensure its continued growth and maintenance!

<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
  <a href="https://github.com/sponsors/explita"><img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor on GitHub" /></a>
  <a href="https://ko-fi.com/explita"><img src="https://img.shields.io/badge/Buy_Me_A_Coffee-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Buy Me A Coffee" /></a>
</div>

### 🚀 Ways to Contribute

- **Give us a ⭐**: It helps others discover the project.
- **Join the Discussion**: Report [bugs](https://github.com/explita/prisma-guard/issues) or suggest new [features](https://github.com/explita/prisma-guard/discussions).
- **Spread the Word**: Share your experience with Prisma Guard on social media.

### 🙏 Our Amazing Supporters

_A huge thank you to everyone helping us build the future of type-safe database guards!_

[![Contributors](https://contrib.rocks/image?repo=explita/prisma-guard)](https://github.com/explita/prisma-guard/graphs/contributors)

#

## 📜 License

MIT © [Explita](https://github.com/explita)
