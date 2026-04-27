import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: { sdk: {} },
  })),
}));

vi.mock("../../../src/common/output.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/output.js")>();
  return {
    ...actual,
    outputSuccess: vi.fn(),
  };
});

vi.mock("../../../src/resolvers/issue-resolver.js", () => ({
  resolveIssueId: vi.fn().mockResolvedValue("resolved-issue-uuid"),
}));

vi.mock("../../../src/services/discussion-service.js", () => ({
  createIssueDiscussionCommentReaction: vi
    .fn()
    .mockResolvedValue({ id: "reaction-1" }),
  deleteIssueDiscussionCommentReactionByEmoji: vi
    .fn()
    .mockResolvedValue({ id: "reaction-1", success: true }),
  deleteIssueDiscussionCommentReactionById: vi
    .fn()
    .mockResolvedValue({ id: "reaction-1", success: true }),
  listDiscussionsForIssue: vi.fn().mockResolvedValue({
    nodes: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
  }),
  startIssueDiscussion: vi.fn().mockResolvedValue({ id: "discussion-root-1" }),
  replyToDiscussion: vi.fn().mockResolvedValue({ id: "discussion-reply-1" }),
  editDiscussionComment: vi
    .fn()
    .mockResolvedValue({ id: "discussion-comment-1" }),
  deleteDiscussionComment: vi
    .fn()
    .mockResolvedValue({ id: "discussion-comment-1", success: true }),
}));

import { setupCommentsCommands } from "../../../src/commands/comments.js";
import { resolveIssueId } from "../../../src/resolvers/issue-resolver.js";
import {
  createIssueDiscussionCommentReaction,
  deleteDiscussionComment,
  deleteIssueDiscussionCommentReactionByEmoji,
  deleteIssueDiscussionCommentReactionById,
  editDiscussionComment,
  listDiscussionsForIssue,
  replyToDiscussion,
  startIssueDiscussion,
} from "../../../src/services/discussion-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupCommentsCommands(program);
  return program;
}

describe("comments compatibility delegation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("comments help includes deprecation status and migration hints", () => {
    const program = createProgram();
    const comments = program.commands.find(
      (command) => command.name() === "comments",
    );

    expect(comments).toBeDefined();

    const commentsHelp = comments!.helpInformation();

    expect(commentsHelp).toContain(
      "Deprecated compatibility facade for issue discussions",
    );
    expect(commentsHelp).toMatch(/Prefer the `issues`\s+discussion commands/i);
    expect(commentsHelp).toMatch(
      /migrate to `issues\s+discussions\s+<issue>`/i,
    );
    expect(commentsHelp).toMatch(
      /nested-reply\s+targets are not\s+supported in compatibility mode/i,
    );
  });

  it("comments reply help clarifies root discussion thread ID semantics", () => {
    const program = createProgram();
    const comments = program.commands.find(
      (command) => command.name() === "comments",
    );

    expect(comments).toBeDefined();

    const reply = comments!.commands.find(
      (command) => command.name() === "reply",
    );

    expect(reply).toBeDefined();

    const replyHelp = reply!.helpInformation();

    expect(replyHelp).toContain(
      "deprecated compatibility: reply to a root discussion thread",
    );
    expect(replyHelp).toMatch(
      /migrate\s+to `issues reply <thread> --body <text>`/,
    );
    expect(replyHelp).toMatch(/requires root\s+thread ID/);
    expect(replyHelp).toMatch(
      /Nested-reply targets are not\s+supported in compatibility mode/i,
    );
    expect(replyHelp).toContain("reply [options] <thread>");
  });

  it("comments list resolves issue and delegates to listDiscussionsForIssue", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "list",
      "ENG-42",
      "--limit",
      "10",
      "--after",
      "cursor-1",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(listDiscussionsForIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      { limit: 10, after: "cursor-1" },
    );
  });

  it("comments create resolves issue and delegates to startIssueDiscussion", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "create",
      "ENG-42",
      "--body",
      "Kickoff discussion",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(startIssueDiscussion).toHaveBeenCalledWith(expect.anything(), {
      issueId: "resolved-issue-uuid",
      body: "Kickoff discussion",
    });
  });

  it("comments create requires --body", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "comments", "create", "ENG-42"]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(startIssueDiscussion).not.toHaveBeenCalled();
  });

  it("comments reply constrains replies to issue discussion threads", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "reply",
      "thread-1",
      "--body",
      "Reply body",
    ]);

    expect(replyToDiscussion).toHaveBeenCalledWith(expect.anything(), {
      threadId: "thread-1",
      body: "Reply body",
      entityKind: "issue",
    });
  });

  it("comments edit delegates to editDiscussionComment", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "edit",
      "reply-1",
      "--body",
      "Edited body",
    ]);

    expect(editDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      "reply-1",
      { body: "Edited body" },
    );
  });

  it("comments reply requires --body", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "comments", "reply", "thread-1"]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(replyToDiscussion).not.toHaveBeenCalled();
  });

  it("comments edit requires --body", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "comments", "edit", "reply-1"]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --body: is required"),
    );
    expect(editDiscussionComment).not.toHaveBeenCalled();
  });

  it("comments edit accepts root thread IDs for compatibility", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "edit",
      "root-1",
      "--body",
      "Edited root",
    ]);

    expect(editDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      "root-1",
      { body: "Edited root" },
    );
  });

  it("comments delete delegates to deleteDiscussionComment", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "comments", "delete", "reply-1"]);

    expect(deleteDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      "reply-1",
    );
  });

  it("comments delete accepts root thread IDs for compatibility", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "comments", "delete", "root-1"]);

    expect(deleteDiscussionComment).toHaveBeenCalledWith(
      expect.anything(),
      "root-1",
    );
  });

  it("comments react help points users to domain-native issue reaction commands", () => {
    const program = createProgram();
    const comments = program.commands.find(
      (command) => command.name() === "comments",
    );
    const react = comments!.commands.find(
      (command) => command.name() === "react",
    );

    expect(react).toBeDefined();
    expect(react!.helpInformation()).toMatch(
      /DEPRECATED compatibility command/i,
    );
    expect(react!.helpInformation()).toMatch(
      /Prefer: `issues threads react <thread>`|`issues replies react <reply>`/,
    );
  });

  it("comments react delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "react",
      "comment-1",
      "👍",
    ]);

    expect(createIssueDiscussionCommentReaction).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "comment-1",
        emoji: "👍",
      },
    );
  });

  it("comments react supports shortcode emoji input", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "react",
      "comment-1",
      "--shortcode",
      "thumbs_up",
    ]);

    expect(createIssueDiscussionCommentReaction).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "comment-1",
        emoji: "👍",
      },
    );
  });

  it("comments unreact delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "unreact",
      "comment-1",
      "👍",
    ]);

    expect(deleteIssueDiscussionCommentReactionByEmoji).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "comment-1",
        emoji: "👍",
      },
    );
  });

  it("comments unreact supports shortcode emoji input", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "unreact",
      "comment-1",
      "--shortcode",
      "thumbs_up",
    ]);

    expect(deleteIssueDiscussionCommentReactionByEmoji).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "comment-1",
        emoji: "👍",
      },
    );
  });

  it("comments unreact-id delegates to comment reaction service", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "comments",
      "unreact-id",
      "comment-1",
      "reaction-1",
    ]);

    expect(deleteIssueDiscussionCommentReactionById).toHaveBeenCalledWith(
      expect.anything(),
      {
        commentId: "comment-1",
        reactionId: "reaction-1",
      },
    );
  });
});
