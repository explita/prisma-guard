export function printHelp() {
  console.log(`
Usage: npx prisma-guard [command] [options]

Commands:
  init                Initialize a default prisma-guard.config.js file
  generate (default)  Generate field mapping for input sanitation
  zod                 Generate Zod schemas based on Prisma models
  metadata            Generate Zod API metadata for IDE extensions

Options:
  --schema-dir=DIR    Directory where .prisma files are located (default: "./prisma")
  --output-dir=DIR    Directory to save generated files (default: "./node_modules/.prisma-guard")
  --omit-ids          Omit @id fields from Zod schemas
  --omit-dates        Omit createdAt/updatedAt fields from Zod schemas
  --zod, --generate-zod Generate Zod schemas along with field mapping
  --vscode            Install VS Code snippets and update .gitignore
  --no-prettier       Disable automatic Prettier formatting
  --prettier          Force Prettier formatting
  --dry-run           Preview generation without writing files
  --watch, -w         Watch for changes in your Prisma schema files
  --help, -h          Show this help message
  `);
}
