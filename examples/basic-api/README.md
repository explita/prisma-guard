# Prisma Guard - Fastify Example

This is a complete, self-contained example showing how to integrate **Prisma Guard** into a Fastify application.

It demonstrates:
1. **Zod Validation**: Validating request payloads using generated schemas.
2. **Named Picks**: Using `/// @zod.pick(email, password).as(Login)` to generate a separate login validation schema that bypasses local and global omissions.
3. **Runtime Protection**: Automatically stripping extra/unknown fields from write payloads using the Prisma Client extension.
4. **SQLite database**: Simple setup without any complex database installation.

---

## 🛠️ Setup & Running

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Push Schema to SQLite DB & Generate Zod Schemas
This command creates the SQLite database `dev.db`, generates the standard Prisma Client, and compiles the Zod schemas into `src/generated/`:
```bash
pnpm run db:setup
pnpm run generate
```

### 3. Start the Server
Start the Fastify server locally (runs on port 3000):
```bash
pnpm run dev
```

---

## 🔍 Code Walkthrough

### 1. Prisma Schema (`prisma/schema.prisma`)
The `User` model is annotated with `@zod.pick(email, password).as(Login)`:
```prisma
/// @zod.pick(email, password).as(Login)
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 2. Prisma Guard Config (`prisma-guard.config.js`)
We omit the `password` field globally in our config:
```javascript
export default defineConfig({
  schemaDir: "./prisma",
  outputDir: "./src/generated",
  omitIds: true,
  omitDates: true,
  zodOmit: ["password"] // Omitted from public schemas
});
```

Because of this, `UserCreateSchema` does **not** contain the `password` field. However, our named pick `LoginCreateSchema` **does** contain `password` because named picks bypass all local and global omissions.

### 3. Server (`src/server.ts`)
- **`POST /register`**: Uses `UserCreateScalarSchema` to allow registering a user with a password (as the scalar schema ignores omissions).
- **`POST /login`**: Uses `LoginCreateSchema` (which contains only `email` and `password` and bypasses global omissions).
- **`POST /users/test-strip`**: Uses raw payloads. If you submit unknown fields like `{ email: "test@example.com", poisonField: "malicious" }`, the Prisma Guard client extension silently removes `poisonField` before storing the database record!
