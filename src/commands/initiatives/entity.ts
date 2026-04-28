import type { Command } from "commander";
import type { LinearSdkClient } from "../../client/linear-client.js";
import { createContext, getRootOpts } from "../../common/context.js";
import { resolveReactionEmojiInput } from "../../common/emoji.js";
import { invalidParameterError } from "../../common/errors.js";
import {
  handleCommand,
  outputSuccess,
  parseLimit,
} from "../../common/output.js";
import {
  type InitiativeSortInput,
  InitiativeStatus,
  type ListInitiativesQueryVariables,
  PaginationNulls,
  PaginationOrderBy,
  PaginationSortOrder,
} from "../../gql/graphql.js";
import { resolveInitiativeId } from "../../resolvers/initiative-resolver.js";
import { resolveTeamId } from "../../resolvers/team-resolver.js";
import { resolveUserId } from "../../resolvers/user-resolver.js";
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
} from "../../services/discussion-service.js";
import {
  archiveInitiative,
  type CreateInitiativeInput,
  createInitiative,
  deleteInitiative,
  getInitiative,
  listInitiatives,
  type UpdateInitiativeInput,
  unarchiveInitiative,
  updateInitiative,
} from "../../services/initiative-service.js";

interface InitiativeExpandOptions {
  withProjects?: boolean;
  withSubInitiatives?: boolean;
  withParentInitiatives?: boolean;
  withUpdates?: boolean;
  withLinks?: boolean;
  withHistory?: boolean;
  withDocuments?: boolean;
}

interface InitiativeListOptions extends InitiativeExpandOptions {
  limit: string;
  after?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: string;
  id?: string;
  slug?: string;
  name?: string;
  status?: string;
  health?: string;
  healthWithAge?: string;
  owner?: string;
  creator?: string;
  team?: string;
  targetAfter?: string;
  targetBefore?: string;
  startedAfter?: string;
  startedBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  parent?: string;
  ancestor?: string;
}

interface InitiativeReadOptions extends InitiativeExpandOptions {}

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

interface ReactionOptions {
  shortcode?: string;
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
          expectedEntityKind: "initiative",
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
          expectedEntityKind: "initiative",
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
          expectedEntityKind: "initiative",
          reactionId,
        });
        outputSuccess(result);
      }),
    );
}

interface InitiativeCreateOptions {
  description?: string;
  content?: string;
  owner?: string;
  status?: string;
  targetDate?: string;
  sortOrder?: string;
}

interface InitiativeUpdateOptions {
  name?: string;
  description?: string;
  content?: string;
  owner?: string;
  status?: string;
  targetDate?: string;
  sortOrder?: string;
}

type InitiativeSortBy =
  | "name"
  | "createdAt"
  | "updatedAt"
  | "targetDate"
  | "health"
  | "healthUpdatedAt"
  | "manual"
  | "owner";

function parseSortOrder(value?: string): "asc" | "desc" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }
  throw invalidParameterError("--sort-order", "must be one of: asc, desc");
}

function parseSortBy(value?: string): InitiativeSortBy | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();

  if (normalized === "name") return "name";
  if (normalized === "createdat") return "createdAt";
  if (normalized === "updatedat") return "updatedAt";
  if (normalized === "targetdate") return "targetDate";
  if (normalized === "health") return "health";
  if (normalized === "healthupdatedat") return "healthUpdatedAt";
  if (normalized === "manual") return "manual";
  if (normalized === "owner") return "owner";

  throw invalidParameterError(
    "--sort-by",
    'must be one of: "name", "createdAt", "updatedAt", "targetDate", "health", "healthUpdatedAt", "manual", "owner"',
  );
}

function mapSortByToPaginationOrderBy(
  sortBy?: InitiativeSortBy,
): PaginationOrderBy | undefined {
  if (sortBy === "createdAt") return PaginationOrderBy.CreatedAt;
  if (sortBy === "updatedAt") return PaginationOrderBy.UpdatedAt;
  return undefined;
}

function mapSortByToInitiativeSort(
  sortBy?: InitiativeSortBy,
  sortOrder?: "asc" | "desc",
): ListInitiativesQueryVariables["sort"] | undefined {
  if (!sortBy) return undefined;

  const order =
    sortOrder === "desc"
      ? PaginationSortOrder.Descending
      : PaginationSortOrder.Ascending;

  const withNulls = {
    order,
    nulls: PaginationNulls.Last,
  };

  const sortEntry: InitiativeSortInput =
    sortBy === "manual"
      ? { manual: withNulls }
      : sortBy === "name"
        ? { name: withNulls }
        : sortBy === "createdAt"
          ? { createdAt: withNulls }
          : sortBy === "updatedAt"
            ? { updatedAt: withNulls }
            : sortBy === "targetDate"
              ? { targetDate: withNulls }
              : sortBy === "health"
                ? { health: withNulls }
                : sortBy === "healthUpdatedAt"
                  ? { healthUpdatedAt: withNulls }
                  : { owner: withNulls };

  return [sortEntry];
}

function parseInitiativeStatus(value?: string): InitiativeStatus | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  if (normalized === "planned") return InitiativeStatus.Planned;
  if (normalized === "active") return InitiativeStatus.Active;
  if (normalized === "completed") return InitiativeStatus.Completed;

  throw invalidParameterError(
    "--status",
    'must be one of: "Planned", "Active", "Completed"',
  );
}

function parseSortOrderNumber(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw invalidParameterError(
      "--sort-order",
      `must be a number, got "${value}"`,
    );
  }
  return parsed;
}

function applyNullableDateRange(
  target: { gte?: string; lte?: string },
  after?: string,
  before?: string,
): void {
  if (after !== undefined) {
    target.gte = after;
  }
  if (before !== undefined) {
    target.lte = before;
  }
}

function getExpandFlags(options: InitiativeExpandOptions): string[] {
  const map: Array<[boolean | undefined, string]> = [
    [options.withProjects, "--with-projects"],
    [options.withSubInitiatives, "--with-sub-initiatives"],
    [options.withParentInitiatives, "--with-parent-initiatives"],
    [options.withUpdates, "--with-updates"],
    [options.withLinks, "--with-links"],
    [options.withHistory, "--with-history"],
    [options.withDocuments, "--with-documents"],
  ];

  return map.filter(([enabled]) => enabled).map(([, flag]) => flag);
}

async function buildInitiativeFilter(
  sdk: LinearSdkClient,
  options: InitiativeListOptions,
): Promise<ListInitiativesQueryVariables["filter"] | undefined> {
  const filter: NonNullable<ListInitiativesQueryVariables["filter"]> = {};

  if (options.id) {
    filter.id = { eq: options.id };
  }

  if (options.slug) {
    filter.slugId = { eqIgnoreCase: options.slug };
  }

  if (options.name) {
    filter.name = { eqIgnoreCase: options.name };
  }

  const status = parseInitiativeStatus(options.status);
  if (status) {
    filter.status = { eq: status };
  }

  if (options.health) {
    filter.health = { eq: options.health };
  }

  if (options.healthWithAge) {
    filter.healthWithAge = { eq: options.healthWithAge };
  }

  if (options.owner) {
    const ownerId = await resolveUserId(sdk, options.owner);
    filter.owner = { id: { eq: ownerId } };
  }

  if (options.creator) {
    const creatorId = await resolveUserId(sdk, options.creator);
    filter.creator = { id: { eq: creatorId } };
  }

  if (options.team) {
    const teamId = await resolveTeamId(sdk, options.team);
    filter.teams = { some: { id: { eq: teamId } } };
  }

  if (options.targetAfter || options.targetBefore) {
    filter.targetDate = {};
    applyNullableDateRange(
      filter.targetDate,
      options.targetAfter,
      options.targetBefore,
    );
  }

  if (options.startedAfter || options.startedBefore) {
    filter.startedAt = {};
    applyNullableDateRange(
      filter.startedAt,
      options.startedAfter,
      options.startedBefore,
    );
  }

  if (options.completedAfter || options.completedBefore) {
    filter.completedAt = {};
    applyNullableDateRange(
      filter.completedAt,
      options.completedAfter,
      options.completedBefore,
    );
  }

  if (options.createdAfter || options.createdBefore) {
    filter.createdAt = {};
    applyNullableDateRange(
      filter.createdAt,
      options.createdAfter,
      options.createdBefore,
    );
  }

  if (options.updatedAfter || options.updatedBefore) {
    filter.updatedAt = {};
    applyNullableDateRange(
      filter.updatedAt,
      options.updatedAfter,
      options.updatedBefore,
    );
  }

  if (options.ancestor) {
    const ancestorId = await resolveInitiativeId(sdk, options.ancestor);
    filter.ancestors = { some: { id: { eq: ancestorId } } };
  }

  if (options.parent) {
    throw invalidParameterError(
      "--parent",
      "is not supported by current Linear initiatives filter API",
    );
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export function setupInitiativeEntityCommands(initiatives: Command): void {
  initiatives
    .command("list")
    .description("list initiatives")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--include-archived", "include archived initiatives")
    .option(
      "--sort-by <field>",
      "name, createdAt, updatedAt, targetDate, health, healthUpdatedAt, manual, owner",
    )
    .option("--sort-order <order>", "asc or desc")
    .option("--id <id>", "filter by initiative UUID")
    .option("--slug <slug>", "filter by slug")
    .option("--name <name>", "filter by name")
    .option("--status <status>", "filter by status: planned, active, completed")
    .option("--health <health>", "filter by health")
    .option("--health-with-age <health>", "filter by health with age")
    .option("--owner <user>", "filter by owner (name, email, or UUID)")
    .option("--creator <user>", "filter by creator (name, email, or UUID)")
    .option("--team <team>", "filter by team (name, key, or UUID)")
    .option("--target-after <date>", "filter target date >= value")
    .option("--target-before <date>", "filter target date <= value")
    .option("--started-after <date>", "filter started date >= value")
    .option("--started-before <date>", "filter started date <= value")
    .option("--completed-after <date>", "filter completed date >= value")
    .option("--completed-before <date>", "filter completed date <= value")
    .option("--created-after <date>", "filter created date >= value")
    .option("--created-before <date>", "filter created date <= value")
    .option("--updated-after <date>", "filter updated date >= value")
    .option("--updated-before <date>", "filter updated date <= value")
    .option("--parent <initiative>", "filter by direct parent initiative")
    .option("--ancestor <initiative>", "filter by ancestor initiative")
    .option("--with-projects", "include linked projects in list output")
    .option(
      "--with-sub-initiatives",
      "include child initiatives in list output",
    )
    .option(
      "--with-parent-initiatives",
      "include parent initiatives in list output",
    )
    .option("--with-updates", "include updates in list output")
    .option("--with-links", "include links in list output")
    .option("--with-history", "include history in list output")
    .option("--with-documents", "include documents in list output")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [InitiativeListOptions, Command];
        const ctx = createContext(getRootOpts(command));

        const sortOrder = parseSortOrder(options.sortOrder);
        const sortBy = parseSortBy(options.sortBy);

        const expandFlags = getExpandFlags(options);
        if (expandFlags.length > 0) {
          throw invalidParameterError(
            "expand flags",
            `${expandFlags.join(", ")} are not supported for initiatives list yet`,
          );
        }

        if (sortOrder && !sortBy) {
          throw invalidParameterError(
            "--sort-order",
            "requires --sort-by to be specified",
          );
        }

        const orderBy = mapSortByToPaginationOrderBy(sortBy);
        const sort = mapSortByToInitiativeSort(sortBy, sortOrder);

        const filter = await buildInitiativeFilter(ctx.sdk, options);

        const result = await listInitiatives(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
          includeArchived: options.includeArchived ?? false,
          filter,
          orderBy,
          sort,
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("read <initiative>")
    .description("get initiative details")
    .option("--with-projects", "include linked projects in read output")
    .option(
      "--with-sub-initiatives",
      "include child initiatives in read output",
    )
    .option(
      "--with-parent-initiatives",
      "include parent initiatives in read output",
    )
    .option("--with-updates", "include updates in read output")
    .option("--with-links", "include links in read output")
    .option("--with-history", "include history in read output")
    .option("--with-documents", "include documents in read output")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, options, command] = args as [
          string,
          InitiativeReadOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);

        // Read query already returns expanded fields. Keep flags accepted for
        // CLI contract compatibility until conditional field selection is added.
        void getExpandFlags(options);

        const result = await getInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("discuss <initiative>")
    .description("start a discussion thread on an initiative")
    .option("--body <text>", "discussion body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, options, command] = args as [
          string,
          DiscussionBodyOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await startInitiativeDiscussion(ctx.gql, {
          initiativeId,
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("discussions <initiative>")
    .description("list root discussion threads on an initiative")
    .option("-l, --limit <n>", "max results", "25")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, options, command] = args as [
          string,
          DiscussionsOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const paginationOptions = {
          limit: parseLimit(options.limit || "25"),
          after: options.after,
        };
        const result = options.withReactions
          ? await listDiscussionsForInitiativeWithReactions(
              ctx.gql,
              initiativeId,
              paginationOptions,
            )
          : await listDiscussionsForInitiative(
              ctx.gql,
              initiativeId,
              paginationOptions,
            );

        outputSuccess(result);
      }),
    );

  const initiativeThreads = initiatives
    .command("threads")
    .description("discussion thread reaction operations");
  addCommentReactionCommands(initiativeThreads, "thread");

  const initiativeReplies = initiatives
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
              "initiative",
            )
          : await listDiscussionReplies(
              ctx.gql,
              thread,
              paginationOptions,
              "initiative",
            );

        outputSuccess(result);
      }),
    );
  addCommentReactionCommands(initiativeReplies, "reply");

  initiatives
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
          entityKind: "initiative",
        });

        outputSuccess(result);
      }),
    );

  initiatives
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
          "initiative",
        );

        outputSuccess(result);
      }),
    );

  initiatives
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
          "initiative",
        );

        outputSuccess(result);
      }),
    );

  initiatives
    .command("delete-comment <comment>")
    .description("delete a root discussion or reply comment")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionComment(
          ctx.gql,
          comment,
          "initiative",
        );

        outputSuccess(result);
      }),
    );

  initiatives
    .command("delete-reply <reply>")
    .description("delete a discussion reply")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [reply, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionReply(
          ctx.gql,
          reply,
          "initiative",
        );

        outputSuccess(result);
      }),
    );

  initiatives
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
          entityKind: "initiative",
        });

        outputSuccess(result);
      }),
    );

  initiatives
    .command("unresolve <thread>")
    .description("unresolve a discussion thread")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await unresolveDiscussion(ctx.gql, thread, "initiative");

        outputSuccess(result);
      }),
    );

  initiatives
    .command("create <name>")
    .description("create a new initiative")
    .option("--description <text>", "initiative description")
    .option("--content <text>", "initiative content (markdown)")
    .option("--owner <user>", "owner (name, email, or UUID)")
    .option("--status <status>", "planned, active, completed")
    .option("--target-date <date>", "target date (YYYY-MM-DD)")
    .option("--sort-order <n>", "display sort order")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [name, options, command] = args as [
          string,
          InitiativeCreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const input: CreateInitiativeInput = { name };

        if (options.description !== undefined) {
          input.description = options.description;
        }

        if (options.content !== undefined) {
          input.content = options.content;
        }

        if (options.owner) {
          input.ownerId = await resolveUserId(ctx.sdk, options.owner);
        }

        const status = parseInitiativeStatus(options.status);
        if (status) {
          input.status = status;
        }

        if (options.targetDate !== undefined) {
          input.targetDate = options.targetDate;
        }

        const sortOrder = parseSortOrderNumber(options.sortOrder);
        if (sortOrder !== undefined) {
          input.sortOrder = sortOrder;
        }

        const result = await createInitiative(ctx.gql, input);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("update <initiative>")
    .description("update an initiative")
    .option("--name <name>", "new name")
    .option("--description <text>", "new description")
    .option("--content <text>", "new content (markdown)")
    .option("--owner <user>", "new owner (name, email, or UUID)")
    .option("--status <status>", "planned, active, completed")
    .option("--target-date <date>", "new target date (YYYY-MM-DD)")
    .option("--sort-order <n>", "new display sort order")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, options, command] = args as [
          string,
          InitiativeUpdateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);

        const input: UpdateInitiativeInput = {};

        if (options.name !== undefined) {
          input.name = options.name;
        }

        if (options.description !== undefined) {
          input.description = options.description;
        }

        if (options.content !== undefined) {
          input.content = options.content;
        }

        if (options.owner) {
          input.ownerId = await resolveUserId(ctx.sdk, options.owner);
        }

        const status = parseInitiativeStatus(options.status);
        if (status) {
          input.status = status;
        }

        if (options.targetDate !== undefined) {
          input.targetDate = options.targetDate;
        }

        const sortOrder = parseSortOrderNumber(options.sortOrder);
        if (sortOrder !== undefined) {
          input.sortOrder = sortOrder;
        }

        if (Object.keys(input).length === 0) {
          throw invalidParameterError(
            "update options",
            "at least one option must be provided",
          );
        }

        const result = await updateInitiative(ctx.gql, initiativeId, input);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("archive <initiative>")
    .description("archive an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await archiveInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("unarchive <initiative>")
    .description("unarchive an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await unarchiveInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );

  initiatives
    .command("delete <initiative>")
    .description("delete an initiative")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [initiative, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const initiativeId = await resolveInitiativeId(ctx.sdk, initiative);
        const result = await deleteInitiative(ctx.gql, initiativeId);
        outputSuccess(result);
      }),
    );
}
