import type { Command } from "commander";
import {
  type CommandOptions,
  createContext,
  getRootOpts,
} from "../common/context.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import { invalidParameterError } from "../common/errors.js";
import { asUuid } from "../common/identifier.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { buildPaginationOptions } from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import {
  createIssueDiscussionCommentReaction,
  deleteDiscussionComment,
  deleteIssueDiscussionCommentReactionByEmoji,
  deleteIssueDiscussionCommentReactionById,
  editDiscussionComment,
  listDiscussionsForIssue,
  replyToDiscussion,
  startIssueDiscussion,
} from "../services/discussion-service.js";

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

interface ReactionOptions extends CommandOptions {
  shortcode?: string;
}

export const COMMENTS_META: DomainMeta = {
  name: "comments",
  summary:
    "deprecated compatibility facade for issue discussions with root-thread-only reply support",
  context:
    "the comments domain remains operational as an intentionally narrowed compatibility layer. compatibility mode supports replying by root thread ID only, nested-reply targets are not supported in compatibility mode, and edit/delete accept either root thread IDs or reply IDs for backward compatibility. new workflows should migrate to domain-centric issues discussion commands (issues discuss/discussions/replies/reply/edit-reply/delete-reply).",
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    comment: "thread/reply identifier (UUID only)",
  },
  seeAlso: [
    "issues discuss <issue>",
    "issues discussions <issue>",
    "issues replies <thread>",
    "issues reply <thread>",
    "issues edit-reply <reply>",
    "issues delete-reply <reply>",
  ],
};

export function setupCommentsCommands(program: Command): void {
  const comments = program
    .command("comments")
    .description(
      "Deprecated compatibility facade for issue discussions. Prefer the `issues` discussion commands.",
    )
    .addHelpText(
      "after",
      "\nDEPRECATED: kept for compatibility. Prefer `issues discuss`, `issues discussions`, `issues replies`, `issues reply`, `issues edit-reply`, and `issues delete-reply`.\nCompatibility mode only supports replying by root thread ID (nested-reply targets are not supported).\nCompatibility edit/delete accept root thread IDs and reply IDs.",
    );

  comments.action(() => comments.help());

  comments
    .command("list <issue>")
    .description(
      "deprecated compatibility: list root issue discussions (migrate to `issues discussions <issue>`)",
    )
    .addHelpText("after", "\nPrefer: `issues discussions <issue>`")
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
        const ctx = createContext(getRootOpts(command));

        const limit = parseLimit(options.limit || "25");
        const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);
        const result = await listDiscussionsForIssue(
          ctx.gql,
          resolvedIssueId,
          buildPaginationOptions(limit, options.after),
        );

        outputSuccess(result);
      }),
    );

  comments
    .command("create <issue>")
    .description(
      "deprecated compatibility: start an issue discussion (migrate to `issues discuss <issue> --body <text>`)",
    )
    .addHelpText("after", "\nPrefer: `issues discuss <issue> --body <text>`")
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
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);
        const result = await startIssueDiscussion(ctx.gql, {
          issueId: resolvedIssueId,
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("reply <thread>")
    .description(
      "deprecated compatibility: reply to a root discussion thread (requires root thread ID; nested-reply targets are not supported in compatibility mode; migrate to `issues reply <thread> --body <text>`)",
    )
    .addHelpText("after", "\nPrefer: `issues reply <thread> --body <text>`")
    .addHelpText(
      "after",
      "\nImportant: `<thread>` must be the root discussion thread ID, not a reply ID.",
    )
    .addHelpText(
      "after",
      "\nNested-reply targets are not supported in compatibility mode.",
    )
    .option("--body <text>", "reply body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, options, command] = args as [
          string,
          ReplyCommentOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await replyToDiscussion(ctx.gql, {
          threadId: asUuid(thread),
          body: options.body,
          entityKind: "issue",
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("edit <comment>")
    .description(
      "deprecated compatibility: edit a discussion comment (accepts root thread ID or reply ID; migrate reply workflows to `issues edit-reply <reply> --body <text>`)",
    )
    .addHelpText("after", "\nPrefer: `issues edit-reply <reply> --body <text>`")
    .option("--body <text>", "new comment body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, options, command] = args as [
          string,
          EditCommentOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await editDiscussionComment(ctx.gql, asUuid(comment), {
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("delete <comment>")
    .description(
      "deprecated compatibility: delete a discussion comment (accepts root thread ID or reply ID; migrate reply workflows to `issues delete-reply <reply>`)",
    )
    .addHelpText("after", "\nPrefer: `issues delete-reply <reply>`")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionComment(ctx.gql, asUuid(comment));

        outputSuccess(result);
      }),
    );

  comments
    .command("react <comment> [emoji]")
    .description(
      "DEPRECATED compatibility command. Prefer: `issues threads react <thread>` or `issues replies react <reply>`.",
    )
    .addHelpText(
      "after",
      "\nDEPRECATED compatibility command. Prefer: `issues threads react <thread>` or `issues replies react <reply>`.",
    )
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, emoji, options, command] = args as [
          string,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const result = await createIssueDiscussionCommentReaction(ctx.gql, {
          commentId: asUuid(comment),
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("unreact <comment> [emoji]")
    .description(
      "DEPRECATED compatibility command. Prefer: `issues threads unreact <thread>` or `issues replies unreact <reply>`.",
    )
    .addHelpText(
      "after",
      "\nDEPRECATED compatibility command. Prefer: `issues threads unreact <thread>` or `issues replies unreact <reply>`.",
    )
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, emoji, options, command] = args as [
          string,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteIssueDiscussionCommentReactionByEmoji(
          ctx.gql,
          {
            commentId: asUuid(comment),
            emoji: resolveReactionEmojiInput(emoji, options.shortcode),
          },
        );

        outputSuccess(result);
      }),
    );

  comments
    .command("unreact-id <comment> <reactionId>")
    .description(
      "DEPRECATED compatibility command. Prefer: `issues threads unreact-id <thread> <reactionId>` or `issues replies unreact-id <reply> <reactionId>`.",
    )
    .addHelpText(
      "after",
      "\nDEPRECATED compatibility command. Prefer: `issues threads unreact-id <thread> <reactionId>` or `issues replies unreact-id <reply> <reactionId>`.",
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, reactionId, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteIssueDiscussionCommentReactionById(ctx.gql, {
          commentId: asUuid(comment),
          reactionId: asUuid(reactionId),
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
