# Architecture

Linearis follows a modular, five-layer architecture with clear separation of concerns. The application uses a command-based structure with Commander.js, typed GraphQL operations, standalone resolver functions, and service functions that eliminate code duplication.

The architecture emphasizes performance through GraphQL batch operations, single-query optimizations, and smart ID resolution for user convenience. All components are fully typed with TypeScript - no `any` types in the new architecture. The system uses both direct GraphQL queries (via typed client) and Linear SDK (for ID resolution).

## Five-Layer Architecture

### 1. Client Layer (`src/client/`)

Thin wrappers around GraphQL and Linear SDK with no business logic.

- **graphql-client.ts** - Typed GraphQL client
  - Takes `DocumentNode` from codegen
  - Returns typed results via generics
  - Handles error transformation
  - No ID resolution or business logic

- **linear-client.ts** - Linear SDK wrapper
  - Simple wrapper exposing `sdk` property
  - Used by resolvers for lookups
  - No business logic

### 2. Resolver Layer (`src/resolvers/`)

Pure functions that convert human-friendly identifiers to UUIDs.

- **team-resolver.ts** - `resolveTeamId(client, keyOrNameOrId)`
  - Tries team key first, falls back to name
  - Returns UUID

- **project-resolver.ts** - `resolveProjectId(client, nameOrId)`
- **label-resolver.ts** - `resolveLabelId(client, nameOrId)`, `resolveLabelIds(client, namesOrIds)`
- **issue-resolver.ts** - `resolveIssueId(client, issueIdOrIdentifier)` - Parses ABC-123 format
- **status-resolver.ts** - `resolveStatusId(client, nameOrId, teamId?)`
- **cycle-resolver.ts** - `resolveCycleId(client, nameOrId, teamFilter?)` - Complex disambiguation
- **milestone-resolver.ts** - `resolveMilestoneId(gqlClient, sdkClient, nameOrId, projectNameOrId?)`

**Pattern:**
- Accept SDK or GraphQL client
- Check if input is UUID (early return)
- Query Linear API for name/key match
- Throw descriptive error if not found
- Return UUID string

### 3. Service Layer (`src/services/`)

Pure, typed functions for CRUD operations. Receive pre-resolved UUIDs.

- **issue-service.ts** - `listIssues()`, `getIssue()`, `searchIssues()`, `createIssue()`, `updateIssue()`
- **document-service.ts** - `getDocument()`, `createDocument()`, `updateDocument()`, `listDocuments()`, `deleteDocument()`
- **attachment-service.ts** - `createAttachment()`, `deleteAttachment()`, `listAttachments()`
- **milestone-service.ts** - `listMilestones()`, `getMilestone()`, `createMilestone()`, `updateMilestone()`
- **cycle-service.ts** - `listCycles()`, `getCycle()`
- **team-service.ts** - `listTeams()`
- **user-service.ts** - `listUsers()`
- **project-service.ts** - `listProjects()`
- **label-service.ts** - `listLabels()`
- **comment-service.ts** - `createComment()`
- **file-service.ts** - File upload/download operations

**Pattern:**
- Accept `GraphQLClient` or `LinearSdkClient`
- Take pre-resolved UUIDs in inputs
- Use codegen `DocumentNode` types
- Return typed results
- Throw on failure

### 4. Command Layer (`src/commands/`)

Thin orchestration layer that composes resolvers and services.

- **auth.ts** - Authentication commands (login, status, logout) — interactive, for humans
- **issues.ts** - Issue commands (list, search, read, create, update)
- **documents.ts** - Document commands with attachment operations
- **project-milestones.ts** - Milestone commands
- **cycles.ts** - Cycle commands
- **teams.ts** - Team listing
- **users.ts** - User listing
- **projects.ts** - Project listing
- **labels.ts** - Label listing
- **comments.ts** - Comment creation
- **embeds.ts** - File download operations

**Pattern:**
```typescript
.action(
  handleCommand(
    async (...args: unknown[]) => {
      const [options, command] = args as [OptionsType, Command];
      const ctx = await createContext(command.parent!.parent!.opts());

      // Resolve IDs
      const teamId = await resolveTeamId(ctx.sdk, options.team);
      const labelIds = await resolveLabelIds(ctx.sdk, options.labels.split(','));

      // Call service
      const result = await createIssue(ctx.gql, {
        teamId,
        labelIds,
        title: options.title,
      });

      outputSuccess(result);
    }
  )
)
```

### 5. Common Layer (`src/common/`)

Shared utilities used across layers.

- **context.ts** - `createContext(options)` - Creates `{ gql, sdk }` from auth
- **auth.ts** - `resolveApiToken(options)` - Multi-source authentication (flag, env, encrypted storage, legacy file)
- **output.ts** - `outputSuccess(data)`, `outputError(error)`, `handleCommand(fn)`
- **errors.ts** - `notFoundError()`, `multipleMatchesError()`, `invalidParameterError()`
- **identifier.ts** - `isUuid()`, `parseIssueIdentifier()`, `tryParseIssueIdentifier()`
- **types.ts** - Type aliases from codegen (Issue, Document, Attachment, etc.)
- **embed-parser.ts** - Linear upload URL parsing utilities
- **usage.ts** - Token-optimized two-tier usage system (`formatOverview()`, `formatDomainUsage()`, `DomainMeta`)

## Component Map

### Command Layer - CLI Interface

- **src/main.ts** - Main program setup with Commander.js, command routing, and global options
- **src/commands/auth.ts** - Authentication management (interactive, for humans)
- **src/commands/issues.ts** - Issue management with resolvers and service composition
- **src/commands/documents.ts** - Document operations with attachment support
- **src/commands/project-milestones.ts** - Milestone CRUD operations
- **src/commands/cycles.ts** - Cycle listing and reading
- **src/commands/teams.ts** - Team listing
- **src/commands/users.ts** - User listing
- **src/commands/projects.ts** - Project listing
- **src/commands/labels.ts** - Label listing
- **src/commands/comments.ts** - Comment creation
- **src/commands/embeds.ts** - File operations

### Client Layer - API Wrappers

- **src/client/graphql-client.ts** - Typed GraphQL client with error handling
- **src/client/linear-client.ts** - Linear SDK wrapper

### Resolver Layer - ID Resolution

- **src/resolvers/** - Pure resolver functions for converting names/identifiers to UUIDs

### Service Layer - Business Logic

- **src/services/** - Pure, typed functions for CRUD operations

### Common Layer - Shared Utilities

- **src/common/** - Authentication, output formatting, error handling, types

### Type System - Data Contracts

- **src/gql/graphql.ts** - Generated TypeScript types and DocumentNode exports from GraphQL schema
- **src/common/types.ts** - Convenient type aliases derived from codegen types

## Key Files

### Core Architecture Components

**Main Entry Point**

- src/main.ts - Sets up Commander.js program with global options and subcommand registration

**Client Layer**

- src/client/graphql-client.ts - GraphQLClient class with typed request method
- src/client/linear-client.ts - LinearSdkClient wrapper

**Resolver Layer**

- src/resolvers/team-resolver.ts - Team key/name → UUID
- src/resolvers/issue-resolver.ts - ABC-123 → UUID
- src/resolvers/cycle-resolver.ts - Cycle name → UUID with disambiguation

**Service Layer**

- src/services/issue-service.ts - Issue CRUD operations
- src/services/document-service.ts - Document CRUD operations
- src/services/milestone-service.ts - Milestone CRUD operations

**Common Layer**

- src/common/context.ts - createContext factory
- src/common/auth.ts - resolveApiToken with fallback sources (flag, env, encrypted storage, legacy file)
- src/common/token-storage.ts - Encrypted token storage (saveToken, getStoredToken, clearToken)
- src/common/output.ts - outputSuccess, outputError, handleCommand

**Query Definitions**

- graphql/queries/*.graphql - GraphQL operation definitions
- graphql/mutations/*.graphql - GraphQL mutation definitions
- src/gql/graphql.ts - Generated types and DocumentNode exports

## Data Flow

### Command Execution Flow

1. **Command Parsing** - src/main.ts parses CLI arguments via Commander.js
2. **Context Creation** - src/common/context.ts creates `{ gql, sdk }` from auth options
3. **Authentication** - src/common/auth.ts resolves API token from multiple sources
4. **ID Resolution** - src/resolvers/* convert human inputs to UUIDs via SDK
5. **Service Operations** - src/services/* execute typed GraphQL operations
6. **Response Formatting** - src/common/output.ts outputs structured JSON

### Smart ID Resolution Process

Linear API uses UUIDs internally, but users prefer human-readable identifiers. Resolution happens in the resolver layer:

**Issue Resolution** (src/resolvers/issue-resolver.ts)

- Input: "ABC-123" → Parse team key and issue number → Query by team.key + issue.number → Return UUID

**Project Resolution** (src/resolvers/project-resolver.ts)

- Input: "Mobile App" → Query projects by case-insensitive name → Return project UUID

**Team Resolution** (src/resolvers/team-resolver.ts)

- Input: "ABC" → Try team key first, fall back to team name → Return team UUID

**Cycle Resolution** (src/resolvers/cycle-resolver.ts)

- Input: "Sprint 1" → Query cycles by name → Disambiguate by active/next/previous → Return UUID

### GraphQL Optimization Pattern

**Single Query Strategy** (all services)

```typescript
// Replaces 1 + (5 × N) API calls with single GraphQL query
const result = await client.request<GetIssuesQuery>(
  GetIssuesDocument,
  { first: limit, orderBy: "updatedAt" }
);
```

**Typed Operations**

All GraphQL operations use codegen types:
- Import `DocumentNode` from `src/gql/graphql.ts`
- Pass to `client.request<ResultType>(Document, variables)`
- Get fully typed results

This eliminates N+1 query problems by using GraphQL's ability to fetch complex relationships in single requests.

## Architectural Benefits

1. **No Code Duplication** - ID resolution logic centralized in resolvers
2. **Type Safety** - No `any` types, everything derived from GraphQL schema
3. **Testability** - Pure functions at every layer, easy to unit test
4. **Maintainability** - Clear separation of concerns, easy to locate logic
5. **Performance** - Single-query fetches, batch operations via GraphQL
6. **Developer Experience** - Functions over classes, simple imports, clear data flow
