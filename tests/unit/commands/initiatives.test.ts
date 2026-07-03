import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
  })),
  getRootOpts: vi.fn(() => ({ apiToken: "test-token" })),
}));

vi.mock("../../../src/common/output.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/output.js")>();
  return {
    ...actual,
    outputSuccess: vi.fn(),
  };
});

vi.mock("../../../src/resolvers/initiative-resolver.js", () => ({
  resolveInitiativeId: vi.fn().mockResolvedValue("resolved-initiative-uuid"),
  resolveInitiativeRelationId: vi
    .fn()
    .mockResolvedValue("resolved-relation-uuid"),
  resolveInitiativeProjectLinkId: vi
    .fn()
    .mockResolvedValue("resolved-link-uuid"),
}));

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock(
  "../../../src/services/initiative-service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../src/services/initiative-service.js")
      >();
    return {
      ...actual,
      listInitiatives: vi.fn().mockResolvedValue({
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
      getInitiative: vi
        .fn()
        .mockResolvedValue({ id: "resolved-initiative-uuid" }),
      createInitiative: vi
        .fn()
        .mockResolvedValue({ id: "resolved-initiative-uuid" }),
      updateInitiative: vi
        .fn()
        .mockResolvedValue({ id: "resolved-initiative-uuid" }),
      archiveInitiative: vi
        .fn()
        .mockResolvedValue({ id: "resolved-initiative-uuid" }),
      unarchiveInitiative: vi
        .fn()
        .mockResolvedValue({ id: "resolved-initiative-uuid" }),
      deleteInitiative: vi
        .fn()
        .mockResolvedValue({ id: "resolved-initiative-uuid", success: true }),
    };
  },
);

vi.mock("../../../src/services/initiative-relation-service.js", () => ({
  createInitiativeRelation: vi
    .fn()
    .mockResolvedValue({ id: "resolved-relation-uuid" }),
  deleteInitiativeRelation: vi
    .fn()
    .mockResolvedValue({ id: "resolved-relation-uuid", success: true }),
}));

vi.mock("../../../src/services/initiative-project-service.js", () => ({
  createInitiativeProjectLink: vi
    .fn()
    .mockResolvedValue({ id: "resolved-link-uuid" }),
  deleteInitiativeProjectLink: vi
    .fn()
    .mockResolvedValue({ id: "resolved-link-uuid", success: true }),
}));

vi.mock(
  "../../../src/services/initiative-update-service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../src/services/initiative-update-service.js")
      >();
    return {
      ...actual,
      listInitiativeUpdates: vi.fn().mockResolvedValue({
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
      getInitiativeUpdate: vi
        .fn()
        .mockResolvedValue({ id: "resolved-update-uuid" }),
      createInitiativeUpdate: vi
        .fn()
        .mockResolvedValue({ id: "resolved-update-uuid" }),
      updateInitiativeUpdate: vi
        .fn()
        .mockResolvedValue({ id: "resolved-update-uuid" }),
      archiveInitiativeUpdate: vi
        .fn()
        .mockResolvedValue({ id: "resolved-update-uuid" }),
      unarchiveInitiativeUpdate: vi
        .fn()
        .mockResolvedValue({ id: "resolved-update-uuid" }),
    };
  },
);

vi.mock("../../../src/services/discussion-service.js", () => ({
  startInitiativeDiscussion: vi
    .fn()
    .mockResolvedValue({ id: "discussion-root-1" }),
  listDiscussionsForInitiative: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  }),
  listDiscussionReplies: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  }),
  listDiscussionsForInitiativeWithReactions: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  }),
  listDiscussionRepliesWithReactions: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  }),
  replyToDiscussion: vi.fn().mockResolvedValue({ id: "discussion-reply-1" }),
  editDiscussionReply: vi.fn().mockResolvedValue({ id: "discussion-reply-1" }),
  deleteDiscussionReply: vi
    .fn()
    .mockResolvedValue({ id: "discussion-reply-1", success: true }),
  editDiscussionComment: vi
    .fn()
    .mockResolvedValue({ id: "discussion-comment-1" }),
  deleteDiscussionComment: vi
    .fn()
    .mockResolvedValue({ id: "discussion-comment-1", success: true }),
  resolveDiscussion: vi.fn().mockResolvedValue({ id: "discussion-root-1" }),
  unresolveDiscussion: vi.fn().mockResolvedValue({ id: "discussion-root-1" }),
  createDiscussionCommentReaction: vi
    .fn()
    .mockResolvedValue({ id: "reaction-1" }),
  deleteDiscussionCommentReactionByEmoji: vi
    .fn()
    .mockResolvedValue({ id: "reaction-1", success: true }),
  deleteDiscussionCommentReactionById: vi
    .fn()
    .mockResolvedValue({ id: "reaction-1", success: true }),
}));

import { setupInitiativesCommands } from "../../../src/commands/initiatives/index.js";
import { getRootOpts } from "../../../src/common/context.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveInitiativeId } from "../../../src/resolvers/initiative-resolver.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";
import {
  createDiscussionCommentReaction,
  deleteDiscussionComment,
  deleteDiscussionCommentReactionByEmoji,
  deleteDiscussionCommentReactionById,
  deleteDiscussionReply,
  editDiscussionComment,
  editDiscussionReply,
  listDiscussionReplies,
  listDiscussionRepliesWithReactions,
  listDiscussionsForInitiative,
  listDiscussionsForInitiativeWithReactions,
  replyToDiscussion,
  resolveDiscussion,
  startInitiativeDiscussion,
  unresolveDiscussion,
} from "../../../src/services/discussion-service.js";
import {
  createInitiativeProjectLink,
  deleteInitiativeProjectLink,
} from "../../../src/services/initiative-project-service.js";
import {
  createInitiativeRelation,
  deleteInitiativeRelation,
} from "../../../src/services/initiative-relation-service.js";
import {
  listInitiatives,
  updateInitiative,
} from "../../../src/services/initiative-service.js";
import {
  createInitiativeUpdate,
  listInitiativeUpdates,
} from "../../../src/services/initiative-update-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupInitiativesCommands(program);
  return program;
}

describe("initiatives command registration", () => {
  it("registers initiatives domain", () => {
    const root = new Command();
    root.option("--api-token <token>");
    setupInitiativesCommands(root);

    const cmd = root.commands.find(
      (command) => command.name() === "initiatives",
    );
    expect(cmd).toBeDefined();
  });
});

describe("initiatives list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("parses and forwards includeArchived and sort", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--include-archived",
      "--sort-by",
      "updatedAt",
      "--sort-order",
      "desc",
      "--limit",
      "5",
    ]);

    expect(listInitiatives).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        includeArchived: true,
        limit: 5,
        orderBy: "updatedAt",
        sort: [
          {
            updatedAt: {
              order: "Descending",
              nulls: "last",
            },
          },
        ],
      }),
    );
    expect(outputSuccess).toHaveBeenCalled();
  });

  it("validates invalid sort-order", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--sort-by",
      "updatedAt",
      "--sort-order",
      "sideways",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --sort-order"),
    );
    expect(listInitiatives).not.toHaveBeenCalled();
  });

  it("forwards supported filters including resolved owner", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--name",
      "Growth",
      "--owner",
      "Alice",
    ]);

    expect(resolveUserId).toHaveBeenCalledWith(expect.anything(), "Alice");
    expect(listInitiatives).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: expect.objectContaining({
          name: { eqIgnoreCase: "Growth" },
          owner: { id: { eq: "resolved-user-uuid" } },
        }),
      }),
    );
  });

  it("rejects unsupported list expand flags explicitly", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--with-projects",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("not supported for initiatives list yet"),
    );
    expect(listInitiatives).not.toHaveBeenCalled();
  });

  it("rejects --parent filter explicitly", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "list",
      "--parent",
      "Growth",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--parent"),
    );
    expect(listInitiatives).not.toHaveBeenCalled();
  });
});

describe("initiatives update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("rejects no-op update", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "update",
      "Growth",
    ]);

    expect(updateInitiative).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
  });
});

describe("initiative relations and projects wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("wires relate", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "relate",
      "Parent",
      "Child",
    ]);

    expect(resolveInitiativeId).toHaveBeenCalledTimes(2);
    expect(createInitiativeRelation).toHaveBeenCalledWith(expect.anything(), {
      parentId: "resolved-initiative-uuid",
      childId: "resolved-initiative-uuid",
    });
  });

  it("wires unrelate", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "unrelate",
      "Parent",
      "Child",
    ]);

    expect(deleteInitiativeRelation).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-relation-uuid",
    );
  });

  it("wires add-project", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "add-project",
      "Growth",
      "Website",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(expect.anything(), "Website");
    expect(createInitiativeProjectLink).toHaveBeenCalledWith(
      expect.anything(),
      {
        initiativeId: "resolved-initiative-uuid",
        projectId: "resolved-project-uuid",
      },
    );
  });

  it("wires remove-project", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "remove-project",
      "Growth",
      "Website",
    ]);

    expect(deleteInitiativeProjectLink).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-link-uuid",
    );
  });
});

describe("initiative updates wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("wires updates list", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "updates",
      "list",
      "--initiative",
      "Growth",
      "--include-archived",
      "--limit",
      "7",
    ]);

    expect(listInitiativeUpdates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        initiativeId: "resolved-initiative-uuid",
        includeArchived: true,
        limit: 7,
      }),
    );
  });

  it("wires updates create", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "updates",
      "create",
      "--initiative",
      "Growth",
      "--body",
      "Steady progress",
      "--health",
      "onTrack",
    ]);

    expect(createInitiativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        initiativeId: "resolved-initiative-uuid",
        body: "Steady progress",
      }),
    );
  });
});

describe("initiative discussion commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("wires discuss with initiative resolver and discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "discuss",
      "Growth",
      "--body",
      "Kickoff thread",
    ]);

    expect(resolveInitiativeId).toHaveBeenCalledWith(
      expect.anything(),
      "Growth",
    );
    expect(startInitiativeDiscussion).toHaveBeenCalledWith(expect.anything(), {
      initiativeId: "resolved-initiative-uuid",
      body: "Kickoff thread",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("validates discuss requires --body", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "discuss",
      "Growth",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(startInitiativeDiscussion).not.toHaveBeenCalled();
  });

  it("wires discussions with pagination", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "discussions",
      "Growth",
      "--limit",
      "10",
      "--after",
      "cursor-1",
    ]);

    expect(resolveInitiativeId).toHaveBeenCalledWith(
      expect.anything(),
      "Growth",
    );
    expect(listDiscussionsForInitiative).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-initiative-uuid",
      { limit: 10, after: "cursor-1" },
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      nodes: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    });
  });

  it("wires discussions --with-reactions to reaction-aware service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "discussions",
      "Growth",
      "--with-reactions",
    ]);

    expect(listDiscussionsForInitiativeWithReactions).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-initiative-uuid",
      { limit: 25, after: undefined },
    );
    expect(listDiscussionsForInitiative).not.toHaveBeenCalled();
  });

  it("wires replies with pagination", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "replies",
      "thread-1",
      "--limit",
      "15",
      "--after",
      "cursor-2",
    ]);

    expect(listDiscussionReplies).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
      {
        limit: 15,
        after: "cursor-2",
      },
      "initiative",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      nodes: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
    });
  });

  it("wires replies --with-reactions to reaction-aware service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "replies",
      "thread-1",
      "--with-reactions",
    ]);

    expect(listDiscussionRepliesWithReactions).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
      { limit: 50, after: undefined },
      "initiative",
    );
    expect(listDiscussionReplies).not.toHaveBeenCalled();
  });

  it("wires reply", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "reply",
      "thread-1",
      "--body",
      "Nested reply",
    ]);

    expect(replyToDiscussion).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread-1",
      body: "Nested reply",
      entityKind: "initiative",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-reply-1" });
  });

  it("validates reply requires --body", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "reply",
      "thread-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(replyToDiscussion).not.toHaveBeenCalled();
  });

  it("documents generic edit/delete as root-or-reply while strict reply commands stay reply-only", () => {
    const program = createProgram();
    const initiatives = program.commands.find(
      (command) => command.name() === "initiatives",
    );

    const edit = initiatives?.commands.find(
      (command) => command.name() === "edit",
    );
    const del = initiatives?.commands.find(
      (command) => command.name() === "delete-comment",
    );
    const editReply = initiatives?.commands.find(
      (command) => command.name() === "edit-reply",
    );
    const deleteReply = initiatives?.commands.find(
      (command) => command.name() === "delete-reply",
    );

    expect(edit?.description()).toContain("root discussion or reply");
    expect(del?.description()).toContain("root discussion or reply");
    expect(editReply?.description()).toBe("edit a discussion reply");
    expect(deleteReply?.description()).toBe("delete a discussion reply");
  });

  it("wires generic edit to discussion comment service", async () => {
    const program = createProgram();
    const commentId = "11111111-1111-4111-8111-111111111111";

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "edit",
      commentId,
      "--body",
      "Edited",
    ]);

    expect(editDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      commentId,
      { body: "Edited" },
      "initiative",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-comment-1" });
  });

  it("wires edit-reply", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "edit-reply",
      "reply-1",
      "--body",
      "Edited",
    ]);

    expect(editDiscussionReply).toHaveBeenCalledWith(
      expect.anything(),
      "reply-1",
      { body: "Edited" },
      "initiative",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-reply-1" });
  });

  it("validates edit-reply requires --body", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "edit-reply",
      "reply-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(editDiscussionReply).not.toHaveBeenCalled();
  });

  it("wires generic delete-comment to discussion comment service", async () => {
    const program = createProgram();
    const commentId = "11111111-1111-4111-8111-111111111111";

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "delete-comment",
      commentId,
    ]);

    expect(deleteDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      commentId,
      "initiative",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "discussion-comment-1",
      success: true,
    });
  });

  it("wires delete-reply", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "delete-reply",
      "reply-1",
    ]);

    expect(deleteDiscussionReply).toHaveBeenCalledWith(
      expect.anything(),
      "reply-1",
      "initiative",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "discussion-reply-1",
      success: true,
    });
  });

  it("wires resolve and forwards --with-comment", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "resolve",
      "thread-1",
      "--with-comment",
      "comment-123",
    ]);

    expect(resolveDiscussion).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread-1",
      resolvingCommentId: "comment-123",
      entityKind: "initiative",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("wires unresolve", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "unresolve",
      "thread-1",
    ]);

    expect(unresolveDiscussion).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
      "initiative",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("initiatives threads react reads options from the root command", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "--api-token",
      "root-token",
      "initiatives",
      "threads",
      "react",
      "thread-1",
      "👍",
    ]);

    expect(getRootOpts).toHaveBeenCalledWith(expect.any(Command));
  });

  it("initiatives threads react delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "threads",
      "react",
      "thread-1",
      "🎉",
    ]);

    expect(createDiscussionCommentReaction).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "thread-1",
        target: "thread",
        expectedEntityKind: "initiative",
        emoji: "🎉",
      },
    );
  });

  it("initiatives replies unreact supports --shortcode", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "replies",
      "unreact",
      "reply-1",
      "--shortcode",
      "thumbs_up",
    ]);

    expect(deleteDiscussionCommentReactionByEmoji).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "reply-1",
        target: "reply",
        expectedEntityKind: "initiative",
        emoji: "👍",
      },
    );
  });

  it("initiatives replies unreact-id delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "initiatives",
      "replies",
      "unreact-id",
      "reply-1",
      "reaction-123",
    ]);

    expect(deleteDiscussionCommentReactionById).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "reply-1",
        target: "reply",
        expectedEntityKind: "initiative",
        reactionId: "reaction-123",
      },
    );
  });
});
