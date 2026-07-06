import type { Command } from "commander";
import {
  type CommandContext,
  type CommandOptions,
  createContext,
  getRootOpts,
} from "../common/context.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import { asUuid } from "../common/identifier.js";
import { emojiChoices, issueChoices } from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import { makeChoicePicker } from "../common/interactive/pickers.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
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

/** Create-wizard shape: the create options plus the `issue` positional. */
type CreateWizardOptions = CreateCommentOptions &
  Record<string, unknown> & { body?: string };

/**
 * Interactive wizard for `comments create`. The `<issue>` positional is filled
 * by the shared issue picker (see {@link issuePicker}); `--body` becomes a
 * required text field. The command body downstream is unchanged.
 */
export const commentCreateSpec: PromptSpec<CreateWizardOptions> = {
  intro: "Add a comment to an issue",
  fields: [
    { name: "body", kind: "multiline", message: "Body", required: true },
  ],
};

/** Reply/edit wizard shape: `--body` required text. */
type BodyWizardOptions = { body?: string } & Record<string, unknown>;

export const commentReplySpec: PromptSpec<BodyWizardOptions> = {
  intro: "Reply to a discussion thread",
  fields: [
    { name: "body", kind: "multiline", message: "Body", required: true },
  ],
};

export const commentEditSpec: PromptSpec<BodyWizardOptions> = {
  intro: "Edit a comment",
  fields: [
    { name: "body", kind: "multiline", message: "Body", required: true },
  ],
};

/**
 * Entity picker for an absent `<issue>` positional. Returns the selected
 * issue's identifier (which `resolveIssueId` accepts). Shared loader in
 * choices.ts keeps it in sync with the issues domain.
 */
const issuePicker = makeChoicePicker("Issue", issueChoices);

/**
 * Cross-field picker for an absent comment/thread positional. First picks the
 * parent issue, then lists that issue's root discussion threads and returns the
 * selected comment's UUID (which `asUuid` accepts unchanged downstream).
 */
async function commentPicker(
  ctx: CommandContext,
  io: PromptIO,
): Promise<string> {
  const issueIdentifier = await issuePicker(ctx, io);
  const issueId = await resolveIssueId(ctx.gql, issueIdentifier);
  const { nodes } = await listDiscussionsForIssue(ctx.gql, issueId, {
    limit: 50,
  });
  const options = nodes.map((thread) => ({
    value: thread.id,
    label: thread.body.split("\n")[0]?.slice(0, 72) || thread.id,
    ...(thread.user?.displayName ? { hint: thread.user.displayName } : {}),
  }));
  if (options.length === 0) {
    throw invalidParameterError(
      "comment",
      "the selected issue has no discussion threads",
    );
  }
  const answer = await io.select({ message: "Comment", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

/** Emoji picker for an absent `[emoji]` positional. */
const emojiPicker = makeChoicePicker("Reaction", async () => emojiChoices());

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * Fill an absent comment/thread positional via {@link commentPicker} when
 * gating allows, else preserve the old missing-argument error.
 */
async function resolveCommentPositional(
  ctx: CommandContext,
  command: Command,
  argName: string,
  value: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: value === undefined,
      positional: { name: argName, value, picker: commentPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError(argName, "is required");
  }
  return filled.positional;
}

/**
 * Fill an absent `[emoji]` positional via the emoji picker when gating allows.
 * Returns the (possibly still-undefined) emoji so the existing
 * `resolveReactionEmojiInput` keeps ownership of the emoji-or-shortcode
 * validation for the non-interactive path.
 */
async function resolveEmojiPositional(
  ctx: CommandContext,
  command: Command,
  emoji: string | undefined,
  shortcode: string | undefined,
): Promise<string | undefined> {
  // A --shortcode already fully determines the emoji, so never offer the
  // picker in that case: it would force the user to pick a glyph and then
  // collide with the shortcode in resolveReactionEmojiInput ("cannot provide
  // both"). Only prompt for a genuinely absent emoji.
  if (shortcode !== undefined) {
    return emoji;
  }
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: emoji === undefined,
      positional: { name: "emoji", value: emoji, picker: emojiPicker },
    },
  );
  return filled.positional;
}

export const COMMENTS_META: DomainMeta = {
  name: "comments",
  summary:
    "deprecated compatibility facade for issue discussions with root-thread-only reply support",
  context:
    "the comments domain remains operational as an intentionally narrowed compatibility layer. compatibility mode supports replying by root thread ID only, nested-reply targets are not supported in compatibility mode, and edit/delete accept either root thread IDs or reply IDs for backward compatibility. new workflows should migrate to domain-centric issues discussion commands (issues discuss/discussions/replies/reply/edit-reply/delete-reply). Run in a terminal with -i (or omit a required arg) to pick the issue/comment and enter the body interactively.",
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
    .command("list [issue]")
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
        const [issueArg, options, command] = args as [
          string | undefined,
          ListCommentOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issue = await resolveIssuePositional(ctx, command, issueArg);

        const limit = parseLimit(options.limit || "25");
        const resolvedIssueId = await resolveIssueId(ctx.gql, issue);
        const result = await listDiscussionsForIssue(
          ctx.gql,
          resolvedIssueId,
          buildPaginationOptions(limit, options.after),
        );

        outputSuccess(result);
      }),
    );

  comments
    .command("create [issue]")
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
        const [issueArg, options, command] = args as [
          string | undefined,
          CreateCommentOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          CreateWizardOptions,
          string
        >(ctx, getRootOpts(command), {
          spec: commentCreateSpec,
          options: options as CreateWizardOptions,
          missingRequired: issueArg === undefined || options.body === undefined,
          positional: { name: "issue", value: issueArg, picker: issuePicker },
        });
        if (filled.positional === undefined) {
          throw invalidParameterError("issue", "is required");
        }
        const issue = filled.positional;
        const body = filled.options.body;

        if (!body) {
          throw invalidParameterError("--body", "is required");
        }

        const resolvedIssueId = await resolveIssueId(ctx.gql, issue);
        const result = await startIssueDiscussion(ctx.gql, {
          issueId: resolvedIssueId,
          body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("reply [thread]")
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
        const [threadArg, options, command] = args as [
          string | undefined,
          ReplyCommentOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<BodyWizardOptions, string>(
          ctx,
          getRootOpts(command),
          {
            spec: commentReplySpec,
            options: options as BodyWizardOptions,
            missingRequired:
              threadArg === undefined || options.body === undefined,
            positional: {
              name: "thread",
              value: threadArg,
              picker: commentPicker,
            },
          },
        );
        if (filled.positional === undefined) {
          throw invalidParameterError("thread", "is required");
        }
        const thread = filled.positional;
        const body = filled.options.body;

        if (!body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await replyToDiscussion(ctx.gql, {
          threadId: asUuid(thread),
          body,
          entityKind: "issue",
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("edit [comment]")
    .description(
      "deprecated compatibility: edit a discussion comment (accepts root thread ID or reply ID; migrate reply workflows to `issues edit-reply <reply> --body <text>`)",
    )
    .addHelpText("after", "\nPrefer: `issues edit-reply <reply> --body <text>`")
    .option("--body <text>", "new comment body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [commentArg, options, command] = args as [
          string | undefined,
          EditCommentOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<BodyWizardOptions, string>(
          ctx,
          getRootOpts(command),
          {
            spec: commentEditSpec,
            options: options as BodyWizardOptions,
            missingRequired:
              commentArg === undefined || options.body === undefined,
            positional: {
              name: "comment",
              value: commentArg,
              picker: commentPicker,
            },
          },
        );
        if (filled.positional === undefined) {
          throw invalidParameterError("comment", "is required");
        }
        const comment = filled.positional;
        const body = filled.options.body;

        if (!body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await editDiscussionComment(ctx.gql, asUuid(comment), {
          body,
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("delete [comment]")
    .description(
      "deprecated compatibility: delete a discussion comment (accepts root thread ID or reply ID; migrate reply workflows to `issues delete-reply <reply>`)",
    )
    .addHelpText("after", "\nPrefer: `issues delete-reply <reply>`")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [commentArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const comment = await resolveCommentPositional(
          ctx,
          command,
          "comment",
          commentArg,
        );

        const result = await deleteDiscussionComment(ctx.gql, asUuid(comment));

        outputSuccess(result);
      }),
    );

  comments
    .command("react [comment] [emoji]")
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
        const [commentArg, emojiArg, options, command] = args as [
          string | undefined,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const comment = await resolveCommentPositional(
          ctx,
          command,
          "comment",
          commentArg,
        );
        const emoji = await resolveEmojiPositional(
          ctx,
          command,
          emojiArg,
          options.shortcode,
        );

        const result = await createIssueDiscussionCommentReaction(ctx.gql, {
          commentId: asUuid(comment),
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  comments
    .command("unreact [comment] [emoji]")
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
        const [commentArg, emojiArg, options, command] = args as [
          string | undefined,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const comment = await resolveCommentPositional(
          ctx,
          command,
          "comment",
          commentArg,
        );
        const emoji = await resolveEmojiPositional(
          ctx,
          command,
          emojiArg,
          options.shortcode,
        );

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

/**
 * Fill an absent `[issue]` positional via the shared issue picker when gating
 * allows, else preserve the old missing-argument error.
 */
async function resolveIssuePositional(
  ctx: CommandContext,
  command: Command,
  issue: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: issue === undefined,
      positional: { name: "issue", value: issue, picker: issuePicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("issue", "is required");
  }
  return filled.positional;
}
