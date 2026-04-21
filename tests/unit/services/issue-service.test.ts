// tests/unit/services/issue-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  ArchiveIssueDocument,
  DeleteIssueDocument,
  UnarchiveIssueDocument,
} from "../../../src/gql/graphql.js";
import {
  archiveIssue,
  deleteIssue,
  getIssue,
  getIssueByIdentifier,
  listIssues,
  searchIssues,
  unarchiveIssue,
} from "../../../src/services/issue-service.js";

function mockGqlClient(response: Record<string, unknown>) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listIssues", () => {
  it("returns issues from query", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [{ id: "1", title: "Test" }],
        pageInfo: { hasNextPage: false, endCursor: "cursor1" },
      },
    });
    const result = await listIssues(client, { limit: 10 });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("1");
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: "cursor1",
    });
  });

  it("returns empty result when no issues", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listIssues(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it("uses default limit of 25 when no options provided", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listIssues(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 25,
      after: undefined,
      orderBy: "updatedAt",
    });
  });

  it("passes after cursor to GraphQL request", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [{ id: "2", title: "Next" }],
        pageInfo: { hasNextPage: false, endCursor: "cursor2" },
      },
    });
    await listIssues(client, { limit: 5, after: "cursor1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 5,
      after: "cursor1",
      orderBy: "updatedAt",
    });
  });

  it("returns pageInfo with hasNextPage true", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [{ id: "1", title: "Test" }],
        pageInfo: { hasNextPage: true, endCursor: "nextCursor" },
      },
    });
    const result = await listIssues(client, { limit: 1 });
    expect(result.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "nextCursor",
    });
  });
});

describe("getIssue", () => {
  it("returns issue by UUID", async () => {
    const client = mockGqlClient({
      issue: { id: "550e8400-e29b-41d4-a716-446655440000", title: "Found" },
    });
    const result = await getIssue(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws when issue not found by UUID", async () => {
    const client = mockGqlClient({ issue: null });
    await expect(
      getIssue(client, "550e8400-e29b-41d4-a716-446655440000"),
    ).rejects.toThrow("not found");
  });
});

describe("getIssueByIdentifier", () => {
  it("returns issue by team key and number", async () => {
    const client = mockGqlClient({
      issues: { nodes: [{ id: "issue-1", title: "Found" }] },
    });
    const result = await getIssueByIdentifier(client, "ENG", 42);
    expect(result.id).toBe("issue-1");
  });

  it("throws when issue not found by identifier", async () => {
    const client = mockGqlClient({ issues: { nodes: [] } });
    await expect(getIssueByIdentifier(client, "ENG", 999)).rejects.toThrow(
      "not found",
    );
  });
});

describe("searchIssues", () => {
  it("returns search results", async () => {
    const client = mockGqlClient({
      searchIssues: {
        nodes: [{ id: "1", title: "Match" }],
        pageInfo: { hasNextPage: false, endCursor: "cursor1" },
      },
    });
    const result = await searchIssues(client, "test", { limit: 10 });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("1");
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: "cursor1",
    });
  });

  it("passes after cursor to GraphQL request", async () => {
    const client = mockGqlClient({
      searchIssues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await searchIssues(client, "query", { limit: 5, after: "prevCursor" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      term: "query",
      first: 5,
      after: "prevCursor",
    });
  });
});

describe("archiveIssue", () => {
  it("returns archived issue entity on success", async () => {
    const client = mockGqlClient({
      issueArchive: {
        success: true,
        entity: { id: "issue-1", identifier: "ENG-1", title: "Archived" },
      },
    });

    const result = await archiveIssue(client, "issue-1");

    expect(result.id).toBe("issue-1");
    expect(client.request).toHaveBeenCalledWith(ArchiveIssueDocument, {
      id: "issue-1",
    });
  });

  it("throws when archive fails", async () => {
    const client = mockGqlClient({
      issueArchive: { success: false, entity: null },
    });

    await expect(archiveIssue(client, "issue-1")).rejects.toThrow(
      'Failed to archive issue "issue-1"',
    );
  });
});

describe("unarchiveIssue", () => {
  it("returns unarchived issue entity on success", async () => {
    const client = mockGqlClient({
      issueUnarchive: {
        success: true,
        entity: { id: "issue-1", identifier: "ENG-1", title: "Restored" },
      },
    });

    const result = await unarchiveIssue(client, "issue-1");

    expect(result.id).toBe("issue-1");
    expect(client.request).toHaveBeenCalledWith(UnarchiveIssueDocument, {
      id: "issue-1",
    });
  });

  it("throws when unarchive fails", async () => {
    const client = mockGqlClient({
      issueUnarchive: { success: false, entity: null },
    });

    await expect(unarchiveIssue(client, "issue-1")).rejects.toThrow(
      'Failed to unarchive issue "issue-1"',
    );
  });
});

describe("deleteIssue", () => {
  it("returns normalized delete result on success", async () => {
    const client = mockGqlClient({
      issueDelete: { success: true, entity: { id: "issue-1" } },
    });

    await expect(deleteIssue(client, "issue-1")).resolves.toEqual({
      id: "issue-1",
      success: true,
    });

    expect(client.request).toHaveBeenCalledWith(DeleteIssueDocument, {
      id: "issue-1",
    });
  });

  it("throws when delete fails", async () => {
    const client = mockGqlClient({
      issueDelete: { success: false, entity: null },
    });

    await expect(deleteIssue(client, "issue-1")).rejects.toThrow(
      'Failed to delete issue "issue-1"',
    );
  });
});
