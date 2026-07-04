import { type DocumentNode, type FragmentDefinitionNode, Kind } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  ArchiveIssueDocument,
  DeleteIssueDocument,
  FilteredSearchIssuesDocument,
  GetIssueByIdDocument,
  GetIssueByIdentifierDocument,
  GetIssueByIdentifierWithAttachmentsDocument,
  GetIssueByIdentifierWithCommentsDocument,
  GetIssueByIdentifierWithReactionsDocument,
  GetIssueByIdWithAttachmentsDocument,
  GetIssueByIdWithCommentsDocument,
  GetIssueByIdWithReactionsDocument,
  GetIssuesDocument,
  SearchIssuesDocument,
  UnarchiveIssueDocument,
} from "../../../src/gql/graphql.js";
import {
  archiveIssue,
  createIssue,
  deleteIssue,
  getIssue,
  getIssueByIdentifier,
  getIssueByIdentifierWithAttachments,
  getIssueByIdentifierWithComments,
  getIssueByIdentifierWithCommentThreads,
  getIssueByIdentifierWithReactions,
  getIssueWithAttachments,
  getIssueWithComments,
  getIssueWithCommentThreads,
  getIssueWithReactions,
  listIssues,
  searchIssues,
  unarchiveIssue,
  updateIssue,
} from "../../../src/services/issue-service.js";

function mockGqlClient(response: Record<string, unknown>) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

function getFragment(
  document: DocumentNode,
  name: string,
): FragmentDefinitionNode {
  const fragment = document.definitions.find(
    (definition): definition is FragmentDefinitionNode =>
      definition.kind === Kind.FRAGMENT_DEFINITION &&
      definition.name.value === name,
  );

  if (!fragment) {
    throw new Error(`Fragment ${name} not found`);
  }

  return fragment;
}

describe("attachment issue read documents", () => {
  it("keep attachment reads on the default comment payload", () => {
    const documents = [
      GetIssueByIdWithAttachmentsDocument,
      GetIssueByIdentifierWithAttachmentsDocument,
    ];

    for (const document of documents) {
      const attachmentsFragment = getFragment(
        document,
        "CompleteIssueWithAttachmentsFields",
      );
      const attachmentsSelections = attachmentsFragment.selectionSet.selections
        .filter((selection) => selection.kind === Kind.FRAGMENT_SPREAD)
        .map((selection) => selection.name.value);

      expect(attachmentsSelections).toContain(
        "CompleteIssueWithDefaultCommentsFields",
      );
      expect(attachmentsSelections).not.toContain(
        "CompleteIssueWithCommentsFields",
      );
      expect(
        document.definitions.some(
          (definition) =>
            definition.kind === Kind.FRAGMENT_DEFINITION &&
            definition.name.value === "IssueReadCommentFields",
        ),
      ).toBe(false);

      const defaultCommentFragment = getFragment(
        document,
        "IssueReadDefaultCommentFields",
      );
      const defaultCommentSelections =
        defaultCommentFragment.selectionSet.selections
          .filter((selection) => selection.kind === Kind.FIELD)
          .map((selection) => selection.name.value);

      expect(defaultCommentSelections).toEqual(["id", "body"]);
    }
  });
});

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
    expect(result.nodes[0]?.id).toBe("1");
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
      orderBy: "updatedAt",
    });
  });

  it("does not prepend the non-completed filter when an explicit state filter is provided", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [{ id: "1", title: "Done issue" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const filter = {
      and: [
        { team: { id: { eq: "team-uuid" } } },
        { state: { id: { in: ["done-status-id"] } } },
      ],
    };

    await listIssues(client, { limit: 10 }, filter);

    expect(client.request).toHaveBeenCalledWith(FilteredSearchIssuesDocument, {
      first: 10,
      after: undefined,
      filter,
      orderBy: "updatedAt",
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
      orderBy: "updatedAt",
    });
  });
});

describe("getIssue", () => {
  it("returns issue by UUID with the default comment payload", async () => {
    const client = mockGqlClient({
      issue: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Found",
        comments: {
          nodes: [{ id: "comment-1", body: "First" }],
        },
      },
    });
    const result = await getIssue(
      client,
      asUuid("550e8400-e29b-41d4-a716-446655440000"),
    );
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.comments.nodes).toEqual([{ id: "comment-1", body: "First" }]);
    expect(client.request).toHaveBeenCalledWith(GetIssueByIdDocument, {
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("throws when issue not found by UUID", async () => {
    const client = mockGqlClient({ issue: null });
    await expect(
      getIssue(client, asUuid("550e8400-e29b-41d4-a716-446655440000")),
    ).rejects.toThrow("not found");
  });
});

describe("getIssueByIdentifier", () => {
  it("returns issue by team key and number with the default comment payload", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [
          {
            id: "issue-1",
            title: "Found",
            comments: {
              nodes: [{ id: "comment-1", body: "First" }],
            },
          },
        ],
      },
    });
    const result = await getIssueByIdentifier(client, "ENG", 42);
    expect(result.id).toBe("issue-1");
    expect(result.comments.nodes).toEqual([{ id: "comment-1", body: "First" }]);
    expect(client.request).toHaveBeenCalledWith(GetIssueByIdentifierDocument, {
      teamKey: "ENG",
      number: 42,
    });
  });

  it("throws when issue not found by identifier", async () => {
    const client = mockGqlClient({ issues: { nodes: [] } });
    await expect(getIssueByIdentifier(client, "ENG", 999)).rejects.toThrow(
      "not found",
    );
  });
});

describe("getIssueWithComments", () => {
  it("returns issue by UUID with full comment metadata", async () => {
    const client = mockGqlClient({
      issue: {
        id: "issue-1",
        title: "Found",
        comments: {
          nodes: [
            {
              id: "comment-1",
              body: "First",
              createdAt: "2026-04-23T12:00:00.000Z",
              editedAt: null,
              parentId: null,
              user: { id: "user-1", displayName: "Ada" },
            },
          ],
        },
      },
    });
    const result = await getIssueWithComments(client, asUuid("issue-1"));

    expect(result.comments.nodes[0]).toEqual({
      id: "comment-1",
      body: "First",
      createdAt: "2026-04-23T12:00:00.000Z",
      editedAt: null,
      parentId: null,
      user: { id: "user-1", displayName: "Ada" },
    });
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdWithCommentsDocument,
      {
        id: "issue-1",
      },
    );
  });
});

describe("getIssueByIdentifierWithComments", () => {
  it("returns issue by identifier with full comment metadata", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [
          {
            id: "issue-1",
            title: "Found",
            comments: {
              nodes: [
                {
                  id: "comment-1",
                  body: "First",
                  createdAt: "2026-04-23T12:00:00.000Z",
                  editedAt: null,
                  parentId: null,
                  user: { id: "user-1", displayName: "Ada" },
                },
              ],
            },
          },
        ],
      },
    });
    const result = await getIssueByIdentifierWithComments(client, "ENG", 42);

    expect(result.comments.nodes[0]?.user?.displayName).toBe("Ada");
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdentifierWithCommentsDocument,
      {
        teamKey: "ENG",
        number: 42,
      },
    );
  });
});

describe("getIssueWithCommentThreads", () => {
  it("groups comments into chronological threads for out-of-order inputs", async () => {
    const client = mockGqlClient({
      issue: {
        id: "issue-1",
        title: "Found",
        comments: {
          nodes: [
            {
              id: "comment-5",
              body: "Reply 2",
              createdAt: "2026-04-23T12:04:00.000Z",
              editedAt: null,
              parentId: "comment-1",
              user: { id: "user-5", displayName: "Eli" },
            },
            {
              id: "comment-3",
              body: "Root 2",
              createdAt: "2026-04-23T12:02:00.000Z",
              editedAt: null,
              parentId: null,
              user: { id: "user-3", displayName: "Cam" },
            },
            {
              id: "comment-1",
              body: "Root 1",
              createdAt: "2026-04-23T12:00:00.000Z",
              editedAt: null,
              parentId: null,
              user: { id: "user-1", displayName: "Ada" },
            },
            {
              id: "comment-2",
              body: "Reply 1",
              createdAt: "2026-04-23T12:01:00.000Z",
              editedAt: null,
              parentId: "comment-1",
              user: { id: "user-2", displayName: "Bea" },
            },
            {
              id: "comment-4",
              body: "Nested reply",
              createdAt: "2026-04-23T12:03:00.000Z",
              editedAt: null,
              parentId: "comment-2",
              user: { id: "user-4", displayName: "Dee" },
            },
          ],
        },
      },
    });

    const result = await getIssueWithCommentThreads(client, asUuid("issue-1"));

    expect(result.comments.nodes).toHaveLength(2);
    expect(result.comments.nodes[0]?.id).toBe("comment-1");
    expect(result.comments.nodes[0]?.replies.map((reply) => reply.id)).toEqual([
      "comment-2",
      "comment-5",
    ]);
    expect(
      result.comments.nodes[0]?.replies[0]?.replies.map((reply) => reply.id),
    ).toEqual(["comment-4"]);
    expect(result.comments.nodes[1]?.id).toBe("comment-3");
  });
});

describe("getIssueByIdentifierWithCommentThreads", () => {
  it("groups comments by identifier reads as well", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [
          {
            id: "issue-1",
            title: "Found",
            comments: {
              nodes: [
                {
                  id: "comment-1",
                  body: "Root 1",
                  createdAt: "2026-04-23T12:00:00.000Z",
                  editedAt: null,
                  parentId: null,
                  user: { id: "user-1", displayName: "Ada" },
                },
                {
                  id: "comment-2",
                  body: "Reply 1",
                  createdAt: "2026-04-23T12:01:00.000Z",
                  editedAt: null,
                  parentId: "comment-1",
                  user: { id: "user-2", displayName: "Bea" },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await getIssueByIdentifierWithCommentThreads(
      client,
      "ENG",
      42,
    );

    expect(result.comments.nodes[0]?.replies[0]?.id).toBe("comment-2");
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdentifierWithCommentsDocument,
      {
        teamKey: "ENG",
        number: 42,
      },
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
      teamId: asUuid("team-uuid"),
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
      createIssue(client, { title: "Fail", teamId: asUuid("team-uuid") }),
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
    const result = await updateIssue(client, asUuid("issue-id"), {
      estimate: 8,
    });
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
    const result = await updateIssue(client, asUuid("issue-id"), {
      estimate: null,
    });
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
      updateIssue(client, asUuid("issue-id"), { title: "Fail" }),
    ).rejects.toThrow("Failed to update issue");
  });
});

describe("getIssueWithReactions", () => {
  it("returns issue by UUID with normalized grouped reactions", async () => {
    const client = mockGqlClient({
      issue: {
        id: "issue-1",
        title: "Found",
        comments: { nodes: [{ id: "comment-1", body: "First" }] },
        reactions: [
          {
            id: "r-2",
            emoji: "👍",
            user: { id: "user-2", displayName: "Bob" },
            externalUser: null,
          },
          {
            id: "r-1",
            emoji: "👍",
            user: { id: "user-1", displayName: "Ada" },
            externalUser: null,
          },
          {
            id: "r-3",
            emoji: "🎉",
            user: null,
            externalUser: { id: "ext-1", name: "Zed" },
          },
        ],
      },
    });

    const result = await getIssueWithReactions(client, asUuid("issue-1"));

    expect(result.reactions).toEqual([
      {
        emoji: "👍",
        count: 2,
        users: [
          { id: "user-1", displayName: "Ada", type: "user" },
          { id: "user-2", displayName: "Bob", type: "user" },
        ],
        reactionIds: ["r-1", "r-2"],
      },
      {
        emoji: "🎉",
        count: 1,
        users: [{ id: "ext-1", displayName: "Zed", type: "external" }],
        reactionIds: ["r-3"],
      },
    ]);
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdWithReactionsDocument,
      { id: "issue-1" },
    );
  });

  it("throws when issue not found by UUID", async () => {
    const client = mockGqlClient({ issue: null });

    await expect(
      getIssueWithReactions(client, asUuid("missing")),
    ).rejects.toThrow('Issue with ID "missing" not found');
  });
});

describe("getIssueByIdentifierWithReactions", () => {
  it("returns issue by identifier with normalized grouped reactions", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [
          {
            id: "issue-1",
            title: "Found",
            comments: { nodes: [{ id: "comment-1", body: "First" }] },
            reactions: [
              {
                id: "r-2",
                emoji: "👍",
                user: { id: "user-2", displayName: "Bob" },
                externalUser: null,
              },
              {
                id: "r-1",
                emoji: "👍",
                user: { id: "user-1", displayName: "Ada" },
                externalUser: null,
              },
            ],
          },
        ],
      },
    });

    const result = await getIssueByIdentifierWithReactions(client, "ENG", 42);

    expect(result.reactions).toEqual([
      {
        emoji: "👍",
        count: 2,
        users: [
          { id: "user-1", displayName: "Ada", type: "user" },
          { id: "user-2", displayName: "Bob", type: "user" },
        ],
        reactionIds: ["r-1", "r-2"],
      },
    ]);
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdentifierWithReactionsDocument,
      {
        teamKey: "ENG",
        number: 42,
      },
    );
  });

  it("throws when issue not found by identifier", async () => {
    const client = mockGqlClient({ issues: { nodes: [] } });

    await expect(
      getIssueByIdentifierWithReactions(client, "ENG", 999),
    ).rejects.toThrow('Issue with identifier "ENG-999" not found');
  });
});

describe("getIssueWithAttachments", () => {
  it("returns issue with attachments by UUID", async () => {
    const client = mockGqlClient({
      issue: {
        id: "issue-1",
        title: "Found",
        attachments: {
          nodes: [{ id: "att-1", title: "PR #42", sourceType: "github" }],
        },
      },
    });
    const result = await getIssueWithAttachments(client, asUuid("issue-1"));
    expect(result.id).toBe("issue-1");
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdWithAttachmentsDocument,
      { id: "issue-1" },
    );
  });

  it("throws when issue not found", async () => {
    const client = mockGqlClient({ issue: null });
    await expect(
      getIssueWithAttachments(client, asUuid("missing")),
    ).rejects.toThrow("not found");
  });
});

describe("getIssueByIdentifierWithAttachments", () => {
  it("returns issue with attachments by identifier", async () => {
    const client = mockGqlClient({
      issues: {
        nodes: [
          {
            id: "issue-1",
            title: "Found",
            attachments: {
              nodes: [{ id: "att-1", title: "PR #42" }],
            },
          },
        ],
      },
    });
    const result = await getIssueByIdentifierWithAttachments(client, "ENG", 42);
    expect(result.id).toBe("issue-1");
    expect(client.request).toHaveBeenCalledWith(
      GetIssueByIdentifierWithAttachmentsDocument,
      { teamKey: "ENG", number: 42 },
    );
  });

  it("throws when issue not found", async () => {
    const client = mockGqlClient({ issues: { nodes: [] } });
    await expect(
      getIssueByIdentifierWithAttachments(client, "ENG", 999),
    ).rejects.toThrow("not found");
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
    expect(result.nodes[0]?.id).toBe("1");
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

describe("archiveIssue", () => {
  it("returns archived issue entity on success", async () => {
    const client = mockGqlClient({
      issueArchive: {
        success: true,
        entity: { id: "issue-1", identifier: "ENG-1", title: "Archived" },
      },
    });

    const result = await archiveIssue(client, asUuid("issue-1"));

    expect(result.id).toBe("issue-1");
    expect(client.request).toHaveBeenCalledWith(ArchiveIssueDocument, {
      id: "issue-1",
    });
  });

  it("throws when archive fails", async () => {
    const client = mockGqlClient({
      issueArchive: { success: false, entity: null },
    });

    await expect(archiveIssue(client, asUuid("issue-1"))).rejects.toThrow(
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

    const result = await unarchiveIssue(client, asUuid("issue-1"));

    expect(result.id).toBe("issue-1");
    expect(client.request).toHaveBeenCalledWith(UnarchiveIssueDocument, {
      id: "issue-1",
    });
  });

  it("throws when unarchive fails", async () => {
    const client = mockGqlClient({
      issueUnarchive: { success: false, entity: null },
    });

    await expect(unarchiveIssue(client, asUuid("issue-1"))).rejects.toThrow(
      'Failed to unarchive issue "issue-1"',
    );
  });
});

describe("deleteIssue", () => {
  it("returns normalized delete result on success", async () => {
    const client = mockGqlClient({
      issueDelete: { success: true, entity: { id: "issue-1" } },
    });

    await expect(deleteIssue(client, asUuid("issue-1"))).resolves.toEqual({
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

    await expect(deleteIssue(client, asUuid("issue-1"))).rejects.toThrow(
      'Failed to delete issue "issue-1"',
    );
  });
});
