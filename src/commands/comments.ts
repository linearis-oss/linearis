import type { Command } from "commander";
import { type CommandOptions, createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import { createComment } from "../services/comment-service.js";

interface CreateCommentOptions extends CommandOptions {
  body?: string;
}

export const COMMENTS_META: DomainMeta = {
  name: "comments",
  summary: "discussion threads on issues",
  context: "a comment is a text entry on an issue. comments support markdown.",
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
  },
  seeAlso: ["issues read <issue>"],
};

export function setupCommentsCommands(program: Command): void {
  const comments = program
    .command("comments")
    .description("Comment operations");

  comments.action(() => comments.help());

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
    .command("usage")
    .description("show detailed usage for comments")
    .action(() => {
      console.log(formatDomainUsage(comments, COMMENTS_META));
    });
}
