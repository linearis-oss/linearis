import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  GetDiscussionCommentContextDocument,
  type ListIssueDiscussionRootsQuery,
  StartDiscussionDocument,
} from "../../../src/gql/graphql.js";

vi.mock("../../../src/services/reaction-service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/services/reaction-service.js")
    >();
  return {
    ...actual,
    createReactionForComment: vi.fn().mockResolvedValue({ id: "reaction-1" }),
    deleteOwnReactionByEmoji: vi
      .fn()
      .mockResolvedValue({ id: "reaction-1", success: true }),
    deleteOwnReactionById: vi
      .fn()
      .mockResolvedValue({ id: "reaction-1", success: true }),
  };
});

import {
  createDiscussionCommentReaction,
  createIssueDiscussionCommentReaction,
  deleteDiscussionComment,
  deleteDiscussionCommentReactionByEmoji,
  deleteDiscussionCommentReactionById,
  deleteDiscussionReply,
  deleteIssueDiscussionCommentReactionByEmoji,
  deleteIssueDiscussionCommentReactionById,
  editDiscussionComment,
  editDiscussionReply,
  listDiscussionReplies,
  listDiscussionRepliesWithReactions,
  listDiscussionsForInitiative,
  listDiscussionsForInitiativeWithReactions,
  listDiscussionsForIssue,
  listDiscussionsForIssueWithReactions,
  listDiscussionsForProject,
  listDiscussionsForProjectWithReactions,
  replyToDiscussion,
  resolveDiscussion,
  startInitiativeDiscussion,
  startIssueDiscussion,
  startProjectDiscussion,
  unresolveDiscussion,
} from "../../../src/services/discussion-service.js";
import {
  createReactionForComment,
  deleteOwnReactionByEmoji,
  deleteOwnReactionById,
} from "../../../src/services/reaction-service.js";

function createClientMock(): GraphQLClient {
  return {
    request: vi.fn(),
  } as unknown as GraphQLClient;
}

const MOCK_USER = { id: "user-1", displayName: "Test User" };
const REACTION_USER = { id: "user-1", displayName: "Ada" };

function comment(id: string, parentId: string | null = null) {
  return {
    id,
    body: `comment-${id}`,
    createdAt: "2025-01-15T10:00:00.000Z",
    editedAt: null,
    parentId,
    resolvedAt: null,
    resolvingComment: null,
    resolvingUser: null,
    user: MOCK_USER,
  };
}

function commentWithReaction(id: string, parentId: string | null = null) {
  return {
    ...comment(id, parentId),
    reactions: [
      {
        id: "r-1",
        emoji: "👍",
        user: REACTION_USER,
        externalUser: null,
      },
    ],
  };
}

describe("discussion comment reactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates thread reaction after validating root comment and entity kind", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("thread-1"),
        issueId: "issue-1",
        projectId: null,
        initiativeId: null,
      },
    });

    await expect(
      createDiscussionCommentReaction(client, {
        commentId: "thread-1",
        target: "thread",
        expectedEntityKind: "issue",
        emoji: "👍",
      }),
    ).resolves.toEqual({ id: "reaction-1" });

    expect(client.request).toHaveBeenCalledWith(
      GetDiscussionCommentContextDocument,
      { id: "thread-1" },
    );
    expect(createReactionForComment).toHaveBeenCalledWith(expect.anything(), {
      commentId: "thread-1",
      emoji: "👍",
    });
  });

  it("rejects thread reaction when comment is a reply", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("reply-1", "thread-1"),
        issueId: "issue-1",
        projectId: null,
        initiativeId: null,
      },
    });

    await expect(
      createDiscussionCommentReaction(client, {
        commentId: "reply-1",
        target: "thread",
        expectedEntityKind: "issue",
        emoji: "👍",
      }),
    ).rejects.toThrow(
      'Discussion thread ID "reply-1" must reference a root comment',
    );

    expect(createReactionForComment).not.toHaveBeenCalled();
  });

  it("rejects reply reaction when entity kind does not match", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("reply-1", "thread-1"),
        issueId: null,
        projectId: "project-1",
        initiativeId: null,
      },
    });

    await expect(
      deleteDiscussionCommentReactionByEmoji(client, {
        commentId: "reply-1",
        target: "reply",
        expectedEntityKind: "issue",
        emoji: "👍",
      }),
    ).rejects.toThrow(
      'Discussion reply ID "reply-1" belongs to project, not issue',
    );

    expect(deleteOwnReactionByEmoji).not.toHaveBeenCalled();
  });

  it("deletes reply reaction by id after validation", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("reply-1", "thread-1"),
        issueId: null,
        projectId: null,
        initiativeId: "initiative-1",
      },
    });

    await expect(
      deleteDiscussionCommentReactionById(client, {
        commentId: "reply-1",
        target: "reply",
        expectedEntityKind: "initiative",
        reactionId: "reaction-1",
      }),
    ).resolves.toEqual({ id: "reaction-1", success: true });

    expect(deleteOwnReactionById).toHaveBeenCalledWith(expect.anything(), {
      kind: "comment",
      id: "reply-1",
      reactionId: "reaction-1",
    });
  });

  it("creates deprecated issue comment reaction after validating issue ownership", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("comment-1"),
        issueId: "issue-1",
        projectId: null,
        initiativeId: null,
      },
    });

    await expect(
      createIssueDiscussionCommentReaction(client, {
        commentId: "comment-1",
        emoji: "👍",
      }),
    ).resolves.toEqual({ id: "reaction-1" });

    expect(createReactionForComment).toHaveBeenCalledWith(expect.anything(), {
      commentId: "comment-1",
      emoji: "👍",
    });
  });

  it("rejects deprecated issue comment reaction for non-issue comment", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("comment-1"),
        issueId: null,
        projectId: "project-1",
        initiativeId: null,
      },
    });

    await expect(
      createIssueDiscussionCommentReaction(client, {
        commentId: "comment-1",
        emoji: "👍",
      }),
    ).rejects.toThrow(
      'Discussion comment ID "comment-1" belongs to project, not issue',
    );

    expect(createReactionForComment).not.toHaveBeenCalled();
  });

  it("rejects deprecated issue comment unreact by emoji for missing comment", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({ comment: null });

    await expect(
      deleteIssueDiscussionCommentReactionByEmoji(client, {
        commentId: "comment-1",
        emoji: "👍",
      }),
    ).rejects.toThrow('Discussion comment ID "comment-1" not found');

    expect(deleteOwnReactionByEmoji).not.toHaveBeenCalled();
  });

  it("deletes deprecated issue comment reaction by id after validation", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      comment: {
        ...comment("comment-1"),
        issueId: "issue-1",
        projectId: null,
        initiativeId: null,
      },
    });

    await expect(
      deleteIssueDiscussionCommentReactionById(client, {
        commentId: "comment-1",
        reactionId: "reaction-1",
      }),
    ).resolves.toEqual({ id: "reaction-1", success: true });

    expect(deleteOwnReactionById).toHaveBeenCalledWith(expect.anything(), {
      kind: "comment",
      id: "comment-1",
      reactionId: "reaction-1",
    });
  });
});

describe("listDiscussionsForIssue", () => {
  it("returns root threads only", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      issue: {
        comments: {
          nodes: [comment("root-1"), comment("root-2")],
          pageInfo: { hasNextPage: true, endCursor: "root-cursor-1" },
        },
      },
    } satisfies ListIssueDiscussionRootsQuery);

    const result = await listDiscussionsForIssue(client, "issue-1", {
      limit: 2,
      after: "root-cursor-0",
    });

    expect(result.nodes.map((node) => node.id)).toEqual(["root-1", "root-2"]);
    expect(result.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "root-cursor-1",
    });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      issueId: "issue-1",
      first: 2,
      after: "root-cursor-0",
    });
  });

  it("throws when issue is missing", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({ issue: null });

    await expect(
      listDiscussionsForIssue(client, "issue-missing"),
    ).rejects.toThrow('Issue with ID "issue-missing" not found');
  });

  it("listDiscussionsForIssueWithReactions normalizes thread reactions", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      issue: {
        comments: {
          nodes: [commentWithReaction("root-1")],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const result = await listDiscussionsForIssueWithReactions(
      client,
      "issue-1",
      { limit: 10 },
    );

    expect(result.nodes[0]?.reactions).toEqual([
      {
        emoji: "👍",
        count: 1,
        users: [{ id: "user-1", displayName: "Ada", type: "user" }],
        reactionIds: ["r-1"],
      },
    ]);
  });
});

describe("listDiscussionsForProject", () => {
  it("returns root threads only", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      project: {
        comments: {
          nodes: [comment("root-1")],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const result = await listDiscussionsForProject(client, "project-1", {
      limit: 10,
      after: "cur-0",
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      projectId: "project-1",
      first: 10,
      after: "cur-0",
    });
  });

  it("throws when project is missing", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({ project: null });

    await expect(
      listDiscussionsForProject(client, "project-missing"),
    ).rejects.toThrow('Project with ID "project-missing" not found');
  });

  it("listDiscussionsForProjectWithReactions normalizes thread reactions", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      project: {
        comments: {
          nodes: [commentWithReaction("root-1")],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    const result = await listDiscussionsForProjectWithReactions(
      client,
      "project-1",
      { limit: 10 },
    );

    expect(result.nodes[0]?.reactions).toEqual([
      {
        emoji: "👍",
        count: 1,
        users: [{ id: "user-1", displayName: "Ada", type: "user" }],
        reactionIds: ["r-1"],
      },
    ]);
  });
});

describe("listDiscussionsForInitiative", () => {
  it("returns root threads only", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      initiative: { id: "initiative-1" },
      comments: {
        nodes: [comment("root-1")],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await listDiscussionsForInitiative(client, "initiative-1");

    expect(result.nodes).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      initiativeId: "initiative-1",
      initiativeLookupId: "initiative-1",
      first: 25,
      after: undefined,
    });
  });

  it("throws when initiative is missing", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({ initiative: null });

    await expect(
      listDiscussionsForInitiative(client, "initiative-missing"),
    ).rejects.toThrow('Initiative with ID "initiative-missing" not found');
  });

  it("listDiscussionsForInitiativeWithReactions normalizes thread reactions", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValue({
      initiative: { id: "initiative-1" },
      comments: {
        nodes: [commentWithReaction("root-1")],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await listDiscussionsForInitiativeWithReactions(
      client,
      "initiative-1",
      { limit: 10 },
    );

    expect(result.nodes[0]?.reactions).toEqual([
      {
        emoji: "👍",
        count: 1,
        users: [{ id: "user-1", displayName: "Ada", type: "user" }],
        reactionIds: ["r-1"],
      },
    ]);
  });
});

describe("listDiscussionReplies", () => {
  it("returns deeply nested replies beyond fixed query depth", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        comment: {
          ...comment("root-1"),
          issueId: "issue-1",
          projectId: null,
          initiativeId: null,
        },
      })
      .mockResolvedValueOnce({
        comments: {
          nodes: [
            comment("reply-1", "root-1"),
            comment("reply-2", "reply-1"),
            comment("reply-3", "reply-2"),
            comment("reply-4", "reply-3"),
            comment("reply-5", "reply-4"),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await listDiscussionReplies(client, "root-1", {
      limit: 5,
    });

    expect(result.nodes.map((node) => node.id)).toEqual([
      "reply-1",
      "reply-2",
      "reply-3",
      "reply-4",
      "reply-5",
    ]);
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: "reply-5",
    });
  });

  it("paginates thread replies with reply id cursors", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        comment: {
          ...comment("root-1"),
          issueId: "issue-1",
          projectId: null,
          initiativeId: null,
        },
      })
      .mockResolvedValueOnce({
        comments: {
          nodes: [
            comment("reply-1", "root-1"),
            comment("other-1", "other-root"),
            comment("reply-2", "reply-1"),
            comment("reply-3", "reply-2"),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await listDiscussionReplies(client, "root-1", {
      limit: 1,
      after: "reply-1",
    });

    expect(result.nodes.map((node) => node.id)).toEqual(["reply-2"]);
    expect(result.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "reply-2",
    });
  });

  it("keeps descendants when candidates arrive before their parent", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        comment: {
          ...comment("root-1"),
          issueId: "issue-1",
          projectId: null,
          initiativeId: null,
        },
      })
      .mockResolvedValueOnce({
        comments: {
          nodes: [
            {
              ...comment("a-child", "z-parent"),
              createdAt: "2025-01-15T10:00:00.000Z",
            },
            {
              ...comment("z-parent", "root-1"),
              createdAt: "2025-01-15T10:00:00.000Z",
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await listDiscussionReplies(client, "root-1", { limit: 10 });

    expect(result.nodes.map((node) => node.id)).toEqual([
      "z-parent",
      "a-child",
    ]);
  });

  it("throws when thread id does not exist", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({ comment: null });

    await expect(
      listDiscussionReplies(client, "missing-thread"),
    ).rejects.toThrow('Discussion thread ID "missing-thread" not found');
  });

  it("rejects non-root thread id", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      comment: comment("reply-1", "root-1"),
    });

    await expect(listDiscussionReplies(client, "reply-1")).rejects.toThrow(
      'Discussion thread ID "reply-1" must reference a root comment',
    );
  });

  it("listDiscussionRepliesWithReactions normalizes reply reactions", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        comment: {
          ...comment("root-1"),
          issueId: "issue-1",
          projectId: null,
          initiativeId: null,
        },
      })
      .mockResolvedValueOnce({
        comments: {
          nodes: [commentWithReaction("reply-1", "root-1")],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await listDiscussionRepliesWithReactions(
      client,
      "root-1",
      { limit: 10 },
      "issue",
    );

    expect(result.nodes[0]?.reactions).toEqual([
      {
        emoji: "👍",
        count: 1,
        users: [{ id: "user-1", displayName: "Ada", type: "user" }],
        reactionIds: ["r-1"],
      },
    ]);
  });
});

describe("replyToDiscussion", () => {
  it("throws when thread id does not exist", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({ comment: null });

    await expect(
      replyToDiscussion(client, { threadId: "missing-thread", body: "nested" }),
    ).rejects.toThrow('Discussion thread ID "missing-thread" not found');
  });

  it("rejects non-root parent thread id", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      comment: {
        ...comment("reply-2", "root-1"),
        issueId: "issue-1",
        projectId: null,
        initiativeId: null,
      },
    });

    await expect(
      replyToDiscussion(client, { threadId: "reply-2", body: "nested reply" }),
    ).rejects.toThrow(
      'Discussion thread ID "reply-2" must reference a root comment',
    );

    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(
      GetDiscussionCommentContextDocument,
      {
        id: "reply-2",
      },
    );
  });

  it("rejects root thread from different entity kind", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      comment: {
        ...comment("root-1"),
        issueId: null,
        projectId: "project-1",
        initiativeId: null,
      },
    });

    await expect(
      replyToDiscussion(client, {
        threadId: "root-1",
        body: "nested reply",
        entityKind: "issue",
      }),
    ).rejects.toThrow(
      'Discussion thread ID "root-1" belongs to project, not issue',
    );
  });

  it("creates a reply for root thread and forwards the parent entity id", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        comment: {
          ...comment("root-1"),
          issueId: "issue-1",
          projectId: null,
          initiativeId: null,
        },
      })
      .mockResolvedValueOnce({
        commentCreate: {
          success: true,
          comment: comment("reply-1", "root-1"),
        },
      });

    const result = await replyToDiscussion(client, {
      threadId: "root-1",
      body: "hello",
    });

    expect(result.id).toBe("reply-1");
    expect(result.parentId).toBe("root-1");
    expect(client.request).toHaveBeenNthCalledWith(2, StartDiscussionDocument, {
      input: {
        parentId: "root-1",
        issueId: "issue-1",
        body: "hello",
      },
    });
  });
});

describe("discussion mutation flows", () => {
  it("starts issue/project/initiative discussions", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({
        commentCreate: { success: true, comment: comment("c-issue") },
      })
      .mockResolvedValueOnce({
        commentCreate: { success: true, comment: comment("c-project") },
      })
      .mockResolvedValueOnce({
        commentCreate: { success: true, comment: comment("c-initiative") },
      });

    await expect(
      startIssueDiscussion(client, { issueId: "issue-1", body: "issue body" }),
    ).resolves.toMatchObject({ id: "c-issue" });
    await expect(
      startProjectDiscussion(client, {
        projectId: "project-1",
        body: "project body",
      }),
    ).resolves.toMatchObject({ id: "c-project" });
    await expect(
      startInitiativeDiscussion(client, {
        initiativeId: "initiative-1",
        body: "initiative body",
      }),
    ).resolves.toMatchObject({ id: "c-initiative" });
  });

  it("fails to start issue discussion when create fails", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      commentCreate: { success: false, comment: null },
    });

    await expect(
      startIssueDiscussion(client, { issueId: "issue-1", body: "issue body" }),
    ).rejects.toThrow("Failed to start discussion");
  });

  it("edits and deletes replies", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ comment: comment("reply-1", "root-1") })
      .mockResolvedValueOnce({
        commentUpdate: {
          success: true,
          comment: { ...comment("reply-1", "root-1"), body: "updated" },
        },
      })
      .mockResolvedValueOnce({ comment: comment("reply-1", "root-1") })
      .mockResolvedValueOnce({
        commentDelete: { success: true, entityId: "reply-1" },
      });

    await expect(
      editDiscussionReply(client, "reply-1", { body: "updated" }),
    ).resolves.toMatchObject({ id: "reply-1", body: "updated" });
    await expect(deleteDiscussionReply(client, "reply-1")).resolves.toEqual({
      id: "reply-1",
      success: true,
    });
  });

  it("rejects editing a root comment via editDiscussionReply", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      comment: comment("root-1"),
    });

    await expect(
      editDiscussionReply(client, "root-1", { body: "updated" }),
    ).rejects.toThrow(
      'Discussion reply ID "root-1" must reference a reply comment',
    );
  });

  it("rejects deleting a root comment via deleteDiscussionReply", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      comment: comment("root-1"),
    });

    await expect(deleteDiscussionReply(client, "root-1")).rejects.toThrow(
      'Discussion reply ID "root-1" must reference a reply comment',
    );
  });

  it("supports compatibility edit/delete for root comments", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ comment: comment("root-1") })
      .mockResolvedValueOnce({
        commentUpdate: {
          success: true,
          comment: { ...comment("root-1"), body: "updated" },
        },
      })
      .mockResolvedValueOnce({ comment: comment("root-1") })
      .mockResolvedValueOnce({
        commentDelete: { success: true, entityId: "root-1" },
      });

    await expect(
      editDiscussionComment(client, "root-1", { body: "updated" }),
    ).resolves.toMatchObject({ id: "root-1", body: "updated" });
    await expect(deleteDiscussionComment(client, "root-1")).resolves.toEqual({
      id: "root-1",
      success: true,
    });
  });

  it("rejects editing reply from different entity kind", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({
      comment: {
        ...comment("reply-1", "root-1"),
        issueId: null,
        projectId: "project-1",
        initiativeId: null,
      },
    });

    await expect(
      editDiscussionReply(client, "reply-1", { body: "updated" }, "issue"),
    ).rejects.toThrow(
      'Discussion reply ID "reply-1" belongs to project, not issue',
    );
  });

  it("supports compatibility edit/delete for reply comments", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ comment: comment("reply-1", "root-1") })
      .mockResolvedValueOnce({
        commentUpdate: {
          success: true,
          comment: { ...comment("reply-1", "root-1"), body: "updated" },
        },
      })
      .mockResolvedValueOnce({ comment: comment("reply-1", "root-1") })
      .mockResolvedValueOnce({
        commentDelete: { success: true, entityId: "reply-1" },
      });

    await expect(
      editDiscussionComment(client, "reply-1", { body: "updated" }),
    ).resolves.toMatchObject({ id: "reply-1", body: "updated" });
    await expect(deleteDiscussionComment(client, "reply-1")).resolves.toEqual({
      id: "reply-1",
      success: true,
    });
  });

  it("fails compatibility edit/delete when target comment is missing", async () => {
    const client = createClientMock();
    vi.mocked(client.request).mockResolvedValueOnce({ comment: null });

    await expect(
      editDiscussionComment(client, "missing", { body: "updated" }),
    ).rejects.toThrow('Discussion comment ID "missing" not found');
  });

  it("fails compatibility edit when update mutation fails", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ comment: comment("root-1") })
      .mockResolvedValueOnce({
        commentUpdate: { success: false, comment: null },
      });

    await expect(
      editDiscussionComment(client, "root-1", { body: "updated" }),
    ).rejects.toThrow("Failed to edit discussion comment");
  });

  it("fails compatibility delete when delete mutation fails", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ comment: comment("root-1") })
      .mockResolvedValueOnce({
        commentDelete: { success: false, entityId: "root-1" },
      });

    await expect(deleteDiscussionComment(client, "root-1")).rejects.toThrow(
      "Failed to delete discussion comment",
    );
  });

  it("resolves and unresolves root discussion", async () => {
    const client = createClientMock();
    vi.mocked(client.request)
      .mockResolvedValueOnce({ comment: comment("root-1") })
      .mockResolvedValueOnce({
        commentResolve: {
          success: true,
          comment: {
            ...comment("root-1"),
            resolvedAt: "2025-01-16T10:00:00.000Z",
          },
        },
      })
      .mockResolvedValueOnce({ comment: comment("root-1") })
      .mockResolvedValueOnce({
        commentUnresolve: {
          success: true,
          comment: comment("root-1"),
        },
      });

    await expect(
      resolveDiscussion(client, {
        threadId: "root-1",
        resolvingCommentId: "reply-1",
      }),
    ).resolves.toMatchObject({ id: "root-1" });
    await expect(unresolveDiscussion(client, "root-1")).resolves.toMatchObject({
      id: "root-1",
    });
  });
});
