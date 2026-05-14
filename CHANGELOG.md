# Changelog

All notable changes to this package will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-14

### Features & Highlights

- **Advanced Type Ergonomics**: Every model now generates **Dual Schemas** by default:
  - **Public Schemas** (`UserCreateSchema`): Omit-aware schemas for public API validation.
  - **Scalar Schemas** (`UserCreateScalarSchema`): Inclusion-aware schemas for internal database operations.
- **Service Layer Optimization**: Added the **`ModelCreateRequired`** utility type. This is the "ultimate" service type that omits database-managed fields (`id`, `createdAt`, and everything with a `@default`) while requiring internal-only fields.
- **Automatic Optionality**: Fields with database defaults are now automatically marked as `.optional()` in Scalar schemas. This allows your service layer to omit them while letting the database handle the default values without TypeScript errors.
- **Exported Input Types**: Added `ModelInput` and `ModelScalarInput` types using `z.input` for better type safety during data entry and coercion.
- **Configuration Defaults**: `fullScalar` now defaults to `true`, ensuring backend-heavy applications have access to internal types out of the box.
- **Naming Convention Refinement**: Schemas are now explicitly named (`CreateSchema`, `UpdateSchema`, `CreateScalarSchema`, `UpdateScalarSchema`) to prevent naming collisions and improve clarity.

---

## [0.1.0] - 2026-05-13

### Features & Highlights

- **Runtime Protection**: A zero-dependency Prisma extension featuring a highly optimized recursive sanitizer to silently strip unknown fields before queries.
- **Typed Configuration**: Support for `prisma-guard.config.js` and `.mjs` with a `defineConfig` helper for full IntelliSense.
- **Zod Schema Generator**: Robust CLI for generating types with zero-configuration needed.
- **Smart Multi-File Grouping**: Automatically groups Zod schemas into files matching your original `.prisma` file structure.
- **Watch Mode**: Built-in, debounced file watcher (`--watch` / `-w`) that auto-regenerates schemas instantly upon saving your `.prisma` files.
- **Comment Decorators**: Advanced support for `/// @zod.omit`, `/// @zod.import`, `/// @zod.override`, and chained Zod methods.
- **Advanced Multi-line Support**: `/// @zod` continuation syntax for complex logic, `.refine()`, and `.check()`.
- **Named Decorators**: Support for reusable validation presets via `/// @zod.use(name)` defined in your configuration, allowing company-wide shared decorator packages.
- **Custom Virtual Fields**: Support for `/// @zod.add` to insert fields into schemas that don't exist in the database (e.g., `confirmPassword`, `terms`).
- **Model-Level Refinements**: Operation-specific refinements (`create` vs `update`) at the model level.
- **Persistence & Customization**: Generates a persistent `lib/constants.ts` file for sharing variables and custom messages, seamlessly integrating with `ref()` helper.
- **Internal Bootstrap**: Intelligent config "baking" for project-local isolation, making it compatible with `pnpm` and symlinks.
- **Update Schemas**: Automatic generation of `.partial()` update schemas for every model.
- **Precision Decimals**: Specialized Decimal mapping using string/number unions.
- **IDE Integration**: Automated VS Code snippet generation and `.gitignore` management.
- **Prettier Integration**: All generated files are automatically formatted using your local Prettier settings.
