# Build System

Linearis uses TypeScript compilation for production builds, GraphQL code generation for type-safe API access, and Vitest for testing. Development runs directly via tsx without a compilation step.

## Prerequisites

- **Node.js >= 22.0.0** -- required for ES module support and modern language features
- **mise** (optional) -- manages tool versions via `mise.toml`; run `mise install` to set up Node.js 22 and Deno 2.2.8 automatically

## Getting Started

```bash
npm install       # Install dependencies and run GraphQL codegen (postinstall hook)
npm start         # Run in development mode (regenerates types, then executes via tsx)
```

After `npm install`, the project is ready for development. The `postinstall` hook runs GraphQL codegen automatically, so `src/gql/graphql.ts` is always up to date.

## GraphQL Code Generation

The project uses [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) to produce TypeScript types and typed document nodes from `.graphql` files.

**How it works:**

1. GraphQL queries and mutations are defined in `graphql/**/*.graphql`.
2. Running `npm run generate` introspects the Linear API schema and generates typed output into `src/gql/`.
3. Services import the generated `DocumentNode` constants and result types from `src/gql/graphql.ts`.

**When codegen runs automatically:**

- On `npm install` (postinstall hook)
- On `npm start` (prestart hook)

**Configuration:** `codegen.config.ts` -- uses the `client` preset with fragment masking disabled, pointing at the Linear API schema.

> **Important:** Never edit files in `src/gql/` by hand. They are regenerated and any manual changes will be lost.

## Usage Documentation Generation

The project auto-generates token-optimized usage documentation for LLM agents.

**How it works:**

1. Each command file exports a `DomainMeta` object with domain name, summary, context, arguments, and cross-references.
2. Running `npm run generate:usage` executes `linearis usage --all` and captures output to `USAGE.md`.
3. The generated file contains two tiers: overview (~200 tokens) + per-domain detail (~300-500 tokens each).

**When usage generation runs automatically:**

- On `npm run build` (prebuild hook)
- Before publishing (via prebuild in prepublishOnly chain)

**Generated output:** `USAGE.md` -- Token-optimized usage documentation committed to the repository and shipped with the package. Typical agent cost: overview + 1 domain = ~500-700 tokens (vs ~3000+ for traditional help text).

> **Important:** USAGE.md is auto-generated. Edit `DomainMeta` objects in command files instead. The file is regenerated on every build.

## Build Workflows

### Development

```bash
npm start <command>     # Runs codegen, then executes src/main.ts via tsx
```

tsx provides on-the-fly TypeScript execution without a separate compilation step. Startup is slower than compiled output (~0.64s vs ~0.15s) but avoids the build cycle during development.

### Production Build

```bash
npm run build           # Compiles TypeScript to dist/ and marks dist/main.js as executable
```

The compiled binary entry point is `dist/main.js`:

```bash
node dist/main.js <command>
```

### Clean

```bash
npm run clean           # rm -rf dist/
```

### Publishing

```bash
npm publish             # Triggers prepublishOnly: build, test, and verify dist/main.js is executable
```

## Testing

Linearis uses [Vitest](https://vitest.dev) for unit and integration tests. Test files live in `tests/` and follow the pattern `tests/**/*.test.ts`.

```bash
npm test                # Run all tests once
npm run test:watch      # Run tests in watch mode
npm run test:ui         # Open the Vitest browser UI
npm run test:coverage   # Run tests with V8 coverage reporting
npm run test:commands   # Run command coverage analysis
```

**Configuration:** `vitest.config.ts` -- uses the Node environment with V8 coverage. Coverage reports are generated in text, JSON, and HTML formats. Source files in `src/` are included; declaration files, `src/main.ts`, and `dist/` are excluded from coverage.

## Scripts Reference

| Script | Command | Purpose |
|---|---|---|
| `build` | `tsc && chmod +x dist/main.js` | Compile TypeScript and make entry point executable |
| `clean` | `rm -rf dist/` | Remove compiled output |
| `start` | `tsx src/main.ts` | Run in development mode |
| `test` | `vitest run` | Run test suite once |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:ui` | `vitest --ui` | Open Vitest browser UI |
| `test:coverage` | `vitest run --coverage` | Run tests with coverage |
| `test:commands` | `tsx tests/command-coverage.ts` | Check command test coverage |
| `generate` | `graphql-codegen --config codegen.config.ts` | Generate TypeScript types from GraphQL |
| `generate:usage` | `tsx src/main.ts usage --all > USAGE.md` | Generate token-optimized usage documentation |
| `prebuild` | `npm run generate && npm run generate:usage` | Auto-run codegen and usage generation before build |
| `prestart` | `npm run generate` | Auto-run codegen before `npm start` |
| `postinstall` | `npm run generate` | Auto-run codegen after `npm install` |
| `prepublishOnly` | `npm run build && npm run test && test -x dist/main.js` | Validate before publish |

## Configuration Files

| File | Purpose |
|---|---|
| `package.json` | Project metadata, scripts, and dependencies |
| `tsconfig.json` | TypeScript compiler options (ES2022 target, ESNext modules, strict mode, output to `dist/`) |
| `codegen.config.ts` | GraphQL Code Generator configuration (Linear API schema, client preset) |
| `vitest.config.ts` | Vitest test runner and coverage settings |
| `mise.toml` | Development tool versions (Node.js 22, Deno 2.2.8) |

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `@linear/sdk` | ^58.1.0 | Linear API SDK for ID resolution |
| `commander` | ^14.0.0 | CLI argument parsing |

### Development

| Package | Version | Purpose |
|---|---|---|
| `@graphql-codegen/cli` | ^6.1.1 | GraphQL code generation CLI |
| `@graphql-codegen/client-preset` | ^5.2.2 | Typed document node generation |
| `@graphql-codegen/introspection` | 5.0.0 | Schema introspection plugin |
| `@graphql-codegen/schema-ast` | ^5.0.0 | Schema AST generation |
| `@types/node` | ^22.0.0 | Node.js type definitions |
| `@vitest/coverage-v8` | ^2.1.8 | V8-based code coverage |
| `@vitest/ui` | ^2.1.8 | Browser-based test UI |
| `tsx` | ^4.20.5 | TypeScript execution for development |
| `typescript` | ^5.0.0 | TypeScript compiler |
| `vitest` | ^2.1.8 | Test runner |

## TypeScript Configuration

Key `tsconfig.json` settings:

- **Target:** ES2022
- **Module system:** ESNext with Node module resolution
- **Strict mode:** Enabled
- **Output directory:** `dist/`
- **Source maps:** Disabled (production builds only)
- **Comments:** Stripped from output
- **Excluded from compilation:** `node_modules`, `dist`, `tests`, test files, `vitest.config.ts`

All imports use `.js` extensions for ES module compatibility. TypeScript resolves `.js` to `.ts` during compilation.

## Troubleshooting

**TypeScript errors after changing GraphQL files:**
Run `npm run generate` to regenerate types, then rebuild.

**Missing `src/gql/graphql.ts`:**
Run `npm run generate` or `npm install` (the postinstall hook handles this).

**Build failures:**
```bash
npm run clean && npm run generate && npm run build
```

**Node.js version issues:**
Verify you are running Node.js >= 22 with `node --version`. Use mise (`mise install`) or nvm to manage versions.

**Missing `dist/` directory:**
Run `npm run build`. The `dist/` directory is not checked into version control.
