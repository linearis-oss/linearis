# Performance Optimizations

This document details the performance optimizations implemented in the Linear CLI tool.

## The N+1 Query Problem

The initial implementation used the Linear SDK's lazy-loading model, which suffered from a classic N+1 query problem:

1. **1 query** to fetch the issues list
2. **N additional queries** per issue for related data:
   - 1 query for state
   - 1 query for team
   - 1 query for assignee
   - 1 query for project
   - 1 query for labels

For 10 issues, this resulted in 1 + (10 x 5) = **51 API calls**, taking 10+ seconds.

## Solution: Direct GraphQL with Typed Codegen

All data-fetching operations now use single, comprehensive GraphQL queries executed through `GraphQLClient.request<T>()`. Query definitions live in `.graphql` files and are processed by codegen into typed `DocumentNode` exports and result types.

### Before: SDK Lazy Loading (Slow)

```typescript
// N+1 pattern -- each property access triggers a separate API call
const issues = await client.sdk.issues({ first: 10 });
for (const issue of issues.nodes) {
  const state = await issue.state;
  const team = await issue.team;
  const assignee = await issue.assignee;
  const project = await issue.project;
  const labels = await issue.labels();
}
```

### After: Single GraphQL Query (Fast)

```typescript
// One query fetches issues with all relationships included
const result = await client.request<GetIssuesQuery>(GetIssuesDocument, {
  first: limit,
  orderBy: "updatedAt",
});
// result.issues.nodes already contains state, team, assignee, project, labels
```

### Batch ID Resolution

Operations that need to resolve multiple human-friendly identifiers (team keys, project names, label names) into UUIDs do so in a single batch query rather than issuing separate lookups.

**Before** (sequential resolution):

```typescript
const team = await resolveTeamByName(teamName);       // 1 API call
const project = await resolveProjectByName(projName);  // 1 API call
const labels = await Promise.all(                      // N API calls
  labelNames.map(name => resolveLabelByName(name))
);
const issue = await createIssue({ ... });              // 1 API call
```

**After** (batch resolution in a single query):

```typescript
const resolved = await client.request<BatchResolveForCreateQuery>(
  BatchResolveForCreateDocument,
  { teamKey, projectName, labelNames },
);
// All IDs resolved -- proceed with creation
const issue = await createIssue(client, { ...resolvedInput });
```

This reduces issue creation from 7+ API calls down to 2.

## Fragment Reuse

GraphQL fragments defined in `graphql/queries/*.graphql` ensure consistent, complete data fetching across operations. For example, `CompleteIssueFields` is shared by list, read, and search queries:

```graphql
# graphql/queries/issues.graphql

fragment CompleteIssueFields on Issue {
  id
  identifier
  title
  description
  priority
  estimate
  createdAt
  updatedAt
  state { id name }
  assignee { id name }
  team { id key name }
  project { id name }
  labels { nodes { id name } }
  cycle { id name number }
  parent { id identifier title }
  children { nodes { id identifier title } }
}

query GetIssues($first: Int!, $orderBy: PaginationOrderBy) {
  issues(first: $first, orderBy: $orderBy, ...) {
    nodes { ...CompleteIssueFields }
  }
}
```

All services import typed `DocumentNode` and result types from codegen output, so queries are never written as raw strings.

## Benchmarks

All benchmarks performed against the real Linear API:

| Operation         | Before (SDK) | After (GraphQL) | Improvement     |
| ----------------- | ------------ | --------------- | --------------- |
| Single issue read | ~10+ seconds | ~0.9-1.1 seconds | 90%+ faster |
| List 10 issues    | ~30+ seconds | ~0.9 seconds     | 95%+ faster |
| Create issue      | ~2-3 seconds | ~1.1 seconds     | 50%+ faster |
| Search issues     | ~15+ seconds | ~1.0 seconds     | 93%+ faster |

### Test Commands

```bash
time npm start issues read ABC-123
time npm start issues list -l 10
time npm start issues create --title "Test" --team ABC
time npm start issues search "test" --team ABC
```

### Example Timing

```
npm start issues list -l 1 < /dev/null  0.62s user 0.08s system 77% cpu 0.904 total
```

Total wall time: 0.904 seconds (including npm overhead and Node.js startup).

## Code Locations

- `src/client/graphql-client.ts` -- GraphQL client wrapper with typed `request<T>()` method
- `src/services/issue-service.ts` -- Issue CRUD and search operations
- `src/services/` -- Other domain services (documents, attachments, cycles, etc.)
- `graphql/queries/*.graphql` -- Query and fragment definitions
- `graphql/mutations/*.graphql` -- Mutation definitions
- `src/gql/graphql.ts` -- Codegen output (generated, do not edit)
- `src/commands/issues.ts` -- CLI command orchestration

## Key Principles

1. **Single GraphQL queries** -- Replace N+1 SDK patterns with comprehensive queries that fetch all relationships in one round trip.
2. **Batch ID resolution** -- Resolve multiple identifiers in a single query before performing mutations.
3. **Fragment reuse** -- Shared `.graphql` fragments keep field selections consistent and reduce duplication.
4. **Typed operations** -- All queries use codegen `DocumentNode` exports and typed results (`client.request<GetIssuesQuery>(GetIssuesDocument, ...)`), catching schema mismatches at compile time.

## Monitoring

```bash
# Time any command
time linearis <command>

# Examples
time linearis issues list -l 25
time linearis issues search "bug" --team ABC
```

## Future Considerations

- **Local caching** for frequently accessed reference data (teams, users, labels)
- **Pagination streaming** for large result sets
- **Connection pooling** for HTTP connections to the Linear API
