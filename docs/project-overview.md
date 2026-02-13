# Project Overview

Linearis is a command-line interface for [Linear.app](https://linear.app) that outputs structured JSON. It is built for automation, scripting, and integration with other tools, including LLM agents.

All commands return JSON-formatted responses. Human-friendly identifiers (such as team keys like `ENG` or issue identifiers like `ENG-42`) are automatically resolved to internal UUIDs before any API call is made.

## Architecture

The codebase follows a five-layer architecture. Each layer has a specific responsibility and a strict client contract.

| Layer | Directory | Responsibility | Client |
|-------|-----------|---------------|--------|
| Client | `src/client/` | Low-level API wrappers | -- |
| Resolver | `src/resolvers/` | Human ID to UUID conversion | LinearSdkClient |
| Service | `src/services/` | Business logic and CRUD operations | GraphQLClient |
| Command | `src/commands/` | CLI orchestration via Commander.js | Both (via `createContext()`) |
| Common | `src/common/` | Shared utilities, types, error handling | -- |

Data flows in one direction:

```
CLI Input -> Command -> Resolver -> Service -> JSON Output
```

Commands receive user input, resolve any identifiers to UUIDs through the resolver layer, then delegate to services for the actual API operations. Services never perform ID resolution, and resolvers never perform data mutations.

## Technology Stack

- **TypeScript** with strict mode enabled and no `any` types
- **Node.js** >= 22.0.0, ES modules throughout
- **Commander.js** v14.0.0 for CLI structure
- **Linear SDK** v58.1.0 for the SDK client used in resolvers
- **GraphQL Codegen** for type-safe query and mutation documents
- **Vitest** for unit testing
- **tsx** for development execution

## Key Entry Points

- `src/main.ts` -- CLI entry point, registers all commands
- `src/common/context.ts` -- `createContext()` factory that provides both clients
- `src/common/auth.ts` -- authentication resolution

## Authentication

Interactive setup (for humans): `linearis auth login` — opens Linear in the browser and stores the token encrypted in `~/.linearis/token`.

Token resolution order:

1. `--api-token` CLI flag
2. `LINEAR_API_TOKEN` environment variable
3. `~/.linearis/token` (encrypted, set up via `linearis auth login`)
4. `~/.linear_api_token` (deprecated)

## Build and Development

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode via tsx |
| `npm run build` | Compile to `dist/` |
| `npm test` | Run the test suite |
| `npm run generate` | Regenerate GraphQL types from `.graphql` files |

The compiled binary is `dist/main.js`.

## Package Information

- **Name:** linearis
- **License:** MIT
- **Node.js:** >= 22.0.0
- **Module system:** ES modules
