# File Catalog

A reference of every file in the Linearis codebase, organized by architectural layer.

## Entry Point

- **src/main.ts** -- CLI setup with Commander.js. Registers all command groups and parses global options.

## Client Layer (`src/client/`)

Thin wrapper around the Linear API. No business logic.

- **graphql-client.ts** -- `GraphQLClient` class with a typed `request<TResult>(document: DocumentNode, variables?: Record<string, unknown>)` method for direct GraphQL execution.

## Resolver Layer (`src/resolvers/`)

Each resolver converts a human-friendly identifier (name, key, or slug) into a UUID. Resolvers use `GraphQLClient` with lean filter-based lookup queries.

- **team-resolver.ts** -- `resolveTeamId(client, keyOrNameOrId)`
- **project-resolver.ts** -- `resolveProjectId(client, nameOrId)`
- **label-resolver.ts** -- `resolveLabelId(client, nameOrId)`, `resolveLabelIds(client, namesOrIds)`
- **cycle-resolver.ts** -- `resolveCycleId(client, nameOrId, teamFilter?)`
- **status-resolver.ts** -- `resolveStatusId(client, nameOrId, teamId?)`
- **issue-resolver.ts** -- `resolveIssueId(client, issueIdOrIdentifier)`
- **milestone-resolver.ts** -- `resolveMilestoneId(gqlClient, sdkClient, nameOrId, projectNameOrId?)`
- **project-status-resolver.ts** -- `resolveProjectStatusId(client, nameOrId, { includeArchived? })`
- **project-relation-resolver.ts** -- `resolveProjectRelationId(client, relationOrProjectId, relatedProjectId?)` — a relation UUID, or the relation between two projects

## Service Layer (`src/services/`)

Business logic and CRUD operations. Services use `GraphQLClient` exclusively and accept pre-resolved UUIDs.

- **issue-service.ts** -- `listIssues`, `getIssue`, `searchIssues`, `createIssue`, `updateIssue`
- **document-service.ts** -- `getDocument`, `createDocument`, `updateDocument`, `listDocuments`, `deleteDocument`
- **attachment-service.ts** -- `createAttachment`, `deleteAttachment`, `listAttachments`
- **milestone-service.ts** -- `listMilestones`, `getMilestone`, `createMilestone`, `updateMilestone`
- **cycle-service.ts** -- `listCycles`, `getCycle`
- **team-service.ts** -- `listTeams`
- **user-service.ts** -- `listUsers`
- **project-service.ts** -- `listProjects`, `searchProjects`, `getProject`, `createProject`, `updateProject`, `applyProjectLabels`, `disableProjectExternalSync`, `unarchiveProject`, `deleteProject`
- **project-update-service.ts** -- Project status posts: `listProjectUpdates`, `getProjectUpdate`, `createProjectUpdate`, `editProjectUpdate`, archive/unarchive, `remindProjectUpdate`
- **project-status-service.ts** -- The workspace project status flow: list/get/create/update, `reassignProjectStatus`, archive/unarchive
- **project-relation-service.ts** -- Project dependencies: list (per project and workspace-wide), get, create, update, delete
- **project-activity-service.ts** -- Merges project discussions, history and status updates into one chronological timeline
- **label-service.ts** -- `listLabels`, `listProjectLabels`, and get/create/update/delete/retire/restore dispatching on `LabelType`
- **comment-service.ts** -- `createComment`
- **file-service.ts** -- File upload and download operations for Linear uploads

## Command Layer (`src/commands/`)

CLI orchestration. Each file registers a command group via a `setup*Commands(program)` function. Commands use `createContext()` to obtain both clients, call resolvers for ID conversion, then delegate to services.

- **auth.ts** -- `auth login`, `auth status`, `auth logout` — interactive authentication (for humans)
- **issues.ts** -- `issue list`, `issue search`, `issue read`, `issue create`, `issue update`
- **issues-batch.ts** -- `issues batch create`, `issues batch update` — the bulk subgroup, split out because it takes a JSON document rather than flags
- **documents.ts** -- Document commands with attachment support
- **project-milestones.ts** -- Milestone CRUD commands
- **cycles.ts** -- Cycle listing and detail reading
- **teams.ts** -- Team listing
- **users.ts** -- User listing
- **projects/** -- Project commands. `index.ts` owns `PROJECTS_META` and registers the domain; `entity.ts` holds CRUD, search, sync and discussions; `updates.ts`, `statuses.ts` and `relations.ts` hold the subgroups
- **labels.ts** -- Label commands for both issue and project labels (`--type`)
- **comments.ts** -- Comment creation
- **embeds.ts** -- File download from Linear upload URLs

## Common Layer (`src/common/`)

Shared utilities used across all layers.

- **context.ts** -- `CommandContext` interface and `createContext()` factory that produces the `GraphQLClient` (`ctx.gql`).
- **auth.ts** -- `resolveApiToken()` with multi-source lookup: `--api-token` flag, `LINEAR_API_TOKEN` env var, `~/.linearis/token` (encrypted), `~/.linear_api_token` (deprecated).
- **token-storage.ts** -- `saveToken()`, `getStoredToken()`, `clearToken()` for encrypted token storage in `~/.linearis/token`.
- **encryption.ts** -- AES-256-CBC encryption for token storage.
- **output.ts** -- `outputSuccess()`, `outputError()`, and `handleCommand()` wrapper for consistent JSON output and error handling.
- **errors.ts** -- `notFoundError()`, `multipleMatchesError()`, `invalidParameterError()`, `requiresParameterError()`.
- **identifier.ts** -- `isUuid()`, `parseIssueIdentifier()`, `tryParseIssueIdentifier()`, `parseDueDate()` (Linear's timeless `TimelessDate`).
- **datetime.ts** -- `parseDateTimeOption(flag, value, now?)` for the `DateTime` flags (`remind --at`, `snooze --until`): ISO-8601 or a `+2h`/`+3d` offset, normalized to UTC.
- **git.ts** -- `getCurrentBranch()` for `issues from-branch`; shells out via `execFileSync`, never a shell.
- **types.ts** -- Type aliases derived from codegen output (e.g., `Issue`, `IssueDetail`, `Document`).
- **embed-parser.ts** -- `extractEmbeds()`, `isLinearUploadUrl()`, `extractFilenameFromUrl()` for parsing embedded files in markdown content.
- **usage.ts** -- Token-optimized two-tier usage system with `DomainMeta` interface, `formatOverview()` for tier 1 (all domains), and `formatDomainUsage()` for tier 2 (domain detail). Generates USAGE.md via build pipeline.

## Generated Types (`src/gql/`)

Auto-generated by GraphQL Code Generator. **Do not edit these files manually.**

- **graphql.ts** -- All generated TypeScript types and `DocumentNode` exports.
- **gql.ts** -- Generated helper functions.
- **fragment-masking.ts** -- Fragment masking support.
- **index.ts** -- Barrel export.

## GraphQL Definitions (`graphql/`)

Source `.graphql` files that feed into code generation.

### Queries

- `queries/issues.graphql`
- `queries/documents.graphql`
- `queries/attachments.graphql`
- `queries/cycles.graphql`
- `queries/project-milestones.graphql`

### Mutations

- `mutations/issues.graphql`
- `mutations/documents.graphql`
- `mutations/attachments.graphql`
- `mutations/files.graphql`
- `mutations/project-milestones.graphql`

## Input Schemas (`schemas/`)

Hand-written JSON Schemas for the commands that take a JSON document instead of flags. Nothing reads them at runtime — they exist for callers (editors, validators, agents) and are shipped in the npm package via `files` in `package.json`.

- **issues-batch-create.schema.json** -- the `issues batch create` document (an array of issues to create).
- **issues-batch-update.schema.json** -- the `issues batch update` document (`issues` plus the one `patch` they share, where `null` clears a field).

Both are kept in step with their parsers in `src/commands/issues-batch.ts` (`parseBatchCreateEntries`, `parseBatchUpdateDocument`) by `tests/unit/commands/issues-batch-schema.test.ts`; extend both when adding a field.

## Tests (`tests/`)

Unit tests mirror the source structure. Resolver and service tests both mock the `GraphQLClient` (`request`); common tests require no mocks.

```
tests/unit/
  resolvers/   # e.g., team-resolver.test.ts
  services/    # e.g., issue-service.test.ts
  common/      # e.g., identifier.test.ts
```

## Configuration

- **package.json** -- Project metadata, dependencies, and scripts. Requires Node.js >= 22.
- **package-lock.json** -- Dependency lock file.
- **tsconfig.json** -- TypeScript settings (ES2023 target, strict mode, ES modules).
- **codegen.config.ts** -- GraphQL Code Generator configuration.
- **vitest.config.ts** -- Test runner configuration.


## Documentation (`docs/`)

- **architecture.md** -- Architecture overview and layer contracts
- **build-system.md** -- Build and compilation details
- **deployment.md** -- Deployment guide
- **development.md** -- Development patterns and workflows
- **files.md** -- This file
- **performance.md** -- Performance considerations
- **project-overview.md** -- High-level project summary
- **testing.md** -- Testing approach and conventions
- **Linear-API@current.graphql** -- Linear GraphQL API schema reference

## Data Flow

```
CLI Input --> Command --> Resolver --> Service --> JSON Output
                |            |            |
           createContext() GraphQL     GraphQL
                          (name->UUID)  (CRUD)
```

Resolvers convert human-friendly identifiers to UUIDs exactly once. Services operate solely on UUIDs. Commands tie the pieces together.
