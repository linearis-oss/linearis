import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  FilteredSearchIssuesDocument,
  GetIssuesDocument,
  PaginationOrderBy,
  SearchIssuesDocument,
} from "../../../src/gql/graphql.js";
import {
  createIssue,
  getIssue,
  getIssueByIdentifier,
  listIssues,
  searchIssues,
  updateIssue,
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
      orderBy: PaginationOrderBy.UpdatedAt,
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
      orderBy: PaginationOrderBy.UpdatedAt,
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

  it("passes filter to FilteredSearchIssues when filter provided", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [{ id: "1", title: "Filtered" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const filter = { team: { id: { eq: "team-uuid" } } };
    const result = await listIssues(client, { limit: 10 }, filter);
    expect(result.nodes).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith(FilteredSearchIssuesDocument, {
      first: 10,
      after: undefined,
      filter: {
        and: [
          { state: { type: { neq: "completed" } } },
          { team: { id: { eq: "team-uuid" } } },
        ],
      },
      orderBy: PaginationOrderBy.UpdatedAt,
    });
  });

  it("uses GetIssues query when no filter provided (no regression)", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listIssues(client);
    expect(client.request).toHaveBeenCalledWith(GetIssuesDocument, {
      first: 25,
      after: undefined,
      orderBy: PaginationOrderBy.UpdatedAt,
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

describe("createIssue", () => {
  it("creates issue and returns result", async () => {
    const client = mockGqlClient({
      issueCreate: {
        success: true,
        issue: { id: "new-id", identifier: "ENG-1", title: "New", estimate: 5 },
      },
    });
    const result = await createIssue(client, {
      title: "New",
      teamId: "team-uuid",
      estimate: 5,
    });
    expect(result.id).toBe("new-id");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      input: { title: "New", teamId: "team-uuid", estimate: 5 },
    });
  });

  it("throws when creation fails", async () => {
    const client = mockGqlClient({
      issueCreate: { success: false, issue: null },
    });
    await expect(
      createIssue(client, { title: "Fail", teamId: "team-uuid" }),
    ).rejects.toThrow("Failed to create issue");
  });
});

describe("updateIssue", () => {
  it("updates issue and returns result", async () => {
    const client = mockGqlClient({
      issueUpdate: {
        success: true,
        issue: {
          id: "issue-id",
          identifier: "ENG-1",
          title: "Updated",
          estimate: 8,
        },
      },
    });
    const result = await updateIssue(client, "issue-id", { estimate: 8 });
    expect(result.id).toBe("issue-id");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "issue-id",
      input: { estimate: 8 },
    });
  });

  it("clears estimate with null", async () => {
    const client = mockGqlClient({
      issueUpdate: {
        success: true,
        issue: { id: "issue-id", identifier: "ENG-1", title: "Cleared" },
      },
    });
    const result = await updateIssue(client, "issue-id", { estimate: null });
    expect(result.id).toBe("issue-id");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "issue-id",
      input: { estimate: null },
    });
  });

  it("throws when update fails", async () => {
    const client = mockGqlClient({
      issueUpdate: { success: false, issue: null },
    });
    await expect(
      updateIssue(client, "issue-id", { title: "Fail" }),
    ).rejects.toThrow("Failed to update issue");
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

  it("passes filter to SearchIssues query when filter provided", async () => {
    const client = mockGqlClient({
      searchIssues: {
        nodes: [{ id: "1", title: "Match" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const filter = { priority: { eq: 1 } };
    const result = await searchIssues(client, "bug", { limit: 10 }, filter);
    expect(result.nodes).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith(SearchIssuesDocument, {
      term: "bug",
      first: 10,
      after: undefined,
      filter,
    });
  });

  it("omits filter when not provided (no regression)", async () => {
    const client = mockGqlClient({
      searchIssues: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await searchIssues(client, "test");
    expect(client.request).toHaveBeenCalledWith(SearchIssuesDocument, {
      term: "test",
      first: 25,
      after: undefined,
    });
  });
});
