import type { Command } from "commander";
import { type CommandOptions, createContext } from "../common/context.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import {
  createComment,
  deleteComment,
  listComments,
  replyToComment,
  updateComment,
} from "../services/comment-service.js";

interface CreateCommentOptions extends CommandOptions {
  body?: string;
}

interface ListCommentOptions extends CommandOptions {
  limit?: string;
  after?: string;
}

interface ReplyCommentOptions extends CommandOptions {
  body?: string;
}

interface EditCommentOptions extends CommandOptions {
  body?: string;
}

export const COMMENTS_META: DomainMeta = {
  name: "comments",
  summary: "discussion threads on issues (list, create, reply, edit, delete)",
  context:
    "a comment is a text entry on an issue. comments support markdown and threaded replies via parentId.",
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    comment: "comment identifier (UUID only)",
  },
  seeAlso: ["issues read <issue>"],
};

export function setupCommentsCommands(program: Command): void {
  const comments = program
    .command("comments")
    .description("Comment operations");

  comments.action(() => comments.help());

  comments
    .command("list <issue>")
    .description("list comments on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("-l, --limit <n>", "max results", "25")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          ListCommentOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        const limit = parseLimit(options.limit || "25");
        const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);
        const result = await listComments(ctx.gql, resolvedIssueId, {
          limit,
          after: options.after,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("create <issue>")
    .description("create a comment on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--body <text>", "comment body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          CreateCommentOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        if (!options.body) {
          throw new Error("--body is required");
        }

        const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);
        const result = await createComment(ctx.gql, {
          issueId: resolvedIssueId,
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("reply <comment>")
    .description("reply to a comment")
    .option("--body <text>", "reply body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, options, command] = args as [
          string,
          ReplyCommentOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        if (!options.body) {
          throw new Error("--body is required");
        }

        const result = await replyToComment(ctx.gql, {
          parentId: comment,
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("edit <comment>")
    .description("edit a comment")
    .option("--body <text>", "new comment body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, options, command] = args as [
          string,
          EditCommentOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        if (!options.body) {
          throw new Error("--body is required");
        }

        const result = await updateComment(ctx.gql, comment, {
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("delete <comment>")
    .description("delete a comment")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, , command] = args as [string, unknown, Command];
        const ctx = createContext(command.parent!.parent!.opts());

        const result = await deleteComment(ctx.gql, comment);

        outputSuccess(result);
      }),
    );

  comments
    .command("usage")
    .description("show detailed usage for comments")
    .action(() => {
      console.log(formatDomainUsage(comments, COMMENTS_META));
    });
}
