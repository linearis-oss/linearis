// tests/unit/services/issue-service.test.ts
import { describe, it, expect, vi } from "vitest";
import { listIssues, getIssue, searchIssues } from "../../../src/services/issue-service.js";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";

function mockGqlClient(response: Record<string, unknown>) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listIssues", () => {
  it("returns issues from query", async () => {
    const client = mockGqlClient({
      issues: { nodes: [{ id: "1", title: "Test" }] },
    });
    const result = await listIssues(client, 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty array when no issues", async () => {
    const client = mockGqlClient({ issues: { nodes: [] } });
    const result = await listIssues(client);
    expect(result).toEqual([]);
  });
});

describe("getIssue", () => {
  it("returns issue by UUID", async () => {
    const client = mockGqlClient({
      issue: { id: "550e8400-e29b-41d4-a716-446655440000", title: "Found" },
    });
    const result = await getIssue(client, "550e8400-e29b-41d4-a716-446655440000");
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws when issue not found by UUID", async () => {
    const client = mockGqlClient({ issue: null });
    await expect(getIssue(client, "550e8400-e29b-41d4-a716-446655440000")).rejects.toThrow("not found");
  });
});

describe("searchIssues", () => {
  it("returns search results", async () => {
    const client = mockGqlClient({
      searchIssues: { nodes: [{ id: "1", title: "Match" }] },
    });
    const result = await searchIssues(client, "test", 10);
    expect(result).toHaveLength(1);
  });
});
