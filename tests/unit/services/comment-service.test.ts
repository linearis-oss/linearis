// tests/unit/services/comment-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { createComment } from "../../../src/services/comment-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("createComment", () => {
  it("creates comment successfully", async () => {
    const client = mockGqlClient({
      commentCreate: {
        success: true,
        comment: {
          id: "comment-1",
          body: "This is a comment",
          createdAt: "2025-01-15T10:00:00.000Z",
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
