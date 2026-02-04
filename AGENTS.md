# AGENTS.md

This file provides guidance to LLM agents when working with code in this repository.

## Project Overview

Linearis is a CLI tool for Linear.app that outputs structured JSON data, designed for LLM agents and users who prefer structured output. Written in TypeScript, built with Node.js using Commander.js for CLI structure and optimized GraphQL queries for Linear API integration.

**Design philosophy:** Minimize token usage for LLM agents while providing rich, structured data. The entire usage guide (`linearis usage`) comes in under 1000 tokens.

## Key Commands

### Development

- `npm start` - Run CLI in development mode using tsx (no compilation)
- `npm run build` - Compile TypeScript to dist/ and make executable
- `npm run clean` - Remove dist/ directory
- `node dist/main.js` - Run compiled production version
- `npm test` - Run test suite (unit + integration tests)

### Package Management

- Uses `npm` as the package manager
- `npm install` - Install dependencies
- `npm update` - Update dependencies

## Architecture

### Five-Layer Architecture

The codebase uses a layered architecture that separates concerns and eliminates code duplication:

1. **Client Layer** (`src/client/`) - GraphQL and SDK wrappers
   - `graphql-client.ts` - Typed GraphQL client for direct queries
   - `linear-client.ts` - Thin wrapper for Linear SDK access
   - Takes `DocumentNode` types from codegen, returns typed results
   - No business logic or ID resolution

2. **Resolver Layer** (`src/resolvers/`) - Human-friendly ID → UUID resolution
   - Pure functions: `resolveTeamId()`, `resolveProjectId()`, `resolveLabelId()`, etc.
   - Converts human inputs (ABC-123, "Bug", "My Team") to UUIDs
   - Uses SDK for lookups with smart fallbacks (key → name)
   - Example: `resolveCycleId(client, "Sprint 1", "ENG")` → UUID with disambiguation

3. **Service Layer** (`src/services/`) - Business logic functions
   - Pure, typed functions for CRUD operations
   - Receives pre-resolved UUIDs, no ID resolution
   - Uses GraphQL client for data operations
   - Example: `createIssue(client, { teamId: "uuid", title: "..." })`
   - Services: issue, document, attachment, milestone, cycle, team, user, project, label, comment, file

4. **Command Layer** (`src/commands/`) - CLI orchestration
   - Thin command handlers that compose resolvers and services
   - Pattern: create context → resolve IDs → call service → output result
   - All commands use `handleCommand()` wrapper for error handling
   - Current commands: issues, documents, comments, labels, projects, cycles, project-milestones, embeds, teams, users

5. **Common Layer** (`src/common/`) - Shared utilities
   - `context.ts` - Creates clients (gql + sdk) from auth options
   - `auth.ts` - Multi-source authentication (flag, env var, file)
   - `output.ts` - JSON formatting (`outputSuccess`, `handleCommand`)
   - `errors.ts` - Typed error factories (`notFoundError`, `multipleMatchesError`)
   - `identifier.ts` - UUID/identifier utilities (`isUuid`, `parseIssueIdentifier`)
   - `types.ts` - Type aliases derived from codegen types
   - `embed-parser.ts` - Linear upload URL parsing
   - `usage.ts` - CLI usage information

### Core Components

**Command Layer** (`src/commands/`)

- Each command file exports a `setup*Commands(program)` function
- Commands registered in `src/main.ts` with Commander.js
- All commands use `handleCommand()` wrapper for consistent error handling
- Pattern: `const ctx = await createContext(opts)` → resolve IDs → call services

**Query Definitions**

- **GraphQL Files** (`graphql/queries/` and `graphql/mutations/`) - Raw GraphQL operation definitions with fragments
- **Codegen Output** (`src/gql/graphql.ts`) - TypeScript types and `DocumentNode` exports
- Query files organized by entity (issues, documents, attachments, project-milestones)
- Run `npm run generate` to regenerate types from GraphQL schema

**Type System**

- All types derived from GraphQL codegen (`src/gql/graphql.ts`)
- Type aliases in `src/common/types.ts` for convenience
- Strict TypeScript - no `any` types in new architecture
- Ensures type safety across all layers

### Authentication Flow

Three authentication methods (checked in order):

1. `--api-token` command flag
2. `LINEAR_API_TOKEN` environment variable
3. Plain text file at `$HOME/.linear_api_token`

Implemented in `src/common/auth.ts` via `getApiToken()` function.

### Smart ID Resolution

Users can provide human-friendly identifiers that get automatically resolved in the resolver layer:

- **Issue IDs**: `ABC-123` → UUID (parses team key + issue number)
- **Project names**: `"Mobile App"` → project UUID
- **Label names**: `"Bug", "Enhancement"` → label UUIDs
- **Team identifiers**: `"ABC"` (key) or `"My Team"` (name) → team UUID
- **Cycle names**: `"Sprint 2025-10"` → cycle UUID (with team disambiguation)
- **Milestone names**: With optional project scoping for disambiguation

All resolution happens in `src/resolvers/` via standalone `resolve*Id()` functions.

### GraphQL Optimization Pattern

**Problem:** Linear SDK creates N+1 queries when fetching related entities.

**Solution:** Custom GraphQL queries with fragments fetch everything in one request.

Example - listing issues:

- SDK approach: 1 query for issues + 5 queries per issue (team, assignee, state, project, labels) = 1 + (5 × N) queries
- GraphQL approach: 1 query with all relationships embedded = 1 query total

See `graphql/queries/issues.graphql` for fragment definitions and query operations.

### File Download Features

The CLI can extract and download files uploaded to Linear's private cloud storage:

- **Embed Extraction**: `issues read` command automatically parses markdown content for Linear upload URLs and includes them in the `embeds` array
- **Signed URLs**: Uses Linear's `public-file-urls-expire-in` header to request 1-hour signed URLs that don't require Bearer token authentication
- **File Downloads**: `embeds download <url>` command downloads files from signed URLs
- **Expiration Tracking**: Each embed includes `expiresAt` timestamp (ISO 8601) indicating when the signed URL expires
- **Smart Auth**: FileService automatically detects signed URLs and skips Bearer token authentication when signature is present

## Development Patterns

### Adding a New Command

1. Create command file in `src/commands/` (e.g., `milestones.ts`)
2. Export `setup*Commands(program: Command)` function
3. Import types: `createContext`, `handleCommand`, `outputSuccess` from `src/common/`
4. Import resolvers from `src/resolvers/` (e.g., `resolveProjectId`, `resolveMilestoneId`)
5. Import services from `src/services/` (e.g., `createMilestone`, `listMilestones`)
6. Implement command pattern:
   ```typescript
   .action(
     handleCommand(
       async (...args: unknown[]) => {
         const [options, command] = args as [OptionsType, Command];
         const ctx = await createContext(command.parent!.parent!.opts());

         // Resolve IDs if needed
         const projectId = await resolveProjectId(ctx.sdk, options.project);

         // Call service
         const result = await createMilestone(ctx.gql, { projectId, ... });

         outputSuccess(result);
       }
     )
   )
   ```
7. Register in `src/main.ts` by importing and calling setup function

### Adding GraphQL Queries

1. Define operations in `graphql/queries/<entity>.graphql` or `graphql/mutations/<entity>.graphql`
2. Define reusable fragments in the same file or reference fragments from other files
3. Run `npm run generate` to regenerate TypeScript types from GraphQL schema
4. Import `DocumentNode` and types from `src/gql/graphql.ts`
5. Create or update service in `src/services/` to use the new operation:
   ```typescript
   const result = await client.request<QueryType>(
     QueryDocument,
     { variables }
   );
   ```
6. Test that all nested relationships are fetched in single query

The GraphQL codegen workflow:
- GraphQL operations are defined in `.graphql` files (human-readable, version-controlled)
- `npm run generate` runs GraphQL codegen to generate TypeScript types in `src/gql/`
- Services import `DocumentNode` and types directly from codegen
- GraphQLClient accepts `DocumentNode` and returns typed results

### Error Handling

- All commands wrapped with `handleCommand()` which catches and formats errors
- Service and resolver functions throw descriptive errors: `throw new Error("Team 'ABC' not found")`
- Error factory functions in `src/common/errors.ts`: `notFoundError()`, `multipleMatchesError()`, etc.
- GraphQL errors transformed in `GraphQLClient.request()`

## Technical Requirements

- Node.js >= 22.0.0
- ES modules (type: "module" in package.json)
- All CLI output must be JSON format (except help/usage text)
- TypeScript with strict mode - no `any` types

## Dependencies

- `@linear/sdk` (^58.1.0) - Official Linear TypeScript SDK and GraphQL client
- `commander` (^14.0.0) - CLI framework
- `tsx` (^4.20.5) - TypeScript execution for development

## Documentation

Comprehensive docs in `docs/`:

- `architecture.md` - Component organization, data flow, optimization patterns
- `development.md` - Code patterns, TypeScript standards, common workflows
- `build-system.md` - TypeScript compilation, automated builds
- `testing.md` - Testing approach, manual validation, performance benchmarks
- `files.md` - Complete file catalog
