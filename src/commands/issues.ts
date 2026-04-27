import type { Command } from "commander";
import type { CommandContext } from "../common/context.js";
import { createContext, getRootOpts } from "../common/context.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import { invalidParameterError } from "../common/errors.js";
import { validateEstimateAgainstTeamConfig } from "../common/estimate-validation.js";
import {
  isUuid,
  parseDueDate,
  parseIssueIdentifier,
} from "../common/identifier.js";
import type { RawFilterFlags } from "../common/issue-filter.js";
import {
  parseEstimateOption,
  parsePriorityOption,
} from "../common/number-options.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { resolveFilterOptions } from "../common/resolve-filters.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import {
  type IssueCreateInput,
  IssueRelationType,
  type IssueUpdateInput,
} from "../gql/graphql.js";
import { resolveCycleId } from "../resolvers/cycle-resolver.js";
import {
  resolveIssueEstimateContext,
  resolveIssueId,
} from "../resolvers/issue-resolver.js";
import { resolveLabelIds } from "../resolvers/label-resolver.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveStatusId } from "../resolvers/status-resolver.js";
import {
  resolveTeamEstimateContext,
  resolveTeamId,
} from "../resolvers/team-resolver.js";
import { resolveUserId } from "../resolvers/user-resolver.js";
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
  listDiscussionsForIssue,
  listDiscussionsForIssueWithReactions,
  replyToDiscussion,
  resolveDiscussion,
  startIssueDiscussion,
  unresolveDiscussion,
} from "../services/discussion-service.js";
import { buildIssueFilter } from "../services/issue-filter.js";
import {
  createIssueRelation,
  deleteIssueRelation,
  findIssueRelation,
} from "../services/issue-relation-service.js";
import {
  archiveIssue,
  createIssue,
  deleteIssue,
  getIssue,
  getIssueByIdentifier,
  getIssueByIdentifierWithAttachments,
  getIssueByIdentifierWithComments,
  getIssueByIdentifierWithCommentThreads,
  getIssueByIdentifierWithReactions,
  getIssueWithAttachments,
  getIssueWithComments,
  getIssueWithCommentThreads,
  getIssueWithReactions,
  listIssues,
  searchIssues,
  unarchiveIssue,
  updateIssue,
} from "../services/issue-service.js";
import {
  createReactionForIssue,
  deleteOwnReactionByEmoji,
  deleteOwnReactionById,
} from "../services/reaction-service.js";

interface FilterOptions extends RawFilterFlags {
  limit: string;
  after?: string;
  query?: string;
}

interface CreateOptions {
  description?: string;
  assignee?: string;
  priority?: string;
  estimate?: string;
  project?: string;
  team?: string;
  labels?: string;
  projectMilestone?: string;
  cycle?: string;
  status?: string;
  parentTicket?: string;
  dueDate?: string;
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
}

interface UpdateOptions {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  estimate?: string;
  clearEstimate?: boolean;
  assignee?: string;
  project?: string;
  labels?: string;
  labelMode?: string;
  clearLabels?: boolean;
  parentTicket?: string;
  clearParentTicket?: boolean;
  projectMilestone?: string;
  clearProjectMilestone?: boolean;
  cycle?: string;
  clearCycle?: boolean;
  dueDate?: string;
  clearDueDate?: boolean;
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  removeRelation?: string;
}

interface ReadOptions {
  withAttachments?: boolean;
  withComments?: boolean;
  withCommentThreads?: boolean;
  withReactions?: boolean;
}

function validateReadOptions(options: ReadOptions): void {
  if (
    options.withReactions &&
    (options.withAttachments ||
      options.withComments ||
      options.withCommentThreads)
  ) {
    throw invalidParameterError(
      "--with-reactions",
      "cannot be combined with --with-attachments, --with-comments, or --with-comment-threads",
    );
  }
}

interface ReactionOptions {
  shortcode?: string;
}

interface DiscussionsOptions {
  limit?: string;
  after?: string;
  withReactions?: boolean;
}

interface DiscussionBodyOptions {
  body?: string;
}

interface ResolveDiscussionOptions {
  withComment?: string;
}

function addCommentReactionCommands(
  parent: ReturnType<Command["command"]>,
  noun: "thread" | "reply",
): void {
  parent
    .command(`react <${noun}> [emoji]`)
    .description(`add a reaction to a discussion ${noun}`)
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [commentId, emoji, options, command] = args as [
          string,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const result = await createDiscussionCommentReaction(ctx.gql, {
          commentId,
          target: noun,
          expectedEntityKind: "issue",
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  parent
    .command(`unreact <${noun}> [emoji]`)
    .description(`remove your reaction from a discussion ${noun} by emoji`)
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [commentId, emoji, options, command] = args as [
          string,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const result = await deleteDiscussionCommentReactionByEmoji(ctx.gql, {
          commentId,
          target: noun,
          expectedEntityKind: "issue",
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  parent
    .command(`unreact-id <${noun}> <reactionId>`)
    .description(
      `remove your reaction from a discussion ${noun} by reaction ID`,
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [commentId, reactionId, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const result = await deleteDiscussionCommentReactionById(ctx.gql, {
          commentId,
          target: noun,
          expectedEntityKind: "issue",
          reactionId,
        });

        outputSuccess(result);
      }),
    );
}

export const ISSUES_META: DomainMeta = {
  name: "issues",
  summary: "work items with status, priority, assignee, labels",
  context: [
    "an issue belongs to exactly one team. it has a status (e.g. backlog,",
    "todo, in progress, done — configurable per team), a priority (1-4),",
    "and can be assigned to a user. issues can have estimates; valid values",
    "are integers whose meaning depends on the team's estimation scale",
    "(fibonacci, exponential, linear, or t-shirt sizes mapped to integers).",
    "issues can have labels, a due date, belong to a project, be part of a",
    "cycle (sprint), and reference a project milestone. parent-child",
    "relationships and issue relations (blocks, blocked-by, relates-to,",
    "duplicate-of) are supported.",
  ].join("\n"),
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    title: "string",
    query: "full-text search term",
  },
  seeAlso: [
    "comments create <issue>",
    "documents list --issue <issue>",
    "attachments list <issue>",
    "issues read --with-attachments",
    "issues archive <issue>",
    "issues unarchive <issue>",
    "issues delete <issue>",
  ],
};

interface RelationAction {
  type: "blocks" | "blockedBy" | "relatesTo" | "duplicateOf" | "remove";
  targets: string[];
}

function parseRelationFlags(flags: {
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  removeRelation?: string;
}): RelationAction[] {
  const entries: Array<{
    type: RelationAction["type"];
    raw: string | undefined;
  }> = [
    { type: "blocks", raw: flags.blocks },
    { type: "blockedBy", raw: flags.blockedBy },
    { type: "relatesTo", raw: flags.relatesTo },
    { type: "duplicateOf", raw: flags.duplicateOf },
    { type: "remove", raw: flags.removeRelation },
  ];

  const actions: RelationAction[] = [];
  const hasAdd = entries.some((e) => e.type !== "remove" && e.raw);
  const hasRemove = entries.some((e) => e.type === "remove" && e.raw);

  if (hasAdd && hasRemove) {
    throw new Error("Cannot mix add and remove relation flags");
  }

  for (const { type, raw } of entries) {
    if (!raw) continue;

    const targets = [
      ...new Set(
        raw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
    if (targets.length === 0) {
      throw new Error(
        `Relation flag --${type === "remove" ? "remove-relation" : type} must not be empty`,
      );
    }
    actions.push({ type, targets });
  }

  // Cross-flag collision check
  const seen = new Map<string, string>();
  for (const action of actions) {
    for (const target of action.targets) {
      const prev = seen.get(target);
      if (prev) {
        throw new Error(
          `${target} appears in multiple relation flags (${prev} and --${action.type === "remove" ? "remove-relation" : action.type})`,
        );
      }
      seen.set(
        target,
        `--${action.type === "remove" ? "remove-relation" : action.type}`,
      );
    }
  }

  return actions;
}

async function resolveAndApplyRelations(
  ctx: CommandContext,
  issueId: string,
  actions: RelationAction[],
): Promise<void> {
  // Resolve all unique targets to UUIDs
  const uniqueTargets = new Set(actions.flatMap((a) => a.targets));
  const resolved = new Map<string, string>();
  await Promise.all(
    [...uniqueTargets].map(async (target) => {
      resolved.set(target, await resolveIssueId(ctx.sdk, target));
    }),
  );

  for (const action of actions) {
    for (const target of action.targets) {
      const targetId = resolved.get(target)!;

      switch (action.type) {
        case "blocks":
          await createIssueRelation(ctx.gql, {
            issueId,
            relatedIssueId: targetId,
            type: IssueRelationType.Blocks,
          });
          break;
        case "blockedBy":
          await createIssueRelation(ctx.gql, {
            issueId: targetId,
            relatedIssueId: issueId,
            type: IssueRelationType.Blocks,
          });
          break;
        case "relatesTo":
          await createIssueRelation(ctx.gql, {
            issueId,
            relatedIssueId: targetId,
            type: IssueRelationType.Related,
          });
          break;
        case "duplicateOf":
          await createIssueRelation(ctx.gql, {
            issueId,
            relatedIssueId: targetId,
            type: IssueRelationType.Duplicate,
          });
          break;
        case "remove": {
          const relationId = await findIssueRelation(
            ctx.gql,
            issueId,
            targetId,
          );
          await deleteIssueRelation(ctx.gql, relationId);
          break;
        }
      }
    }
  }
}

function addFilterOptions(cmd: ReturnType<Command["command"]>): typeof cmd {
  return cmd
    .option("--team <team>", "filter by team")
    .option("--assignee <user>", "filter by assignee")
    .option("--creator <user>", "filter by creator")
    .option("--project <project>", "filter by project")
    .option(
      "--status <statuses>",
      "filter by status (comma-separated, requires --team)",
    )
    .option("--label <labels>", "filter by labels (comma-separated)")
    .option("--cycle <cycle>", "filter by cycle (requires --team)")
    .option("--parent <issue>", "filter by parent issue")
    .option(
      "--milestone <milestone>",
      "filter by milestone (requires --project)",
    )
    .option("--priority <n>", "filter by priority (0-4)")
    .option("--estimate <n>", "filter by estimate")
    .option("--due-before <date>", "due before date (YYYY-MM-DD)")
    .option("--due-after <date>", "due after date (YYYY-MM-DD)")
    .option("--created-after <date>", "created after date (YYYY-MM-DD)")
    .option("--created-before <date>", "created before date (YYYY-MM-DD)")
    .option("--completed-after <date>", "completed after date (YYYY-MM-DD)")
    .option("--completed-before <date>", "completed before date (YYYY-MM-DD)")
    .option("--updated-after <date>", "updated after date (YYYY-MM-DD)")
    .option("--updated-before <date>", "updated before date (YYYY-MM-DD)")
    .option("--has-blockers", "only issues that are blocked")
    .option("--is-blocking", "only issues that block others");
}

export function setupIssuesCommands(program: Command): void {
  const issues = program.command("issues").description("Issue operations");

  issues.action(() => issues.help());

  addFilterOptions(
    issues
      .command("list")
      .description("list issues with optional filters")
      .option("--query <query>", "deprecated: use `issues search <query>`")
      .option("-l, --limit <n>", "max results", "50")
      .option("--after <cursor>", "cursor for next page"),
  ).action(
    handleCommand(async (...args: unknown[]) => {
      const [options, command] = args as [FilterOptions, Command];
      const ctx = createContext(getRootOpts(command));

      const paginationOptions = {
        limit: parseLimit(options.limit),
        after: options.after,
      };

      const filterOptions = await resolveFilterOptions(ctx, options);
      const filter = buildIssueFilter(filterOptions);

      if (options.query) {
        const result = await searchIssues(
          ctx.gql,
          options.query,
          paginationOptions,
          filter,
        );
        outputSuccess(result);
        return;
      }

      const result = await listIssues(ctx.gql, paginationOptions, filter);
      outputSuccess(result);
    }),
  );

  addFilterOptions(
    issues
      .command("search <query>")
      .description("full-text search issues")
      .option("-l, --limit <n>", "max results", "50")
      .option("--after <cursor>", "cursor for next page"),
  ).action(
    handleCommand(async (...args: unknown[]) => {
      const [query, options, command] = args as [
        string,
        FilterOptions,
        Command,
      ];
      const ctx = createContext(getRootOpts(command));

      const paginationOptions = {
        limit: parseLimit(options.limit),
        after: options.after,
      };

      const filterOptions = await resolveFilterOptions(ctx, options);
      const filter = buildIssueFilter(filterOptions);
      const result = await searchIssues(
        ctx.gql,
        query,
        paginationOptions,
        filter,
      );
      outputSuccess(result);
    }),
  );

  issues
    .command("read <issue>")
    .description("get full issue details including description")
    .option("--with-attachments", "include issue attachments")
    .option("--with-comments", "include full issue comments")
    .option(
      "--with-comment-threads",
      "group issue comments into root comments with replies",
    )
    .option("--with-reactions", "include normalized root issue reactions")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          ReadOptions,
          Command,
        ];
        validateReadOptions(options);
        const ctx = createContext(getRootOpts(command));

        if (options.withAttachments) {
          if (isUuid(issue)) {
            const result = await getIssueWithAttachments(ctx.gql, issue);
            outputSuccess(result);
          } else {
            const { teamKey, issueNumber } = parseIssueIdentifier(issue);
            const result = await getIssueByIdentifierWithAttachments(
              ctx.gql,
              teamKey,
              issueNumber,
            );
            outputSuccess(result);
          }
          return;
        }

        if (options.withCommentThreads) {
          if (isUuid(issue)) {
            const result = await getIssueWithCommentThreads(ctx.gql, issue);
            outputSuccess(result);
          } else {
            const { teamKey, issueNumber } = parseIssueIdentifier(issue);
            const result = await getIssueByIdentifierWithCommentThreads(
              ctx.gql,
              teamKey,
              issueNumber,
            );
            outputSuccess(result);
          }
          return;
        }

        if (options.withComments) {
          if (isUuid(issue)) {
            const result = await getIssueWithComments(ctx.gql, issue);
            outputSuccess(result);
          } else {
            const { teamKey, issueNumber } = parseIssueIdentifier(issue);
            const result = await getIssueByIdentifierWithComments(
              ctx.gql,
              teamKey,
              issueNumber,
            );
            outputSuccess(result);
          }
          return;
        }

        if (options.withReactions) {
          if (isUuid(issue)) {
            const result = await getIssueWithReactions(ctx.gql, issue);
            outputSuccess(result);
          } else {
            const { teamKey, issueNumber } = parseIssueIdentifier(issue);
            const result = await getIssueByIdentifierWithReactions(
              ctx.gql,
              teamKey,
              issueNumber,
            );
            outputSuccess(result);
          }
          return;
        }

        if (isUuid(issue)) {
          const result = await getIssue(ctx.gql, issue);
          outputSuccess(result);
        } else {
          const { teamKey, issueNumber } = parseIssueIdentifier(issue);
          const result = await getIssueByIdentifier(
            ctx.gql,
            teamKey,
            issueNumber,
          );
          outputSuccess(result);
        }
      }),
    );

  issues
    .command("react <issue> [emoji]")
    .description("add a root reaction to an issue")
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, emoji, options, command] = args as [
          string,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await createReactionForIssue(ctx.gql, {
          issueId,
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("unreact <issue> [emoji]")
    .description("remove your root reaction from an issue by emoji")
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, emoji, options, command] = args as [
          string,
          string | undefined,
          ReactionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await deleteOwnReactionByEmoji(ctx.gql, {
          kind: "issue",
          id: issueId,
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("unreact-id <issue> <reactionId>")
    .description("remove your root reaction from an issue by reaction ID")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, reactionId, , command] = args as [
          string,
          string,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await deleteOwnReactionById(ctx.gql, {
          kind: "issue",
          id: issueId,
          reactionId,
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("discuss <issue>")
    .description("start a discussion thread on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--body <text>", "discussion body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          DiscussionBodyOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await startIssueDiscussion(ctx.gql, {
          issueId,
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("discussions <issue>")
    .description("list root discussion threads on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("-l, --limit <n>", "max results", "25")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          DiscussionsOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const issueId = await resolveIssueId(ctx.sdk, issue);
        const paginationOptions = {
          limit: parseLimit(options.limit || "25"),
          after: options.after,
        };
        const result = options.withReactions
          ? await listDiscussionsForIssueWithReactions(
              ctx.gql,
              issueId,
              paginationOptions,
            )
          : await listDiscussionsForIssue(ctx.gql, issueId, paginationOptions);

        outputSuccess(result);
      }),
    );

  const issueThreads = issues
    .command("threads")
    .description("discussion thread reaction operations");
  addCommentReactionCommands(issueThreads, "thread");

  const issueReplies = issues
    .command("replies <thread>")
    .description("list replies in a root discussion thread")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, options, command] = args as [
          string,
          DiscussionsOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const paginationOptions = {
          limit: parseLimit(options.limit || "50"),
          after: options.after,
        };
        const result = options.withReactions
          ? await listDiscussionRepliesWithReactions(
              ctx.gql,
              thread,
              paginationOptions,
              "issue",
            )
          : await listDiscussionReplies(
              ctx.gql,
              thread,
              paginationOptions,
              "issue",
            );

        outputSuccess(result);
      }),
    );
  addCommentReactionCommands(issueReplies, "reply");

  issues
    .command("reply <thread>")
    .description("reply to a root discussion thread")
    .addHelpText(
      "after",
      "\nImportant: `<thread>` must be a root discussion thread ID.",
    )
    .option("--body <text>", "reply body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, options, command] = args as [
          string,
          DiscussionBodyOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await replyToDiscussion(ctx.gql, {
          threadId: thread,
          body: options.body,
          entityKind: "issue",
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("edit <comment>")
    .description("edit a root discussion or reply comment")
    .option("--body <text>", "new comment body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, options, command] = args as [
          string,
          DiscussionBodyOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await editDiscussionComment(
          ctx.gql,
          comment,
          {
            body: options.body,
          },
          "issue",
        );

        outputSuccess(result);
      }),
    );

  issues
    .command("edit-reply <reply>")
    .description("edit a discussion reply")
    .option("--body <text>", "new reply body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [reply, options, command] = args as [
          string,
          DiscussionBodyOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const result = await editDiscussionReply(
          ctx.gql,
          reply,
          {
            body: options.body,
          },
          "issue",
        );

        outputSuccess(result);
      }),
    );

  issues
    .command("delete-comment <comment>")
    .description("delete a root discussion or reply comment")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionComment(ctx.gql, comment, "issue");

        outputSuccess(result);
      }),
    );

  issues
    .command("delete-reply <reply>")
    .description("delete a discussion reply")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [reply, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionReply(ctx.gql, reply, "issue");

        outputSuccess(result);
      }),
    );

  issues
    .command("resolve <thread>")
    .description("resolve a discussion thread")
    .option("--with-comment <comment>", "comment to mark as resolving comment")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, options, command] = args as [
          string,
          ResolveDiscussionOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const result = await resolveDiscussion(ctx.gql, {
          threadId: thread,
          resolvingCommentId: options.withComment,
          entityKind: "issue",
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("unresolve <thread>")
    .description("unresolve a discussion thread")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await unresolveDiscussion(ctx.gql, thread, "issue");

        outputSuccess(result);
      }),
    );

  issues
    .command("create <title>")
    .description("create new issue")
    .option("--description <text>", "issue body")
    .option("--assignee <user>", "assign to user")
    .option("--priority <1-4>", "1=urgent 2=high 3=medium 4=low")
    .option("--project <project>", "add to project")
    .option("--team <team>", "target team (required)")
    .option("--labels <labels>", "comma-separated label names or UUIDs")
    .option("--project-milestone <ms>", "set milestone (requires --project)")
    .option("--cycle <cycle>", "add to cycle (requires --team)")
    .option("--status <status>", "set status")
    .option("--estimate <n>", "set estimate")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--due-date <date>", "due date (YYYY-MM-DD)")
    .option("--blocks <issue>", "this issue blocks <issue>")
    .option("--blocked-by <issue>", "this issue is blocked by <issue>")
    .option("--relates-to <issue>", "this issue relates to <issue>")
    .option("--duplicate-of <issue>", "this issue duplicates <issue>")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [title, options, command] = args as [
          string,
          CreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const relationActions = parseRelationFlags(options);

        const parsedPriority =
          options.priority !== undefined
            ? parsePriorityOption(options.priority)
            : undefined;
        const parsedEstimate =
          options.estimate !== undefined
            ? parseEstimateOption(options.estimate)
            : undefined;

        if (!options.team) {
          throw new Error("--team is required");
        }

        const teamEstimateContext =
          parsedEstimate !== undefined
            ? await resolveTeamEstimateContext(ctx.sdk, options.team)
            : undefined;

        const teamId = teamEstimateContext
          ? teamEstimateContext.teamId
          : await resolveTeamId(ctx.sdk, options.team);

        if (parsedEstimate !== undefined && teamEstimateContext) {
          validateEstimateAgainstTeamConfig(parsedEstimate, {
            teamKey: teamEstimateContext.teamKey,
            issueEstimationType: teamEstimateContext.issueEstimationType,
            issueEstimationExtended:
              teamEstimateContext.issueEstimationExtended,
            issueEstimationAllowZero:
              teamEstimateContext.issueEstimationAllowZero,
          });
        }

        const input: IssueCreateInput = {
          title,
          teamId,
        };

        if (options.description) {
          input.description = options.description;
        }

        if (options.assignee) {
          input.assigneeId = await resolveUserId(ctx.sdk, options.assignee);
        }

        if (parsedPriority !== undefined) {
          input.priority = parsedPriority;
        }

        if (parsedEstimate !== undefined) {
          input.estimate = parsedEstimate;
        }

        if (options.project) {
          input.projectId = await resolveProjectId(ctx.sdk, options.project);
        }

        if (options.labels) {
          const labelNames = options.labels.split(",").map((l) => l.trim());
          input.labelIds = await resolveLabelIds(ctx.sdk, labelNames);
        }

        if (options.projectMilestone) {
          if (!options.project) {
            throw new Error(
              "--project-milestone requires --project to be specified",
            );
          }
          input.projectMilestoneId = await resolveMilestoneId(
            ctx.gql,
            ctx.sdk,
            options.projectMilestone,
            options.project,
          );
        }

        if (options.cycle) {
          input.cycleId = await resolveCycleId(
            ctx.sdk,
            options.cycle,
            options.team,
          );
        }

        if (options.status) {
          input.stateId = await resolveStatusId(
            ctx.sdk,
            options.status,
            teamId,
          );
        }

        if (options.parentTicket) {
          input.parentId = await resolveIssueId(ctx.sdk, options.parentTicket);
        }

        if (options.dueDate) {
          input.dueDate = parseDueDate(options.dueDate);
        }

        const result = await createIssue(ctx.gql, input);

        if (relationActions.length > 0) {
          await resolveAndApplyRelations(ctx, result.id, relationActions);
        }

        outputSuccess(result);
      }),
    );

  issues
    .command("update <issue>")
    .description("update an existing issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--title <text>", "new title")
    .option("--description <text>", "new description")
    .option("--status <status>", "new status")
    .option("--priority <1-4>", "new priority")
    .option("--assignee <user>", "new assignee")
    .option("--project <project>", "new project")
    .option("--labels <labels>", "labels to apply (comma-separated)")
    .option("--label-mode <mode>", "add | overwrite")
    .option("--clear-labels", "remove all labels")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--clear-parent-ticket", "clear parent")
    .option("--project-milestone <ms>", "set project milestone")
    .option("--clear-project-milestone", "clear project milestone")
    .option("--cycle <cycle>", "set cycle")
    .option("--clear-cycle", "clear cycle")
    .option("--estimate <n>", "new estimate")
    .option("--clear-estimate", "clear estimate")
    .option("--due-date <date>", "set due date (YYYY-MM-DD)")
    .option("--clear-due-date", "clear due date")
    .option("--blocks <issue>", "add blocks relation")
    .option("--blocked-by <issue>", "add blocked-by relation")
    .option("--relates-to <issue>", "add relates-to relation")
    .option("--duplicate-of <issue>", "add duplicate relation")
    .option("--remove-relation <issue>", "remove relation with <issue>")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          UpdateOptions,
          Command,
        ];
        if (options.parentTicket && options.clearParentTicket) {
          throw new Error(
            "Cannot use --parent-ticket and --clear-parent-ticket together",
          );
        }

        if (options.projectMilestone && options.clearProjectMilestone) {
          throw new Error(
            "Cannot use --project-milestone and --clear-project-milestone together",
          );
        }

        if (options.estimate !== undefined && options.clearEstimate) {
          throw new Error(
            "Cannot use --estimate and --clear-estimate together",
          );
        }

        if (options.cycle && options.clearCycle) {
          throw new Error("Cannot use --cycle and --clear-cycle together");
        }

        if (options.dueDate && options.clearDueDate) {
          throw new Error(
            "Cannot use --due-date and --clear-due-date together",
          );
        }

        if (options.labelMode && !options.labels) {
          throw new Error("--label-mode requires --labels to be specified");
        }

        if (options.clearLabels && options.labels) {
          throw new Error("--clear-labels cannot be used with --labels");
        }

        if (options.clearLabels && options.labelMode) {
          throw new Error("--clear-labels cannot be used with --label-mode");
        }

        if (
          options.labelMode &&
          !["add", "overwrite"].includes(options.labelMode)
        ) {
          throw new Error("--label-mode must be either 'add' or 'overwrite'");
        }

        const parsedPriority =
          options.priority !== undefined
            ? parsePriorityOption(options.priority)
            : undefined;
        const parsedEstimate =
          options.estimate !== undefined
            ? parseEstimateOption(options.estimate)
            : undefined;

        const relationActions = parseRelationFlags(options);

        const ctx = createContext(getRootOpts(command));

        const issueEstimateContext =
          parsedEstimate !== undefined
            ? await resolveIssueEstimateContext(ctx.sdk, issue)
            : undefined;

        const resolvedIssueId = issueEstimateContext
          ? issueEstimateContext.issueId
          : await resolveIssueId(ctx.sdk, issue);

        if (parsedEstimate !== undefined && issueEstimateContext) {
          validateEstimateAgainstTeamConfig(parsedEstimate, {
            teamKey: issueEstimateContext.team.teamKey,
            issueEstimationType: issueEstimateContext.team.issueEstimationType,
            issueEstimationExtended:
              issueEstimateContext.team.issueEstimationExtended,
            issueEstimationAllowZero:
              issueEstimateContext.team.issueEstimationAllowZero,
          });
        }

        const needsContext =
          options.status ||
          options.projectMilestone ||
          options.cycle ||
          (options.labels && options.labelMode === "add");
        const issueContext = needsContext
          ? await getIssue(ctx.gql, resolvedIssueId)
          : undefined;

        const input: IssueUpdateInput = {};

        if (options.title) {
          input.title = options.title;
        }

        if (options.description) {
          input.description = options.description;
        }

        if (options.status) {
          const teamId =
            issueContext && "team" in issueContext && issueContext.team
              ? issueContext.team.id
              : undefined;
          input.stateId = await resolveStatusId(
            ctx.sdk,
            options.status,
            teamId,
          );
        }

        if (parsedPriority !== undefined) {
          input.priority = parsedPriority;
        }

        if (options.clearEstimate) {
          input.estimate = null;
        } else if (parsedEstimate !== undefined) {
          input.estimate = parsedEstimate;
        }

        if (options.assignee) {
          input.assigneeId = await resolveUserId(ctx.sdk, options.assignee);
        }

        if (options.project) {
          input.projectId = await resolveProjectId(ctx.sdk, options.project);
        }

        if (options.clearLabels) {
          input.labelIds = [];
        } else if (options.labels) {
          const labelNames = options.labels.split(",").map((l) => l.trim());
          const labelIds = await resolveLabelIds(ctx.sdk, labelNames);

          if (options.labelMode === "add") {
            const currentLabels =
              issueContext &&
              "labels" in issueContext &&
              issueContext.labels?.nodes
                ? issueContext.labels.nodes.map((l) => l.id)
                : [];
            input.labelIds = [...new Set([...currentLabels, ...labelIds])];
          } else {
            input.labelIds = labelIds;
          }
        }

        if (options.clearParentTicket) {
          input.parentId = null;
        } else if (options.parentTicket) {
          input.parentId = await resolveIssueId(ctx.sdk, options.parentTicket);
        }

        if (options.clearProjectMilestone) {
          input.projectMilestoneId = null;
        } else if (options.projectMilestone) {
          const projectName =
            issueContext &&
            "project" in issueContext &&
            issueContext.project?.name
              ? issueContext.project.name
              : undefined;
          input.projectMilestoneId = await resolveMilestoneId(
            ctx.gql,
            ctx.sdk,
            options.projectMilestone,
            projectName,
          );
        }

        if (options.clearCycle) {
          input.cycleId = null;
        } else if (options.cycle) {
          const teamKey =
            issueContext && "team" in issueContext && issueContext.team?.key
              ? issueContext.team.key
              : undefined;
          input.cycleId = await resolveCycleId(ctx.sdk, options.cycle, teamKey);
        }

        if (options.clearDueDate) {
          input.dueDate = null;
        } else if (options.dueDate) {
          input.dueDate = parseDueDate(options.dueDate);
        }

        const result = await updateIssue(ctx.gql, resolvedIssueId, input);

        if (relationActions.length > 0) {
          await resolveAndApplyRelations(ctx, resolvedIssueId, relationActions);
        }

        outputSuccess(result);
      }),
    );

  issues
    .command("archive <issue>")
    .description("archive an issue")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await archiveIssue(ctx.gql, issueId);
        outputSuccess(result);
      }),
    );

  issues
    .command("unarchive <issue>")
    .description("unarchive an issue")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await unarchiveIssue(ctx.gql, issueId);
        outputSuccess(result);
      }),
    );

  issues
    .command("delete <issue>")
    .description("delete an issue")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await deleteIssue(ctx.gql, issueId);
        outputSuccess(result);
      }),
    );

  issues
    .command("usage")
    .description("show detailed usage for issues")
    .action(() => {
      console.log(formatDomainUsage(issues, ISSUES_META));
    });
}
