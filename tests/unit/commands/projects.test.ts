import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: { sdk: {} },
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

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
  resolveProjectLabelIds: vi.fn().mockResolvedValue(["resolved-label-uuid"]),
}));

vi.mock("../../../src/resolvers/project-status-resolver.js", () => ({
  resolveProjectStatusId: vi.fn().mockResolvedValue("resolved-status-uuid"),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock("../../../src/services/project-service.js", () => ({
  archiveProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Archived" }),
  listProjects: vi.fn().mockResolvedValue({ nodes: [], pageInfo: {} }),
  getProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
  createProject: vi.fn().mockResolvedValue({ id: "proj-new" }),
  deleteProject: vi.fn().mockResolvedValue({ id: "proj-1", success: true }),
  unarchiveProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Active" }),
  updateProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
}));

vi.mock("../../../src/services/discussion-service.js", () => ({
  startProjectDiscussion: vi
    .fn()
    .mockResolvedValue({ id: "discussion-root-1" }),
  listDiscussionsForProject: vi.fn().mockResolvedValue({
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
  listDiscussionsForProjectWithReactions: vi.fn().mockResolvedValue({
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
  deleteDiscussionReply: vi.fn().mockResolvedValue({
    id: "discussion-reply-1",
    success: true,
  }),
  editDiscussionComment: vi
    .fn()
    .mockResolvedValue({ id: "discussion-comment-1" }),
  deleteDiscussionComment: vi.fn().mockResolvedValue({
    id: "discussion-comment-1",
    success: true,
  }),
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

import { setupProjectsCommands } from "../../../src/commands/projects.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";
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
  listDiscussionsForProject,
  listDiscussionsForProjectWithReactions,
  replyToDiscussion,
  resolveDiscussion,
  startProjectDiscussion,
  unresolveDiscussion,
} from "../../../src/services/discussion-service.js";
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  unarchiveProject,
  updateProject,
} from "../../../src/services/project-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupProjectsCommands(program);
  return program;
}

describe("projects list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("passes includeArchived to project listing", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "list",
      "--include-archived",
      "--limit",
      "25",
    ]);

    expect(listProjects).toHaveBeenCalledWith(expect.anything(), {
      limit: 25,
      after: undefined,
      includeArchived: true,
    });
  });
});

describe("projects read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "read",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(getProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      { milestonesFirst: 25, issuesFirst: 50 },
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "proj-1" });
  });

  it("passes project detail expansion limits including zero", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "read",
      "My Project",
      "--milestones-first",
      "0",
      "--issues-first",
      "10",
    ]);

    expect(getProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      { milestonesFirst: 0, issuesFirst: 10 },
    );
  });

  it("rejects negative project detail expansion limits", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "read",
      "My Project",
      "--issues-first",
      "-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --issues-first"),
    );
    expect(getProject).not.toHaveBeenCalled();
  });
});

describe("projects lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("archive resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "archive",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(archiveProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "proj-1",
      name: "Archived",
    });
  });

  it("unarchive resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "unarchive",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
      { includeArchived: true },
    );
    expect(unarchiveProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "proj-1",
      name: "Active",
    });
  });

  it("delete resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "delete",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
      { includeArchived: true },
    );
    expect(deleteProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "proj-1",
      success: true,
    });
  });
});

describe("projects create --priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("accepts valid priority 0", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "0",
    ]);

    expect(createProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ priority: 0 }),
    );
  });

  it("accepts valid priority 4", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "4",
    ]);

    expect(createProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ priority: 4 }),
    );
  });

  it("rejects invalid priority 5", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "5",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("must be 0-4"),
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it("rejects non-numeric priority", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "abc",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("must be 0-4"),
    );
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe("projects create compatibility options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("accepts singular --team and forwards icon and color", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--team",
      "ENG",
      "--icon",
      "rocket",
      "--color",
      "#ff0000",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(createProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamIds: ["resolved-team-uuid"],
        icon: "rocket",
        color: "#ff0000",
      }),
    );
  });

  it("rejects combining --team and --teams", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--team",
      "ENG",
      "--teams",
      "DES",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be combined with --teams"),
    );
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe("projects update compatibility options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("clears lead and lifecycle dates", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
      "--clear-lead",
      "--clear-start-date",
      "--clear-target-date",
    ]);

    expect(updateProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      expect.objectContaining({
        leadId: null,
        startDate: null,
        targetDate: null,
      }),
    );
  });

  it("updates icon, color, and singular team alias", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
      "--icon",
      "target",
      "--color",
      "#00ff00",
      "--team",
      "ENG",
    ]);

    expect(updateProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      expect.objectContaining({
        icon: "target",
        color: "#00ff00",
        teamIds: ["resolved-team-uuid"],
      }),
    );
  });

  it("rejects clear flags combined with replacement values", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
      "--lead",
      "Ada",
      "--clear-lead",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be combined with --clear-lead"),
    );
    expect(updateProject).not.toHaveBeenCalled();
  });
});

describe("projects discussion commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("projects discuss resolves project and delegates to discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "discuss",
      "My Project",
      "--body",
      "Kickoff thread",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(startProjectDiscussion).toHaveBeenCalledWith(expect.anything(), {
      projectId: "resolved-project-uuid",
      body: "Kickoff thread",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("projects discuss requires --body", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "discuss",
      "My Project",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(startProjectDiscussion).not.toHaveBeenCalled();
  });

  it("projects discussions resolves project and forwards pagination", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "discussions",
      "My Project",
      "--limit",
      "10",
      "--after",
      "cursor-1",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(listDiscussionsForProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
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

  it("projects discussions --with-reactions routes to reaction-aware service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "discussions",
      "My Project",
      "--with-reactions",
    ]);

    expect(listDiscussionsForProjectWithReactions).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      { limit: 25, after: undefined },
    );
    expect(listDiscussionsForProject).not.toHaveBeenCalled();
  });

  it("projects replies forwards pagination", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
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
      "project",
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

  it("projects replies --with-reactions routes to reaction-aware service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "replies",
      "thread-1",
      "--with-reactions",
    ]);

    expect(listDiscussionRepliesWithReactions).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
      { limit: 50, after: undefined },
      "project",
    );
    expect(listDiscussionReplies).not.toHaveBeenCalled();
  });

  it("projects reply delegates to discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "reply",
      "thread-1",
      "--body",
      "Nested reply",
    ]);

    expect(replyToDiscussion).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread-1",
      body: "Nested reply",
      entityKind: "project",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-reply-1" });
  });

  it("projects reply requires --body", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "projects", "reply", "thread-1"]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(replyToDiscussion).not.toHaveBeenCalled();
  });

  it("projects generic edit/delete help documents root or reply IDs while strict reply commands stay reply-only", () => {
    const program = createProgram();
    const projects = program.commands.find(
      (command) => command.name() === "projects",
    );

    const edit = projects?.commands.find(
      (command) => command.name() === "edit",
    );
    const del = projects?.commands.find(
      (command) => command.name() === "delete-comment",
    );
    const editReply = projects?.commands.find(
      (command) => command.name() === "edit-reply",
    );
    const deleteReply = projects?.commands.find(
      (command) => command.name() === "delete-reply",
    );

    expect(edit?.description()).toContain("root discussion or reply");
    expect(del?.description()).toContain("root discussion or reply");
    expect(editReply?.description()).toBe("edit a discussion reply");
    expect(deleteReply?.description()).toBe("delete a discussion reply");
  });

  it("projects edit delegates to generic discussion comment service", async () => {
    const program = createProgram();
    const commentId = "11111111-1111-4111-8111-111111111111";

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "edit",
      commentId,
      "--body",
      "Edited",
    ]);

    expect(editDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      commentId,
      { body: "Edited" },
      "project",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-comment-1" });
  });

  it("projects edit-reply delegates to discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "edit-reply",
      "reply-1",
      "--body",
      "Edited",
    ]);

    expect(editDiscussionReply).toHaveBeenCalledWith(
      expect.anything(),
      "reply-1",
      { body: "Edited" },
      "project",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-reply-1" });
  });

  it("projects edit-reply requires --body", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "edit-reply",
      "reply-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(editDiscussionReply).not.toHaveBeenCalled();
  });

  it("projects delete-comment delegates to generic discussion comment service", async () => {
    const program = createProgram();
    const commentId = "11111111-1111-4111-8111-111111111111";

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "delete-comment",
      commentId,
    ]);

    expect(deleteDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      commentId,
      "project",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "discussion-comment-1",
      success: true,
    });
  });

  it("projects delete-reply delegates to discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "delete-reply",
      "reply-1",
    ]);

    expect(deleteDiscussionReply).toHaveBeenCalledWith(
      expect.anything(),
      "reply-1",
      "project",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "discussion-reply-1",
      success: true,
    });
  });

  it("projects resolve delegates to discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "resolve",
      "thread-1",
    ]);

    expect(resolveDiscussion).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread-1",
      entityKind: "project",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("projects resolve forwards --with-comment as resolvingCommentId", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "resolve",
      "thread-1",
      "--with-comment",
      "comment-123",
    ]);

    expect(resolveDiscussion).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread-1",
      resolvingCommentId: "comment-123",
      entityKind: "project",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("projects unresolve delegates to discussion service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "unresolve",
      "thread-1",
    ]);

    expect(unresolveDiscussion).toHaveBeenCalledWith(
      expect.anything(),
      "thread-1",
      "project",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "discussion-root-1" });
  });

  it("projects threads react delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
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
        expectedEntityKind: "project",
        emoji: "🎉",
      },
    );
  });

  it("projects threads unreact supports --shortcode", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
      "threads",
      "unreact",
      "thread-1",
      "--shortcode",
      "thumbs_up",
    ]);

    expect(deleteDiscussionCommentReactionByEmoji).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "thread-1",
        target: "thread",
        expectedEntityKind: "project",
        emoji: "👍",
      },
    );
  });

  it("projects replies unreact-id delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "projects",
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
        expectedEntityKind: "project",
        reactionId: "reaction-123",
      },
    );
  });
});

describe("projects update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("rejects update with no options", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("accepts update with valid option", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
      "--name",
      "New Name",
    ]);

    expect(updateProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      expect.objectContaining({ name: "New Name" }),
    );
  });
});
