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

### Two-Layer Service Architecture

The codebase uses a dual-service pattern optimized for performance:

1. **GraphQLService** (`src/utils/graphql-service.ts`) - Direct GraphQL queries with batch operations
   - Eliminates N+1 query problems
   - Single-query fetches for complex relationships
   - Used by all primary commands (issues list/search/read/update/create)

2. **LinearService** (`src/utils/linear-service.ts`) - SDK-based operations and smart ID resolution
   - Human-friendly ID conversions (ABC-123 → UUID, "Bug" → label UUID)
   - Fallback operations for complex workflows
   - Used for ID resolution and helper operations

### Core Components

**Command Layer** (`src/commands/`)

- Each command file exports a `setup*Commands(program)` function
- Commands registered in `src/main.ts` with Commander.js
- All commands use `handleAsyncCommand()` wrapper for consistent error handling
- Current commands: issues, comments, labels, projects, cycles, project-milestones, embeds, teams, users

**Service Layer** (`src/utils/`)

- `graphql-service.ts` - Raw GraphQL execution and batch operations
- `graphql-issues-service.ts` - Optimized single-query issue operations
- `linear-service.ts` - Smart ID resolution and SDK fallback operations
- `auth.ts` - Multi-source authentication (flag, env var, file)
- `output.ts` - JSON formatting and error handling

**Query Definitions**

- **GraphQL Files** (`graphql/queries/` and `graphql/mutations/`) - Raw GraphQL operation definitions with fragments
- **Query Loaders** (`src/queries/`) - TypeScript modules that load and parse GraphQL files, extracting operations with their dependencies
- Query files organized by entity (issues.ts, documents.ts, attachments.ts, project-milestones.ts)
- Each loader reads the `.graphql` files and exports query/mutation strings for use with GraphQLService

**Type System** (`src/utils/linear-types.d.ts`)

- TypeScript interfaces for all Linear entities
- Ensures type safety across service layers

### Authentication Flow

Three authentication methods (checked in order):

1. `--api-token` command flag
2. `LINEAR_API_TOKEN` environment variable
3. Plain text file at `$HOME/.linear_api_token`

### Smart ID Resolution

Users can provide human-friendly identifiers that get automatically resolved:

- **Issue IDs**: `ABC-123` → UUID (parses team key + issue number)
- **Project names**: `"Mobile App"` → project UUID
- **Label names**: `"Bug", "Enhancement"` → label UUIDs
- **Team identifiers**: `"ABC"` (key) or `"My Team"` (name) → team UUID
- **Cycle names**: `"Sprint 2025-10"` → cycle UUID (with team disambiguation)

All resolution happens in `LinearService` via `resolve*Id()` methods.

### GraphQL Optimization Pattern

**Problem:** Linear SDK creates N+1 queries when fetching related entities.

**Solution:** Custom GraphQL queries with fragments fetch everything in one request.

Example - listing issues:

- SDK approach: 1 query for issues + 5 queries per issue (team, assignee, state, project, labels) = 1 + (5 × N) queries
- GraphQL approach: 1 query with all relationships embedded = 1 query total

See `graphql/queries/issues.graphql` for fragment definitions and query operations, and `src/utils/graphql-issues-service.ts` for usage.

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
3. Register in `src/main.ts` by importing and calling setup function
4. Use `handleAsyncCommand()` wrapper for all async actions
5. Create services with `createGraphQLService()` and/or `createLinearService()`
6. Output results with `outputSuccess(data)` or let errors propagate

### Adding GraphQL Queries

1. Define operations in `graphql/queries/<entity>.graphql` or `graphql/mutations/<entity>.graphql`
2. Define reusable fragments in the same file or reference fragments from other files
3. Run `npm run generate` to regenerate TypeScript types from GraphQL schema
4. The query loader in `src/queries/<entity>.ts` will automatically extract the new operation
5. Add corresponding method in a GraphQL service (e.g., `GraphQLIssuesService`) or create new service
6. Test that all nested relationships are fetched in single query

The GraphQL codegen workflow:
- GraphQL operations are defined in `.graphql` files (human-readable, version-controlled)
- `npm run generate` runs GraphQL codegen to generate TypeScript types in `src/gql/`
- Query loaders in `src/queries/` read the `.graphql` files at runtime and extract operations as strings
- Services use the query strings with `GraphQLService.rawRequest()` for execution

### Error Handling

- All commands wrapped with `handleAsyncCommand()` which catches and formats errors
- Service methods throw descriptive errors: `throw new Error("Team 'ABC' not found")`
- GraphQL errors transformed to match service error patterns in `GraphQLService.rawRequest()`

## Technical Requirements

- Node.js >= 22.0.0
- ES modules (type: "module" in package.json)
- All CLI output must be JSON format (except help/usage text)
- TypeScript with full type safety

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
