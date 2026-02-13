# Development

Linearis is a CLI tool for [Linear.app](https://linear.app) that outputs structured JSON. It uses a layered architecture with strict TypeScript, GraphQL code generation, and ES modules.

## Prerequisites

- Node.js >= 22.0.0
- A Linear API token (see [Authentication](#authentication))

## Getting Started

```bash
# Install dependencies (also runs GraphQL codegen)
npm install

# Run in development mode (uses tsx)
npm start issues list -l 5

# Run with explicit token
npx tsx src/main.ts --api-token <token> issues list

# Build for production
npm run build

# Run tests
npm test
```

## Architecture Overview

The codebase is organized into five layers, each with a single responsibility:

```
CLI Input --> Command --> Resolver --> Service --> JSON Output
                           |             |
                        SDK client    GraphQL client
                        (ID lookup)   (data operations)
```

| Layer | Directory | Client | Responsibility |
|-------|-----------|--------|----------------|
| Client | `src/client/` | -- | API client wrappers |
| Resolver | `src/resolvers/` | `LinearSdkClient` | Convert human IDs to UUIDs |
| Service | `src/services/` | `GraphQLClient` | Business logic and CRUD |
| Command | `src/commands/` | Both (via `createContext()`) | CLI orchestration |
| Common | `src/common/` | -- | Shared utilities and types |

Two separate clients exist because the Linear SDK is convenient for ID lookups (resolvers), while direct GraphQL queries are more efficient for data operations (services). Commands get both clients through `createContext()`.

## Code Style

### TypeScript Rules

- **No `any` types.** Use `unknown`, codegen types, or explicit interfaces.
- **Strict mode** is enabled in tsconfig.json.
- **Explicit return types** on all exported functions.
- **ES module imports** use `.js` extensions, even when importing `.ts` files.

### Functions Over Classes

Resolvers and services are stateless exported functions, not class methods. This keeps them simple and easy to test.

```typescript
// Good: plain function
export async function listIssues(client: GraphQLClient, limit?: number): Promise<Issue[]> { ... }

// Avoid: class with methods
class IssueService { async listIssues(...) { ... } }
```

## Patterns

### Command Pattern

Commands are thin orchestration layers. They create the client context, resolve IDs, call services, and output results. No business logic belongs here.

```typescript
import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { createIssue } from "../services/issue-service.js";

export function setupIssuesCommands(program: Command): void {
  const issues = program.command("issues");

  issues
    .command("create <title>")
    .option("--team <id>", "Team key, name, or UUID")
    .action(handleCommand(async (title, options, command) => {
      const ctx = await createContext(command.parent!.parent!.opts());
      const teamId = options.team
        ? await resolveTeamId(ctx.sdk, options.team)
        : undefined;
      const result = await createIssue(ctx.gql, { title, teamId });
      outputSuccess(result);
    }));
}
```

Every `.action()` handler must be wrapped with `handleCommand()`, which catches errors and outputs them as JSON.

Register new command groups in `src/main.ts`:

```typescript
import { setupEntityCommands } from "./commands/entity.js";
setupEntityCommands(program);
```

### Resolver Pattern

Resolvers convert human-friendly identifiers (team keys, names, issue identifiers like `ENG-123`) into UUIDs. They use the `LinearSdkClient` and live in `src/resolvers/`.

```typescript
import type { LinearSdkClient } from "../client/linear-client.js";
import { isUuid } from "../common/identifier.js";

export async function resolveTeamId(
  client: LinearSdkClient,
  keyOrNameOrId: string,
): Promise<string> {
  if (isUuid(keyOrNameOrId)) return keyOrNameOrId;

  const byKey = await client.sdk.teams({
    filter: { key: { eq: keyOrNameOrId } },
    first: 1,
  });
  if (byKey.nodes.length > 0) return byKey.nodes[0].id;

  const byName = await client.sdk.teams({
    filter: { name: { eq: keyOrNameOrId } },
    first: 1,
  });
  if (byName.nodes.length > 0) return byName.nodes[0].id;

  throw new Error(`Team "${keyOrNameOrId}" not found`);
}
```

Rules for resolvers:
- Always accept a UUID passthrough as the first check.
- Return a UUID string, never an object.
- Use `LinearSdkClient` only (not `GraphQLClient`).
- No CRUD operations or data transformations.

### Service Pattern

Services contain business logic and perform CRUD operations using the `GraphQLClient`. They accept pre-resolved UUIDs -- never human-friendly identifiers.

```typescript
import type { GraphQLClient } from "../client/graphql-client.js";
import {
  GetIssuesDocument,
  type GetIssuesQuery,
  CreateIssueDocument,
  type CreateIssueMutation,
  type IssueCreateInput,
} from "../gql/graphql.js";

export async function listIssues(
  client: GraphQLClient,
  limit: number = 25,
): Promise<Issue[]> {
  const result = await client.request<GetIssuesQuery>(GetIssuesDocument, {
    first: limit,
  });
  return result.issues.nodes;
}

export async function createIssue(
  client: GraphQLClient,
  input: IssueCreateInput,
): Promise<CreatedIssue> {
  const result = await client.request<CreateIssueMutation>(
    CreateIssueDocument,
    { input },
  );
  return result.issueCreate.issue;
}
```

Rules for services:
- Use `GraphQLClient` only (not `LinearSdkClient`).
- Accept UUIDs, not human-friendly identifiers.
- Import `DocumentNode` constants and types from `src/gql/graphql.js`.
- Always type the `client.request<T>()` call.

## GraphQL Workflow

Linearis uses [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) to produce typed query documents and result types. Never write raw GraphQL strings in TypeScript.

### Adding or Changing a Query

1. **Edit the `.graphql` file** in `graphql/queries/` or `graphql/mutations/`:

   ```graphql
   # graphql/queries/issues.graphql
   query GetIssues($first: Int) {
     issues(first: $first, orderBy: updatedAt) {
       nodes {
         id
         identifier
         title
         ...
       }
     }
   }
   ```

2. **Run code generation:**

   ```bash
   npm run generate
   ```

   This regenerates `src/gql/graphql.ts`. Do not edit that file by hand.

3. **Import and use in a service:**

   ```typescript
   import {
     GetIssuesDocument,          // DocumentNode constant
     type GetIssuesQuery,        // Result type
   } from "../gql/graphql.js";

   const result = await client.request<GetIssuesQuery>(
     GetIssuesDocument,
     { first: 10 },
   );
   ```

### File Layout

```
graphql/
  queries/     # .graphql query definitions
  mutations/   # .graphql mutation definitions
src/gql/       # Generated output (DO NOT EDIT)
```

## Error Handling

### In Commands

Use the `handleCommand()` wrapper. It catches any thrown error and outputs it as JSON to stderr before exiting with code 1. No manual try/catch is needed in command handlers.

### In Resolvers and Services

Throw descriptive errors using the helpers from `src/common/errors.ts`:

```typescript
import { notFoundError, multipleMatchesError } from "../common/errors.js";

// Entity not found
throw notFoundError("Team", "ABC-123");

// Ambiguous match
throw multipleMatchesError("Cycle", "Sprint 1", ["id1", "id2"], "specify a team with --team");

// Invalid input
throw invalidParameterError("priority", "must be between 0 and 4");

// Missing required companion flag
throw requiresParameterError("--cycle", "--team");
```

### Output Format

All command output is JSON:

```typescript
// Success: written to stdout
outputSuccess(data);   // JSON.stringify(data, null, 2)

// Error: written to stderr, exits with code 1
outputError(error);    // { "error": "message" }
```

## Authentication

For interactive setup, run `linearis auth login` — it opens Linear in the browser and stores the token encrypted in `~/.linearis/token`.

The API token is resolved in this order:

1. `--api-token <token>` command-line flag
2. `LINEAR_API_TOKEN` environment variable
3. `~/.linearis/token` (encrypted, set up via `linearis auth login`)
4. `~/.linear_api_token` (deprecated)

For local development, the interactive login is the most convenient:

```bash
linearis auth login
```

## Adding New Functionality

A typical feature addition touches four layers. Here is the sequence:

1. **GraphQL operations** -- Define queries and mutations in `graphql/queries/` or `graphql/mutations/`, then run `npm run generate`.

2. **Resolver** (if new entity types need ID resolution) -- Add a `resolve*Id()` function in `src/resolvers/`. Use `LinearSdkClient`, return a UUID string.

3. **Service** -- Add functions in `src/services/`. Use `GraphQLClient`, accept UUIDs, import codegen types.

4. **Command** -- Add a `setup*Commands()` function in `src/commands/`. Use `createContext()`, resolve IDs, call services, output with `outputSuccess()`. Register in `src/main.ts`.

5. **Tests** -- Add unit tests in `tests/unit/` mirroring the source structure. Mock one layer deep (see [testing docs](testing.md)).

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run in dev mode via tsx (also runs codegen) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run clean` | Remove `dist/` |
| `npm test` | Run tests with vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:commands` | Check command coverage |
| `npm run generate` | Regenerate GraphQL types |

## Project Structure

```
src/
  main.ts                    # Entry point, registers all command groups
  client/
    graphql-client.ts        # GraphQLClient - direct GraphQL execution
    linear-client.ts         # LinearSdkClient - SDK wrapper for resolvers
  resolvers/                 # Human ID to UUID resolution
    team-resolver.ts
    project-resolver.ts
    label-resolver.ts
    cycle-resolver.ts
    status-resolver.ts
    issue-resolver.ts
    milestone-resolver.ts
  services/                  # Business logic and CRUD
    issue-service.ts
    document-service.ts
    attachment-service.ts
    milestone-service.ts
    cycle-service.ts
    team-service.ts
    user-service.ts
    project-service.ts
    label-service.ts
    comment-service.ts
    file-service.ts
  commands/                  # CLI command definitions
    auth.ts                  # Authentication (interactive, for humans)
    issues.ts
    documents.ts
    project-milestones.ts
    cycles.ts
    teams.ts
    users.ts
    projects.ts
    labels.ts
    comments.ts
    embeds.ts
  common/                    # Shared utilities
    context.ts               # CommandContext and createContext()
    auth.ts                  # API token resolution (flag, env, encrypted, legacy)
    token-storage.ts         # Encrypted token storage
    encryption.ts            # AES-256-CBC encryption
    output.ts                # JSON output and handleCommand()
    errors.ts                # Error factory functions
    identifier.ts            # UUID validation and issue identifier parsing
    types.ts                 # Type aliases from codegen
    embed-parser.ts          # Embed extraction utilities
    usage.ts                 # Two-tier usage system (DomainMeta, formatOverview, formatDomainUsage)
  gql/                       # GraphQL codegen output (DO NOT EDIT)
graphql/
  queries/                   # GraphQL query definitions
  mutations/                 # GraphQL mutation definitions
tests/
  unit/
    resolvers/               # Resolver tests (mock SDK)
    services/                # Service tests (mock GraphQL)
    common/                  # Pure function tests
```

## Dependencies

**Runtime:**
- `@linear/sdk` -- Linear SDK, used by resolvers for ID lookups
- `commander` -- CLI framework

**Development:**
- `typescript` -- Compiler
- `tsx` -- TypeScript execution for development
- `vitest` -- Test runner
- `@graphql-codegen/*` -- GraphQL code generation suite
