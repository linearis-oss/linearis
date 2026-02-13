# Testing

Linearis uses [Vitest](https://vitest.dev/) for unit and integration tests. Tests enforce the layered architecture by mocking one layer deep, keeping each layer testable in isolation.

## Running Tests

```bash
npm test                # Run all tests once
npm run test:watch      # Watch mode (re-runs on changes)
npm run test:ui         # Interactive UI
npm run test:coverage   # Generate coverage report
npm run test:commands   # CLI command coverage report
```

Run a specific file or suite:

```bash
npx vitest run tests/unit/resolvers
npx vitest run tests/unit/services/issue-service.test.ts
npx vitest run -t "should resolve team by key"
```

## Test Structure

```
tests/
  unit/
    client/
      graphql-client.test.ts
    resolvers/
      team-resolver.test.ts
      project-resolver.test.ts
      issue-resolver.test.ts
      label-resolver.test.ts
      cycle-resolver.test.ts
      status-resolver.test.ts
      milestone-resolver.test.ts
    services/
      issue-service.test.ts
      document-service.test.ts
      attachment-service.test.ts
    common/
      identifier.test.ts
      errors.test.ts
      output.test.ts
  integration/
    cycles-cli.test.ts
    documents-cli.test.ts
    issues-cli.test.ts
    project-milestones-cli.test.ts
    teams-cli.test.ts
    users-cli.test.ts
  command-coverage.ts
```

The test directory mirrors `src/`. Each layer has its own mock strategy described below.

## Mock Patterns

Each architectural layer uses a different mock target. The rule is simple: mock the dependency one layer down.

### Resolver Tests

Resolvers depend on `LinearSdkClient`. Mock the SDK methods it calls:

```typescript
import type { LinearSdkClient } from "../../src/client/linear-client.js";

const mockSdk = {
  teams: vi.fn().mockResolvedValue({
    nodes: [{ id: "uuid-123", key: "ABC" }],
  }),
};
const client = { sdk: mockSdk } as unknown as LinearSdkClient;
```

### Service Tests

Services depend on `GraphQLClient`. Mock the `request` method:

```typescript
import type { GraphQLClient } from "../../src/client/graphql-client.js";

const mockRequest = vi.fn().mockResolvedValue({
  issues: { nodes: [{ id: "123", title: "Bug" }] },
});
const client = { request: mockRequest } as unknown as GraphQLClient;
```

### Common Tests

Functions in `common/` are pure and need no mocks:

```typescript
import { isUuid } from "../../src/common/identifier.js";

expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
expect(isUuid("ABC-123")).toBe(false);
```

### Client Tests

Client tests mock the underlying network layer:

```typescript
const mockClient = { rawRequest: vi.fn() };
```

## Writing a New Test

1. Create a test file in the directory matching the source file's layer (`tests/unit/resolvers/`, `tests/unit/services/`, etc.).
2. Mock the client type that the layer depends on (see patterns above).
3. Cover at least the happy path and the primary error case (e.g., entity not found).

Example resolver test:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";

describe("resolveTeamId", () => {
  it("should return UUID as-is", async () => {
    const client = { sdk: {} } as unknown as LinearSdkClient;
    const result = await resolveTeamId(client, "550e8400-e29b-41d4-a716-446655440000");
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should resolve team by key", async () => {
    const mockSdk = {
      teams: vi.fn().mockResolvedValue({
        nodes: [{ id: "uuid-456", key: "ENG" }],
      }),
    };
    const client = { sdk: mockSdk } as unknown as LinearSdkClient;

    const result = await resolveTeamId(client, "ENG");
    expect(result).toBe("uuid-456");
  });

  it("should throw when team is not found", async () => {
    const mockSdk = {
      teams: vi.fn().mockResolvedValue({ nodes: [] }),
    };
    const client = { sdk: mockSdk } as unknown as LinearSdkClient;

    await expect(resolveTeamId(client, "NOPE")).rejects.toThrow();
  });
});
```

## Coverage

Generate an HTML coverage report:

```bash
npm run test:coverage
open coverage/index.html
```

Code coverage tracks unit tests only. Integration tests run the CLI in a subprocess and are not captured in coverage reports.

The command coverage report (`npm run test:commands`) shows which CLI commands have integration test coverage and which ones still need it.

## Integration Tests

Integration tests execute the compiled CLI binary and validate its JSON output. They require a real Linear API token.

### Setup

```bash
export LINEAR_API_TOKEN="lin_api_..."
npm run build
npx vitest run tests/integration
```

If `LINEAR_API_TOKEN` is not set, integration tests are automatically skipped.

### Example

```typescript
import { describe, expect, it } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const hasApiToken = !!process.env.LINEAR_API_TOKEN;

describe("Cycles CLI", () => {
  it.skipIf(!hasApiToken)("should list cycles as JSON", async () => {
    const { stdout } = await execAsync("node ./dist/main.js cycles list");
    const cycles = JSON.parse(stdout);
    expect(Array.isArray(cycles)).toBe(true);
  });
});
```

## CI

GitHub Actions runs on every push and pull request:

1. Install dependencies
2. Build the project
3. Run all unit tests
4. Run integration tests (only if the `LINEAR_API_TOKEN` secret is configured in the repository)

To enable integration tests in CI, add `LINEAR_API_TOKEN` under Repository Settings > Secrets and variables > Actions.

## Troubleshooting

**Tests fail with "Cannot find module"** -- Run `npm run build` to compile the project. Integration tests need the compiled output in `dist/`.

**Integration tests are skipped** -- Set `LINEAR_API_TOKEN` in your environment.

**Tests time out** -- Integration tests default to a 30-second timeout. Check your network connection and API token validity. You can increase the timeout for a specific test:

```typescript
it("slow operation", async () => {
  // ...
}, { timeout: 60000 });
```

**Type errors in test imports** -- Use `.js` extensions in import paths, matching the ES module convention used throughout the project.
