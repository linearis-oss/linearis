import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  createReactionForComment,
  createReactionForIssue,
  deleteOwnReactionByEmoji,
  deleteOwnReactionById,
  normalizeReactions,
} from "../../../src/services/reaction-service.js";

function createClient(): GraphQLClient {
  return { request: vi.fn() } as unknown as GraphQLClient;
}

describe("createReactionForIssue", () => {
  it("creates a reaction when the viewer has not used that emoji yet", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        issue: {
          id: "issue-1",
          reactions: [
            {
              id: "r-1",
              emoji: "🎉",
              user: { id: "user-2", displayName: "Bob" },
              externalUser: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        reactionCreate: {
          success: true,
          reaction: {
            id: "r-2",
            emoji: "👍",
            user: { id: "user-1", displayName: "Ada" },
            externalUser: null,
          },
        },
      });

    await expect(
      createReactionForIssue(client, {
        issueId: asUuid("issue-1"),
        emoji: "👍",
      }),
    ).resolves.toEqual({
      id: "r-2",
      emoji: "👍",
      user: { id: "user-1", displayName: "Ada" },
      externalUser: null,
    });
    expect(client.request).toHaveBeenNthCalledWith(3, expect.anything(), {
      input: { issueId: "issue-1", emoji: "👍" },
    });
  });

  it("rejects duplicate viewer reaction before mutation", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        issue: {
          id: "issue-1",
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      });

    await expect(
      createReactionForIssue(client, {
        issueId: asUuid("issue-1"),
        emoji: "👍",
      }),
    ).rejects.toThrow("Already reacted with emoji 👍");
  });

  it("normalizes emoji before duplicate viewer reaction checks", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        issue: {
          id: "issue-1",
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      });

    await expect(
      createReactionForIssue(client, {
        issueId: asUuid("issue-1"),
        emoji: "  👍  ",
      }),
    ).rejects.toThrow("Already reacted with emoji 👍");
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when the issue target does not exist", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({ issue: null });

    await expect(
      createReactionForIssue(client, {
        issueId: asUuid("issue-missing"),
        emoji: "👍",
      }),
    ).rejects.toThrow('Issue with ID "issue-missing" not found');
  });
});

describe("createReactionForComment", () => {
  it("creates a reaction for a comment when the viewer has not used that emoji yet", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        comment: {
          id: "comment-1",
          parentId: null,
          reactions: [
            {
              id: "r-1",
              emoji: "👀",
              user: { id: "user-2", displayName: "Bob" },
              externalUser: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        reactionCreate: {
          success: true,
          reaction: {
            id: "r-2",
            emoji: "👍",
            user: { id: "user-1", displayName: "Ada" },
            externalUser: null,
          },
        },
      });

    await expect(
      createReactionForComment(client, {
        commentId: asUuid("comment-1"),
        emoji: "👍",
      }),
    ).resolves.toEqual({
      id: "r-2",
      emoji: "👍",
      user: { id: "user-1", displayName: "Ada" },
      externalUser: null,
    });
  });

  it("fails clearly when the comment target does not exist", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({ comment: null });

    await expect(
      createReactionForComment(client, {
        commentId: asUuid("comment-missing"),
        emoji: "👍",
      }),
    ).rejects.toThrow('Discussion comment ID "comment-missing" not found');
  });
});

describe("deleteOwnReactionByEmoji", () => {
  it("deletes viewer-owned matching reaction", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        comment: {
          id: "comment-1",
          parentId: null,
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        reactionDelete: { success: true, entityId: "r-1" },
      });

    await expect(
      deleteOwnReactionByEmoji(client, {
        kind: "comment",
        id: asUuid("comment-1"),
        emoji: "👍",
      }),
    ).resolves.toEqual({ id: "r-1", success: true });
  });

  it("normalizes emoji before matching viewer-owned reactions", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        comment: {
          id: "comment-1",
          parentId: null,
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        reactionDelete: { success: true, entityId: "r-1" },
      });

    await expect(
      deleteOwnReactionByEmoji(client, {
        kind: "comment",
        id: asUuid("comment-1"),
        emoji: "  👍  ",
      }),
    ).resolves.toEqual({ id: "r-1", success: true });
  });

  it("fails when the viewer has no matching reaction for the emoji", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        comment: {
          id: "comment-1",
          parentId: null,
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-2", displayName: "Bob" },
              externalUser: null,
            },
          ],
        },
      });

    await expect(
      deleteOwnReactionByEmoji(client, {
        kind: "comment",
        id: asUuid("comment-1"),
        emoji: "👍",
      }),
    ).rejects.toThrow("No own reaction found with emoji 👍");
  });

  it("fails when the viewer has multiple matching reactions for the emoji", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        comment: {
          id: "comment-1",
          parentId: null,
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
            {
              id: "r-2",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      });

    await expect(
      deleteOwnReactionByEmoji(client, {
        kind: "comment",
        id: asUuid("comment-1"),
        emoji: "👍",
      }),
    ).rejects.toThrow("Multiple own reactions found with emoji 👍");
  });
});

describe("deleteOwnReactionById", () => {
  it("deletes a viewer-owned reaction by id", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        issue: {
          id: "issue-1",
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        reactionDelete: { success: true, entityId: "r-1" },
      });

    await expect(
      deleteOwnReactionById(client, {
        kind: "issue",
        id: asUuid("issue-1"),
        reactionId: asUuid("r-1"),
      }),
    ).resolves.toEqual({ id: "r-1", success: true });
  });

  it("fails when the reaction id does not exist on the target", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        issue: {
          id: "issue-1",
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-1", displayName: "Ada" },
              externalUser: null,
            },
          ],
        },
      });

    await expect(
      deleteOwnReactionById(client, {
        kind: "issue",
        id: asUuid("issue-1"),
        reactionId: asUuid("missing-reaction"),
      }),
    ).rejects.toThrow('Reaction "missing-reaction" not found');
  });

  it("fails when the reaction is not owned by the viewer", async () => {
    const client = createClient();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        viewer: { id: "user-1", name: "Ada", email: "ada@example.com" },
      })
      .mockResolvedValueOnce({
        issue: {
          id: "issue-1",
          reactions: [
            {
              id: "r-1",
              emoji: "👍",
              user: { id: "user-2", displayName: "Bob" },
              externalUser: null,
            },
          ],
        },
      });

    await expect(
      deleteOwnReactionById(client, {
        kind: "issue",
        id: asUuid("issue-1"),
        reactionId: asUuid("r-1"),
      }),
    ).rejects.toThrow('Reaction "r-1" is not owned by viewer');
  });
});

describe("normalizeReactions", () => {
  it("groups and sorts workspace and external users deterministically", () => {
    const result = normalizeReactions([
      {
        id: "r-2",
        emoji: "👍",
        user: { id: "u-2", displayName: "Bob" },
        externalUser: null,
      },
      {
        id: "r-1",
        emoji: "👍",
        user: { id: "u-1", displayName: "Ada" },
        externalUser: null,
      },
      {
        id: "r-3",
        emoji: "🎉",
        user: null,
        externalUser: { id: "x-1", name: "CI Bot" },
      },
    ]);

    expect(result).toEqual([
      {
        emoji: "👍",
        count: 2,
        users: [
          { id: "u-1", displayName: "Ada", type: "user" },
          { id: "u-2", displayName: "Bob", type: "user" },
        ],
        reactionIds: ["r-1", "r-2"],
      },
      {
        emoji: "🎉",
        count: 1,
        users: [{ id: "x-1", displayName: "CI Bot", type: "external" }],
        reactionIds: ["r-3"],
      },
    ]);
  });
});
