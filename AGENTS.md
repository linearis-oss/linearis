# AGENTS.md

Agent instruction set for Linearis codebase.

## Rule Hierarchy

**P0 (Blocking)** - Violations fail CI/review
**P1 (Required)** - Follow unless explicitly documented exception
**P2 (Recommended)** - Follow for consistency

## Core Constraints (P0)

```yaml
typescript:
  no_any_types: REQUIRED
  strict_mode: REQUIRED
  explicit_return_types: REQUIRED

architecture:
  layer_separation: STRICT
  no_cross_layer_imports:
    - resolvers MUST NOT import from services
    - services MUST NOT import from resolvers
    - commands MUST NOT import GraphQLClient directly

  client_usage:
    resolvers: LinearSdkClient ONLY
    services: GraphQLClient ONLY
    commands: Both via createContext()

id_resolution:
  location: resolvers/ ONLY
  no_duplication: STRICT
  services_accept: UUIDs ONLY

testing:
  mock_depth: ONE_LAYER
  no_api_tokens: REQUIRED
  structure_mirrors_src: REQUIRED
```

## Project Context

**Type**: CLI tool for Linear.app
**Output**: JSON only (except help text)
**Design goal**: Minimal token usage, maximum structure
**Architecture**: 5-layer separation (Client → Resolver → Service → Command → Common)

## Layer Contracts

### Client Layer (`src/client/`)

**Files**: `graphql-client.ts`, `linear-client.ts`

```typescript
// graphql-client.ts - Direct GraphQL execution
class GraphQLClient {
  request<TResult>(
    document: DocumentNode,        // NOT string
    variables?: Record<string, unknown>  // NOT any
  ): Promise<TResult>
}

// linear-client.ts - SDK wrapper
class LinearSdkClient {
  readonly sdk: LinearClient
}
```

**Rules**:
- No business logic
- No ID resolution
- No `any` types
- Variables must be `Record<string, unknown>`

### Resolver Layer (`src/resolvers/`)

**Purpose**: Human ID → UUID conversion only

**Contract**:
```typescript
export async function resolve*Id(
  client: LinearSdkClient,  // MUST be LinearSdkClient
  input: string
): Promise<string>          // MUST return UUID string
```

**Standard implementation**:
```typescript
export async function resolveEntityId(
  client: LinearSdkClient,
  input: string
): Promise<string> {
  // 1. UUID passthrough
  if (isUuid(input)) return input;

  // 2. SDK lookup
  const result = await client.sdk.entities({
    filter: { /* lookup logic */ }
  });

  // 3. Error if not found
  if (!result.nodes[0]) {
    throw notFoundError("Entity", input);
  }

  return result.nodes[0].id;
}
```

**Supported resolvers**:
```
resolveTeamId(client, keyOrNameOrId): string
resolveProjectId(client, nameOrId): string
resolveLabelId(client, nameOrId): string
resolveLabelIds(client, namesOrIds[]): string[]
resolveCycleId(client, nameOrId, teamId?): string
resolveStatusId(client, nameOrId, teamId): string
resolveIssueId(client, identifier): string
resolveMilestoneId(client, nameOrId, projectId?): string
```

**Constraints**:
- Use `LinearSdkClient` only (not `GraphQLClient`)
- Return UUID strings only (not objects)
- No CRUD operations
- No data transformations

### Service Layer (`src/services/`)

**Purpose**: Business logic and CRUD operations

**Contract**:
```typescript
export async function action*(
  client: GraphQLClient,  // MUST be GraphQLClient
  params                  // Pre-resolved UUIDs only
): Promise<ResultType>
```

**Standard implementation**:
```typescript
export async function createEntity(
  client: GraphQLClient,
  input: {
    teamId: string;      // UUID - already resolved
    name: string;
    // ... other params
  }
): Promise<CreatedEntity> {
  const result = await client.request<MutationType>(
    MutationDocument,    // From codegen
    { input }
  );
  return result.entityCreate.entity;
}
```

**Services inventory**:
```
src/services/issue-service.ts
src/services/document-service.ts
src/services/attachment-service.ts
src/services/milestone-service.ts
src/services/cycle-service.ts
src/services/team-service.ts
src/services/user-service.ts
src/services/project-service.ts
src/services/label-service.ts
src/services/comment-service.ts
src/services/file-service.ts
```

**Constraints**:
- Use `GraphQLClient` only (not `LinearSdkClient`)
- Accept UUIDs only (no human-friendly IDs)
- No ID resolution logic
- Use codegen types (`DocumentNode`, typed results)

### Command Layer (`src/commands/`)

**Purpose**: CLI orchestration only

**Template**:
```typescript
export function setup*Commands(program: Command): void {
  const entity = program.command("entity");

  entity
    .command("action <arg>")
    .option("--team <id>", "Team identifier")
    .action(handleCommand(async (arg, options, command) => {
      // 1. Create context
      const ctx = await createContext(command.parent!.parent!.opts());

      // 2. Resolve IDs (if needed)
      const teamId = options.team
        ? await resolveTeamId(ctx.sdk, options.team)
        : undefined;

      // 3. Call service
      const result = await serviceAction(ctx.gql, { arg, teamId });

      // 4. Output
      outputSuccess(result);
    }))
}
```

**Import template**:
```typescript
import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolve*Id } from "../resolvers/*-resolver.js";
import { action* } from "../services/*-service.js";
```

**Registration** (`src/main.ts`):
```typescript
import { setup*Commands } from "./commands/*.js";
// ...
setup*Commands(program);
```

**Constraints**:
- Thin orchestration only (no business logic)
- Always use `handleCommand()` wrapper
- Always use `createContext()` for clients
- Resolve all IDs before calling services

### Common Layer (`src/common/`)

**Exports**:
```typescript
// context.ts
interface CommandContext { gql: GraphQLClient; sdk: LinearSdkClient }
function createContext(options): Promise<CommandContext>

// output.ts
function outputSuccess(data: unknown): void
function outputError(error: Error): void
function handleCommand<T>(fn: (...args: T) => Promise<void>): Function

// identifier.ts
function isUuid(value: string): boolean
function parseIssueIdentifier(input: string): IssueIdentifier

// errors.ts
function notFoundError(entity: string, id: string, context?: string): Error
function multipleMatchesError(entity: string, id: string, matches: string[]): Error

// types.ts - Codegen aliases
type Issue = GetIssuesQuery["issues"]["nodes"][0]
type IssueDetail = NonNullable<GetIssueByIdQuery["issue"]>
```

## Data Flow

```
CLI Input → Command → Resolver → Service → Output
              ↓         ↓          ↓
          createContext  SDK      GraphQL
                       (UUID)    (data)
```

**Key rule**: ID resolution happens ONCE in resolvers.

## Type System

### GraphQL Codegen Workflow

```
1. Edit: graphql/{queries,mutations}/*.graphql
2. Run: npm run generate
3. Import: src/gql/graphql.ts (DocumentNode + types)
4. Use: GraphQLClient.request<QueryType>(QueryDocument, vars)
```

### Codegen Import Pattern

```typescript
import {
  GetEntityDocument,           // DocumentNode
  type GetEntityQuery,         // Query result type
  type GetEntityQueryVariables // Query variables type
} from "../gql/graphql.js";

const result = await client.request<GetEntityQuery>(
  GetEntityDocument,
  { id }  // Typed variables
);
```

**Rules**:
- Never edit `src/gql/graphql.ts` (generated)
- Never use raw GraphQL strings
- Always use `DocumentNode` exports
- Always type `client.request<T>()`

## Testing Strategy

### Mock Pattern by Layer

```typescript
// Resolver test - Mock SDK
const mockTeam = vi.fn().mockResolvedValue({ id: "uuid-123" });
const client = { sdk: { team: mockTeam } } as unknown as LinearSdkClient;

// Service test - Mock GraphQL
const mockRequest = vi.fn().mockResolvedValue({ entity: { id: "123" } });
const client = { request: mockRequest } as unknown as GraphQLClient;

// Common test - No mocks (pure functions)
```

### Test File Structure

```
tests/unit/
  resolvers/
    team-resolver.test.ts
    label-resolver.test.ts
  services/
    issue-service.test.ts
    document-service.test.ts
  common/
    identifier.test.ts
```

**Coverage requirement**: Happy path + error case minimum.

## Common Patterns

### Pattern: Add New Command

```typescript
// 1. Create src/commands/entity.ts
import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { createEntity } from "../services/entity-service.js";

export function setupEntityCommands(program: Command): void {
  const entity = program.command("entity");

  entity
    .command("create <name>")
    .option("--team <id>", "Team")
    .action(handleCommand(async (name, options, command) => {
      const ctx = await createContext(command.parent!.parent!.opts());
      const teamId = options.team
        ? await resolveTeamId(ctx.sdk, options.team)
        : undefined;
      const result = await createEntity(ctx.gql, { name, teamId });
      outputSuccess(result);
    }));
}

// 2. Register in src/main.ts
import { setupEntityCommands } from "./commands/entity.js";
setupEntityCommands(program);
```

### Pattern: Add GraphQL Operation

```graphql
# 1. Define in graphql/mutations/entity.graphql
fragment EntityFields on Entity {
  id
  name
  team { id name }
}

mutation CreateEntity($input: EntityCreateInput!) {
  entityCreate(input: $input) {
    entity { ...EntityFields }
  }
}
```

```bash
# 2. Run codegen
npm run generate
```

```typescript
// 3. Use in service
import { CreateEntityDocument, type CreateEntityMutation } from "../gql/graphql.js";

export async function createEntity(
  client: GraphQLClient,
  input: { name: string; teamId: string }
): Promise<Entity> {
  const result = await client.request<CreateEntityMutation>(
    CreateEntityDocument,
    { input }
  );
  return result.entityCreate.entity;
}
```

### Pattern: Add Resolver

```typescript
// src/resolvers/entity-resolver.ts
import type { LinearSdkClient } from "../client/linear-client.js";
import { isUuid } from "../common/identifier.js";
import { notFoundError } from "../common/errors.js";

export async function resolveEntityId(
  client: LinearSdkClient,
  nameOrId: string
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const entities = await client.sdk.entities({
    filter: { name: { eq: nameOrId } }
  });

  if (!entities.nodes[0]) {
    throw notFoundError("Entity", nameOrId);
  }

  return entities.nodes[0].id;
}
```

### Pattern: Add Service

```typescript
// src/services/entity-service.ts
import type { GraphQLClient } from "../client/graphql-client.js";
import {
  GetEntitiesDocument,
  type GetEntitiesQuery,
  CreateEntityDocument,
  type CreateEntityMutation
} from "../gql/graphql.js";

export async function listEntities(
  client: GraphQLClient,
  limit = 50
): Promise<Entity[]> {
  const result = await client.request<GetEntitiesQuery>(
    GetEntitiesDocument,
    { first: limit }
  );
  return result.entities.nodes;
}

export async function createEntity(
  client: GraphQLClient,
  input: { name: string; teamId: string }
): Promise<Entity> {
  const result = await client.request<CreateEntityMutation>(
    CreateEntityDocument,
    { input }
  );
  return result.entityCreate.entity;
}
```

### Pattern: Error Handling

```typescript
// In resolvers/services - Throw descriptive errors
throw notFoundError("Team", "ABC-123", "Check team key");
throw multipleMatchesError("Cycle", "Sprint 1", ["id1", "id2"], "Specify team");

// In commands - Use handleCommand wrapper (catches automatically)
.action(handleCommand(async (...args) => {
  // No try/catch needed
}))
```

## Anti-Patterns (Violations)

### ID Resolution in Service

```typescript
// WRONG - Service doing resolution
export async function createIssue(
  client: GraphQLClient,
  teamName: string  // Human-friendly ID
) {
  const teamId = await resolveTeamId(...);  // Resolution in service
}

// CORRECT - Service receives UUID
export async function createIssue(
  client: GraphQLClient,
  input: { teamId: string }  // Pre-resolved UUID
) {
  // ...
}
```

### Wrong Client in Layer

```typescript
// WRONG - Resolver using GraphQL client
export async function resolveTeamId(
  client: GraphQLClient  // Wrong client type
) {
  const result = await client.request(...);
}

// CORRECT - Resolver using SDK client
export async function resolveTeamId(
  client: LinearSdkClient  // Correct client type
) {
  const team = await client.sdk.team(...);
}
```

### Business Logic in Command

```typescript
// WRONG - Logic in command
.action(handleCommand(async (title, options) => {
  const ctx = await createContext(...);
  const variables = { title, teamId: options.team };  // Complex logic
  const result = await ctx.gql.request(..., variables);
}))

// CORRECT - Delegate to service
.action(handleCommand(async (title, options) => {
  const ctx = await createContext(...);
  const teamId = await resolveTeamId(ctx.sdk, options.team);
  const result = await createIssue(ctx.gql, { title, teamId });
}))
```

### Using `any` Types

```typescript
// WRONG
export async function getIssue(id: string): Promise<any> {
  const result: any = await client.request(...);
}

// CORRECT
export async function getIssue(
  client: GraphQLClient,
  id: string
): Promise<IssueDetail> {
  const result = await client.request<GetIssueByIdQuery>(...);
}
```

## Decision Trees

### Adding Functionality

```
Need GraphQL operation?
  → Define in graphql/{queries,mutations}/*.graphql
  → Run npm run generate
  ↓
Need ID resolution?
  → Add resolve*Id() to src/resolvers/*-resolver.ts
  → Use LinearSdkClient
  → Return UUID string
  ↓
Need business logic?
  → Add function to src/services/*-service.ts
  → Use GraphQLClient
  → Accept UUIDs only
  ↓
Need CLI interface?
  → Add setup*Commands() to src/commands/*.ts
  → Use createContext() + resolvers + services
  → Register in src/main.ts
  ↓
Write tests
  → tests/unit/{resolvers,services,common}/*.test.ts
  → Mock one layer deep
```

### Troubleshooting

```
"Entity not found" but exists?
  → Check resolver: try key/name/ID lookup order
  → Verify correct SDK query filters

N+1 query performance?
  → Add GraphQL fragments
  → Fetch relationships in single query

TypeScript errors after GraphQL changes?
  → Run: npm run generate

Tests hitting real API?
  → Check mocks: client.request or client.sdk.* mocked?

"Multiple matches" error?
  → Add disambiguation parameter (e.g., teamId for cycles)
```

## File Organization

```
src/
  client/          # API wrappers
  resolvers/       # ID resolution (SDK)
  services/        # Business logic (GraphQL)
  commands/        # CLI orchestration
  common/          # Shared utilities
  gql/             # Codegen output (DO NOT EDIT)

graphql/
  queries/         # GraphQL query definitions
  mutations/       # GraphQL mutation definitions

tests/
  unit/
    resolvers/     # Resolver tests (mock SDK)
    services/      # Service tests (mock GraphQL)
    common/        # Pure function tests (no mocks)
```

## Commands

```bash
# Development
npm start              # Dev mode (tsx)
npm run build          # Compile to dist/
npm run clean          # Remove dist/
npm test               # Run tests
npm run generate       # Regenerate GraphQL types

# Package
npm install            # Install deps
npm update             # Update deps
```

## Technical Constraints

```yaml
node: ">=22.0.0"
module_system: ES_MODULES
typescript:
  strict: true
  no_any: true
output_format: JSON  # Except help/usage
```

## Dependencies

```json
{
  "@linear/sdk": "^58.1.0",
  "commander": "^14.0.0",
  "tsx": "^4.20.5"
}
```

## Quick Reference

### Layer-Client Matrix

| Layer | Client | Operations | Input | Output |
|-------|--------|------------|-------|--------|
| Resolver | `LinearSdkClient` | ID lookup | Name/key/ID | UUID |
| Service | `GraphQLClient` | CRUD | UUIDs | Data |
| Command | Both via `createContext()` | Orchestration | CLI args | JSON |

### Function Signature Templates

```typescript
// Resolver
export async function resolve*Id(
  client: LinearSdkClient,
  input: string
): Promise<string>

// Service - List
export async function list*(
  client: GraphQLClient,
  limit?: number
): Promise<Entity[]>

// Service - Get
export async function get*(
  client: GraphQLClient,
  id: string
): Promise<EntityDetail>

// Service - Create
export async function create*(
  client: GraphQLClient,
  input: EntityCreateInput
): Promise<CreatedEntity>

// Service - Update
export async function update*(
  client: GraphQLClient,
  id: string,
  input: EntityUpdateInput
): Promise<UpdatedEntity>

// Command Setup
export function setup*Commands(program: Command): void
```

### Import Templates

```typescript
// Command imports
import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolve*Id } from "../resolvers/*-resolver.js";
import { action* } from "../services/*-service.js";

// Service imports
import type { GraphQLClient } from "../client/graphql-client.js";
import {
  DocumentName,
  type QueryType
} from "../gql/graphql.js";

// Resolver imports
import type { LinearSdkClient } from "../client/linear-client.js";
import { isUuid } from "../common/identifier.js";
import { notFoundError } from "../common/errors.js";
```

## Authentication

Checked in order:
1. `--api-token` flag
2. `LINEAR_API_TOKEN` env var
3. `~/.linear_api_token` file

## Additional Documentation

```
docs/architecture.md          # Component organization
docs/development.md           # Code patterns
docs/build-system.md          # Compilation
docs/testing.md               # Testing approach
docs/files.md                 # File catalog
```
