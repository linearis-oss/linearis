import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createComment,
  deleteComment,
  listComments,
  replyToComment,
  updateComment,
} from "../../../src/services/comment-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

const MOCK_USER = { id: "user-1", displayName: "Test User" };

describe("createComment", () => {
  it("creates comment successfully", async () => {
    const client = mockGqlClient({
      commentCreate: {
        success: true,
        comment: {
          id: "comment-1",
          body: "This is a comment",
          createdAt: "2025-01-15T10:00:00.000Z",
          editedAt: null,
          parentId: null,
          user: MOCK_USER,
        },
      },
    });

    const result = await createComment(client, {
      issueId: "issue-1",
      body: "This is a comment",
    });

    expect(result).toEqual({
      id: "comment-1",
      body: "This is a comment",
      createdAt: "2025-01-15T10:00:00.000Z",
      editedAt: null,
      parentId: null,
      user: MOCK_USER,
    });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      input: { issueId: "issue-1", body: "This is a comment" },
    });
  });

  it("throws when creation fails", async () => {
    const client = mockGqlClient({
      commentCreate: {
        success: false,
        comment: null,
      },
    });

    await expect(
      createComment(client, { issueId: "issue-1", body: "test" }),
    ).rejects.toThrow("Failed to create comment");
  });

  it("throws when comment is null despite success", async () => {
    const client = mockGqlClient({
      commentCreate: {
        success: true,
        comment: null,
      },
    });

    await expect(
      createComment(client, { issueId: "issue-1", body: "test" }),
    ).rejects.toThrow("Failed to create comment");
  });
});

describe("listComments", () => {
  it("returns paginated comments with all fields", async () => {
    const client = mockGqlClient({
      issue: {
        comments: {
          nodes: [
            {
              id: "comment-1",
              body: "First comment",
              createdAt: "2025-01-15T10:00:00.000Z",
              editedAt: null,
              parentId: null,
              user: MOCK_USER,
            },
            {
              id: "comment-2",
              body: "Reply to first",
              createdAt: "2025-01-15T11:00:00.000Z",
              editedAt: "2025-01-15T12:00:00.000Z",
              parentId: "comment-1",
              user: MOCK_USER,
            },
          ],
          pageInfo: {
            hasNextPage: true,
            endCursor: "cursor-abc",
          },
        },
      },
    });

    const result = await listComments(client, "issue-1");

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toEqual({
      id: "comment-1",
      body: "First comment",
      createdAt: "2025-01-15T10:00:00.000Z",
      editedAt: null,
      parentId: null,
      user: MOCK_USER,
    });
    expect(result.nodes[1]?.parentId).toBe("comment-1");
    expect(result.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "cursor-abc",
    });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      issueId: "issue-1",
      first: 25,
      after: undefined,
    });
  });

  it("returns empty nodes when issue has no comments", async () => {
    const client = mockGqlClient({
      issue: {
        comments: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const result = await listComments(client, "issue-1");

    expect(result.nodes).toEqual([]);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it("throws when issue does not exist", async () => {
    const client = mockGqlClient({ issue: null });

    await expect(listComments(client, "nonexistent-id")).rejects.toThrow(
      'Issue with ID "nonexistent-id" not found',
    );
  });

  it("passes pagination options to request", async () => {
    const client = mockGqlClient({
      issue: {
        comments: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    await listComments(client, "issue-1", { limit: 10, after: "cursor-xyz" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      issueId: "issue-1",
      first: 10,
      after: "cursor-xyz",
    });
  });
});

describe("replyToComment", () => {
  it("creates a reply with parentId", async () => {
    const client = mockGqlClient({
      commentCreate: {
        success: true,
        comment: {
          id: "reply-1",
          body: "This is a reply",
          createdAt: "2025-01-15T12:00:00.000Z",
          editedAt: null,
          parentId: "comment-1",
          user: MOCK_USER,
        },
      },
    });

    const result = await replyToComment(client, {
      parentId: "comment-1",
      body: "This is a reply",
    });

    expect(result).toEqual({
      id: "reply-1",
      body: "This is a reply",
      createdAt: "2025-01-15T12:00:00.000Z",
      editedAt: null,
      parentId: "comment-1",
      user: MOCK_USER,
    });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      input: { parentId: "comment-1", body: "This is a reply" },
    });
  });

  it("throws when reply creation fails", async () => {
    const client = mockGqlClient({
      commentCreate: {
        success: false,
        comment: null,
      },
    });

    await expect(
      replyToComment(client, { parentId: "comment-1", body: "reply" }),
    ).rejects.toThrow("Failed to create reply");
  });
});

describe("updateComment", () => {
  it("returns updated comment with new body", async () => {
    const client = mockGqlClient({
      commentUpdate: {
        success: true,
        comment: {
          id: "comment-1",
          body: "Updated body",
          createdAt: "2025-01-15T10:00:00.000Z",
          editedAt: "2025-01-15T14:00:00.000Z",
          parentId: null,
          user: MOCK_USER,
        },
      },
    });

    const result = await updateComment(client, "comment-1", {
      body: "Updated body",
    });

    expect(result).toEqual({
      id: "comment-1",
      body: "Updated body",
      createdAt: "2025-01-15T10:00:00.000Z",
      editedAt: "2025-01-15T14:00:00.000Z",
      parentId: null,
      user: MOCK_USER,
    });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "comment-1",
      input: { body: "Updated body" },
    });
  });

  it("throws when update fails", async () => {
    const client = mockGqlClient({
      commentUpdate: {
        success: false,
        comment: null,
      },
    });

    await expect(
      updateComment(client, "comment-1", { body: "new" }),
    ).rejects.toThrow("Failed to update comment");
  });
});

describe("deleteComment", () => {
  it("returns id and success on deletion", async () => {
    const client = mockGqlClient({
      commentDelete: {
        success: true,
        entityId: "comment-1",
      },
    });

    const result = await deleteComment(client, "comment-1");

    expect(result).toEqual({ id: "comment-1", success: true });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "comment-1",
    });
  });

  it("throws when deletion fails", async () => {
    const client = mockGqlClient({
      commentDelete: {
        success: false,
        entityId: "comment-1",
      },
    });

    await expect(deleteComment(client, "comment-1")).rejects.toThrow(
      "Failed to delete comment",
    );
  });
});
