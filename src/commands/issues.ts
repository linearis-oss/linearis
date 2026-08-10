import type { Command } from "commander";
import { firstOrThrow } from "../common/array.js";
import type { CommandContext } from "../common/context.js";
import { createContext, getRootOpts } from "../common/context.js";
import { parseDateTimeOption } from "../common/datetime.js";
import {
  parseLabelMode,
  parseSetMode,
  type SetMode,
} from "../common/domain-values.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import { invalidParameterError } from "../common/errors.js";
import { validateEstimateAgainstTeamConfig } from "../common/estimate-validation.js";
import { getCurrentBranch } from "../common/git.js";
import {
  asUuid,
  isUuid,
  parseDueDate,
  parseIssueIdentifier,
  type UUID,
} from "../common/identifier.js";
import {
  parseCommaSeparated,
  type RawFilterFlags,
} from "../common/issue-filter.js";
import {
  parseEstimateOption,
  parsePriorityOption,
} from "../common/number-options.js";
import { commandAction, outputSuccess, parseLimit } from "../common/output.js";
import { resolveFilterOptions } from "../common/resolve-filters.js";
import {
  buildPaginationOptions,
  type PaginationOptions,
} from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import type { IssueRelationType, PaginationOrderBy } from "../gql/graphql.js";
import {
  type ResolveCreateIssueIdsInput,
  type ResolvedUpdateIssueIds,
  type ResolveUpdateIssueIdsInput,
  resolveCreateIssueIds,
  resolveUpdateIssueIds,
  type UpdateIssueContext,
} from "../resolvers/issue-mutation-resolver.js";
import {
  resolveIssueEstimateContext,
  resolveIssueId,
} from "../resolvers/issue-resolver.js";
import { resolveTeamEstimateContext } from "../resolvers/team-resolver.js";
import { resolveUserId, resolveViewerId } from "../resolvers/user-resolver.js";
import { getIssueActivity } from "../services/activity-service.js";
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
  listIssueRelations,
} from "../services/issue-relation-service.js";
import {
  archiveIssue,
  type CreateIssueInput,
  createIssue,
  deleteIssue,
  findIssueByBranch,
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
  type IssueDetail,
  type IssueReadOptions,
  listIssues,
  remindOnIssue,
  restoreIssue,
  searchIssues,
  shareIssue,
  snoozeIssue,
  subscribeToIssue,
  type UpdateIssueInput,
  unarchiveIssue,
  unshareIssue,
  unsubscribeFromIssue,
  updateIssue,
} from "../services/issue-service.js";
import {
  createReactionForIssue,
  deleteOwnReactionByEmoji,
  deleteOwnReactionById,
} from "../services/reaction-service.js";
import { addBatchCommands } from "./issues-batch.js";

interface FilterOptions extends RawFilterFlags {
  limit: string;
  after?: string;
  query?: string;
  includeArchived?: boolean;
  orderBy?: string;
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
  subscribers?: string;
  delegate?: string;
  dueDate?: string;
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  similarTo?: string;
}

interface UpdateOptions {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  estimate?: string;
  clearEstimate?: boolean;
  assignee?: string;
  clearAssignee?: boolean;
  project?: string;
  clearProject?: boolean;
  labels?: string;
  labelMode?: string;
  clearLabels?: boolean;
  parentTicket?: string;
  clearParentTicket?: boolean;
  projectMilestone?: string;
  clearProjectMilestone?: boolean;
  cycle?: string;
  clearCycle?: boolean;
  team?: string;
  subscribers?: string;
  subscriberMode?: string;
  clearSubscribers?: boolean;
  delegate?: string;
  clearDelegate?: boolean;
  dueDate?: string;
  clearDueDate?: boolean;
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  similarTo?: string;
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

interface SubscriberOptions {
  user?: string;
}

interface ShareOptions {
  with: string;
}

interface RemindOptions {
  at: string;
}

interface SnoozeOptions {
  until?: string;
  clear?: boolean;
}

/** `--until <when>` snoozes; `--clear` wakes. Exactly one is required. */
function parseSnoozeTarget(options: SnoozeOptions): string | null {
  if (options.until && options.clear) {
    throw invalidParameterError("--until", "cannot be used with --clear");
  }

  if (options.clear) {
    return null;
  }

  if (!options.until) {
    throw invalidParameterError("--until", "is required (or pass --clear)");
  }

  return parseDateTimeOption("--until", options.until);
}

/**
 * Resolves the issue and the user a subscribe/share command acts on.
 *
 * The two lookups are independent, so they run concurrently. An omitted user
 * means the caller themselves — subscribing yourself is the overwhelmingly
 * common case, and `me` is accepted as the explicit spelling of the same thing
 * (see `resolveUserId`).
 */
async function resolveIssueAndUser(
  ctx: CommandContext,
  issue: string,
  user: string | undefined,
): Promise<[UUID, UUID]> {
  return Promise.all([
    resolveIssueId(ctx.gql, issue),
    user === undefined
      ? resolveViewerId(ctx.gql)
      : resolveUserId(ctx.gql, user),
  ]);
}

/**
 * Combines a set-valued flag with the issue's current members.
 *
 * `overwrite` (and an omitted mode) replaces, matching the API's own
 * replace-the-list semantics for `labelIds`/`subscriberIds`; `add` and
 * `remove` are computed here from the issue's current values because the API
 * has no incremental form for either field.
 */
function applySetMode(
  mode: SetMode | undefined,
  current: readonly UUID[],
  requested: readonly UUID[],
): UUID[] {
  if (mode === "add") {
    return [...new Set([...current, ...requested])];
  }

  if (mode === "remove") {
    return current.filter((id) => !requested.includes(id));
  }

  return [...requested];
}

/** The issue's current subscriber UUIDs, for `--subscriber-mode add|remove`. */
function currentSubscriberIds(issue: IssueDetail | undefined): UUID[] {
  return (issue?.subscribers?.nodes ?? []).map((user) => asUuid(user.id));
}

interface ReactionOptions {
  shortcode?: string;
}

interface DiscussionsOptions {
  limit?: string;
  after?: string;
  withReactions?: boolean;
}

interface ActivityOptions {
  limit: string;
  after?: string;
  commentsOnly?: boolean;
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
      commandAction<[string, string | undefined, ReactionOptions, Command]>(
        async (commentId, emoji, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await createDiscussionCommentReaction(ctx.gql, {
            commentId: asUuid(commentId),
            target: noun,
            expectedEntityKind: "issue",
            emoji: resolveReactionEmojiInput(emoji, options.shortcode),
          });

          outputSuccess(result);
        },
      ),
    );

  parent
    .command(`unreact <${noun}> [emoji]`)
    .description(`remove your reaction from a discussion ${noun} by emoji`)
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      commandAction<[string, string | undefined, ReactionOptions, Command]>(
        async (commentId, emoji, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await deleteDiscussionCommentReactionByEmoji(ctx.gql, {
            commentId: asUuid(commentId),
            target: noun,
            expectedEntityKind: "issue",
            emoji: resolveReactionEmojiInput(emoji, options.shortcode),
          });

          outputSuccess(result);
        },
      ),
    );

  parent
    .command(`unreact-id <${noun}> <reactionId>`)
    .description(
      `remove your reaction from a discussion ${noun} by reaction ID`,
    )
    .action(
      commandAction<[string, string, unknown, Command]>(
        async (commentId, reactionId, _unused2, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await deleteDiscussionCommentReactionById(ctx.gql, {
            commentId: asUuid(commentId),
            target: noun,
            expectedEntityKind: "issue",
            reactionId: asUuid(reactionId),
          });

          outputSuccess(result);
        },
      ),
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
    "duplicate-of) are supported. an issue can also be moved between teams",
    "with `update --team`.",
    "",
    "an issue has three separate 'put it away' states, and they do not",
    "overlap: archive (`archive`/`unarchive`), trash (`delete`/`restore`),",
    "and snooze until a time (`snooze --until|--clear`). archived issues are",
    "reachable by identifier everywhere, but excluded from `list`/`search`",
    "unless you pass --include-archived.",
    "",
    "`list` also hides completed issues by default. saying anything about",
    "state lifts that narrowing: --status and --state-type replace it with",
    "what you asked for, and --include-archived drops it too. so on `list`",
    "--include-archived widens the result twice — archived issues are nearly",
    "always completed, and keeping the default clause would hide the very",
    "issues the flag was passed to surface. to see completed work without",
    "archived issues, pass --state-type completed instead.",
    "",
    "full-text search does not narrow by state: `search`, and `list --query`",
    "which runs the same query, return completed issues whether or not you",
    "pass --include-archived. there --include-archived only adds archived",
    "issues. filter with --state-type if you want a state-bounded search.",
    "",
    "people attach to an issue in four ways: assignee (one, owns it),",
    "delegate (one, acts for the assignee), subscribers (many, get notified),",
    "and shared access (`share --with`, which grants a user visibility of an",
    "issue they otherwise could not see — it does not produce a link; the",
    "issue's permalink is the `url` field on any read).",
    "",
    "`batch create` takes a JSON array instead of flags — one object per",
    "issue, keys named after the `issues create` flags, unknown keys",
    "rejected. the contract is published as JSON Schema (draft 2020-12) in",
    "`schemas/issues-batch-create.schema.json`, also shipped in the npm",
    "package and served raw from the repository's default branch:",
    "https://raw.githubusercontent.com/linearis-oss/linearis/next/schemas/issues-batch-create.schema.json",
    "write the document against that schema, validate it locally, then pass",
    "it with --file (or - for stdin).",
  ].join("\n"),
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    title: "string",
    query: "full-text search term",
    user: "display name, email, UUID, or `me` for yourself",
    when: "ISO-8601 instant (2026-08-14T09:00:00Z) or offset (+2h, +3d)",
  },
  seeAlso: [
    "issues activity <issue>",
    "issues batch create --file issues.json",
    "issues batch update --issues ENG-1,ENG-2 --status Done",
    "issues from-branch",
    "issues subscribe <issue> [--user <user>]",
    "issues share <issue> --with <user>",
    "issues remind <issue> --at +2h",
    "issues snooze <issue> --until 2026-08-20",
    "issues restore <issue>",
    "comments create <issue>",
    "documents list --issue <issue>",
    "attachments list <issue>",
    "attachments disable-sync <id>",
    "issues read --with-attachments",
    "issues archive <issue>",
    "issues unarchive <issue>",
    "issues delete <issue>",
  ],
};

interface RelationAction {
  type:
    | "blocks"
    | "blockedBy"
    | "relatesTo"
    | "duplicateOf"
    | "similarTo"
    | "remove";
  targets: string[];
}

interface RelationAddOptions {
  blocks?: string;
  related?: string;
  duplicate?: string;
  similar?: string;
}

function parseRelationFlags(flags: {
  blocks?: string;
  blockedBy?: string;
  relatesTo?: string;
  duplicateOf?: string;
  similarTo?: string;
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
    { type: "similarTo", raw: flags.similarTo },
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
        `Relation flag ${relationFlagName(type)} must not be empty`,
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
          `${target} appears in multiple relation flags (${prev} and ${relationFlagName(action.type)})`,
        );
      }
      seen.set(target, relationFlagName(action.type));
    }
  }

  return actions;
}

function relationFlagName(type: RelationAction["type"]): string {
  switch (type) {
    case "blocks":
      return "--blocks";
    case "blockedBy":
      return "--blocked-by";
    case "relatesTo":
      return "--relates-to";
    case "duplicateOf":
      return "--duplicate-of";
    case "similarTo":
      return "--similar-to";
    case "remove":
      return "--remove-relation";
  }
}

function parseRelationAddOptions(options: RelationAddOptions): {
  type: IssueRelationType;
  targets: string[];
} {
  const typeFlags = [
    options.blocks ? "blocks" : null,
    options.related ? "related" : null,
    options.duplicate ? "duplicate" : null,
    options.similar ? "similar" : null,
  ].filter((type): type is keyof RelationAddOptions => type !== null);

  if (typeFlags.length > 1) {
    throw new Error("Cannot specify multiple relation types");
  }

  const type = firstOrThrow(
    typeFlags,
    "Must specify one of --blocks, --related, --duplicate, or --similar",
  );
  const rawTargets = options[type] ?? "";
  const targets = [
    ...new Set(
      rawTargets
        .split(",")
        .map((target) => target.trim())
        .filter(Boolean),
    ),
  ];

  if (targets.length === 0) {
    throw new Error("At least one related issue ID must be provided");
  }

  return {
    type,
    targets,
  };
}

async function resolveAndApplyRelations(
  ctx: CommandContext,
  issueId: UUID,
  actions: RelationAction[],
): Promise<void> {
  // Resolve all unique targets to UUIDs
  const uniqueTargets = new Set(actions.flatMap((a) => a.targets));
  const resolved = new Map<string, UUID>();
  await Promise.all(
    [...uniqueTargets].map(async (target) => {
      resolved.set(target, await resolveIssueId(ctx.gql, target));
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
            type: "blocks",
          });
          break;
        case "blockedBy":
          await createIssueRelation(ctx.gql, {
            issueId: targetId,
            relatedIssueId: issueId,
            type: "blocks",
          });
          break;
        case "relatesTo":
          await createIssueRelation(ctx.gql, {
            issueId,
            relatedIssueId: targetId,
            type: "related",
          });
          break;
        case "duplicateOf":
          await createIssueRelation(ctx.gql, {
            issueId,
            relatedIssueId: targetId,
            type: "duplicate",
          });
          break;
        case "similarTo":
          await createIssueRelation(ctx.gql, {
            issueId,
            relatedIssueId: targetId,
            type: "similar",
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

/**
 * Fold `--include-archived` into the pagination options. The key is left absent
 * rather than set to `false` so the request matches the pre-flag shape exactly
 * under `exactOptionalPropertyTypes`.
 */
function buildIssueReadOptions(
  pagination: PaginationOptions,
  options: Pick<FilterOptions, "includeArchived" | "orderBy">,
): IssueReadOptions {
  return {
    ...pagination,
    ...(options.includeArchived ? { includeArchived: true } : {}),
    ...(options.orderBy ? { orderBy: parseOrderBy(options.orderBy) } : {}),
  };
}

/**
 * Maps the CLI's `created`/`updated` onto Linear's `PaginationOrderBy`.
 *
 * The API spells them `createdAt`/`updatedAt`; both spellings are accepted so a
 * caller who read the field name in a payload is not told they are wrong.
 */
function parseOrderBy(value: string): PaginationOrderBy {
  if (value === "created" || value === "createdAt") return "createdAt";
  if (value === "updated" || value === "updatedAt") return "updatedAt";

  throw invalidParameterError("--order-by", "must be 'created' or 'updated'");
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
    .option("--is-blocking", "only issues that block others")
    .option("--unassigned", "only issues with no assignee")
    .option(
      "--state-type <type>",
      "filter by state category (triage, backlog, unstarted, started, completed, canceled)",
    )
    .option("--subscriber <user>", "filter by subscriber")
    .option(
      "--include-archived",
      "include archived issues (on `list`, also drops the default 'hide completed' narrowing; full-text search never applies it)",
    );
}

export function setupIssuesCommands(program: Command): void {
  const issues = program.command("issues").description("Issue operations");

  addBatchCommands(issues);

  const relations = issues
    .command("relations")
    .description("Issue relation operations");

  relations
    .command("list <issue>")
    .description("list relations for an issue")
    .action(
      commandAction<[string, unknown, Command]>(
        async (issue, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await listIssueRelations(ctx.gql, issueId);

          outputSuccess(result);
        },
      ),
    );

  relations
    .command("add <issue>")
    .description("add relation(s) to an issue")
    .option("--blocks <issues>", "issues this issue blocks (comma-separated)")
    .option("--related <issues>", "related issues (comma-separated)")
    .option(
      "--duplicate <issues>",
      "issues this is a duplicate of (comma-separated)",
    )
    .option("--similar <issues>", "similar issues (comma-separated)")
    .action(
      commandAction<[string, RelationAddOptions, Command]>(
        async (issue, options, command) => {
          const relation = parseRelationAddOptions(options);
          const ctx = createContext(getRootOpts(command));
          const sourceIssueId = await resolveIssueId(ctx.gql, issue);
          const targetIds = await Promise.all(
            relation.targets.map((target) => resolveIssueId(ctx.gql, target)),
          );

          const created = await Promise.all(
            targetIds.map((targetId) =>
              createIssueRelation(ctx.gql, {
                issueId: sourceIssueId,
                relatedIssueId: targetId,
                type: relation.type,
              }),
            ),
          );

          outputSuccess(created);
        },
      ),
    );

  relations
    .command("remove <relation>")
    .description("remove a relation by UUID")
    .action(
      commandAction<[string, unknown, Command]>(
        async (relation, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await deleteIssueRelation(ctx.gql, asUuid(relation));

          outputSuccess(result);
        },
      ),
    );

  addFilterOptions(
    issues
      .command("list")
      .description("list issues with optional filters")
      .option("--query <query>", "deprecated: use `issues search <query>`")
      .option("--order-by <field>", "created | updated (default: updated)")
      .option("-l, --limit <n>", "max results", "50")
      .option("--after <cursor>", "cursor for next page"),
  ).action(
    commandAction<[FilterOptions, Command]>(async (options, command) => {
      // Full-text results come back relevance-ordered from the API, so
      // --order-by has nothing to act on down that path.
      if (options.orderBy && options.query) {
        throw invalidParameterError(
          "--order-by",
          "cannot be combined with --query, whose results are relevance-ordered",
        );
      }

      const ctx = createContext(getRootOpts(command));

      const readOptions = buildIssueReadOptions(
        buildPaginationOptions(parseLimit(options.limit), options.after),
        options,
      );

      const filterOptions = await resolveFilterOptions(ctx, options);
      const filter = buildIssueFilter(filterOptions);

      if (options.query) {
        const result = await searchIssues(
          ctx.gql,
          options.query,
          readOptions,
          filter,
        );
        outputSuccess(result);
        return;
      }

      const result = await listIssues(ctx.gql, readOptions, filter);
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
    commandAction<[string, FilterOptions, Command]>(
      async (query, options, command) => {
        const ctx = createContext(getRootOpts(command));

        const readOptions = buildIssueReadOptions(
          buildPaginationOptions(parseLimit(options.limit), options.after),
          options,
        );

        const filterOptions = await resolveFilterOptions(ctx, options);
        const filter = buildIssueFilter(filterOptions);
        const result = await searchIssues(ctx.gql, query, readOptions, filter);
        outputSuccess(result);
      },
    ),
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
      commandAction<[string, ReadOptions, Command]>(
        async (issue, options, command) => {
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
        },
      ),
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
      commandAction<[string, string | undefined, ReactionOptions, Command]>(
        async (issue, emoji, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await createReactionForIssue(ctx.gql, {
            issueId,
            emoji: resolveReactionEmojiInput(emoji, options.shortcode),
          });

          outputSuccess(result);
        },
      ),
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
      commandAction<[string, string | undefined, ReactionOptions, Command]>(
        async (issue, emoji, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await deleteOwnReactionByEmoji(ctx.gql, {
            kind: "issue",
            id: issueId,
            emoji: resolveReactionEmojiInput(emoji, options.shortcode),
          });

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("unreact-id <issue> <reactionId>")
    .description("remove your root reaction from an issue by reaction ID")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      commandAction<[string, string, unknown, Command]>(
        async (issue, reactionId, _unused2, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await deleteOwnReactionById(ctx.gql, {
            kind: "issue",
            id: issueId,
            reactionId: asUuid(reactionId),
          });

          outputSuccess(result);
        },
      ),
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
      commandAction<[string, DiscussionBodyOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));

          if (!options.body) {
            throw invalidParameterError("--body", "is required");
          }

          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await startIssueDiscussion(ctx.gql, {
            issueId,
            body: options.body,
          });

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("activity <issue>")
    .description(
      "chronological activity timeline: comment threads plus history events",
    )
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("-l, --limit <n>", "max timeline items", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--comments-only", "exclude non-comment history events")
    .option("--with-reactions", "include normalized comment reactions")
    .action(
      commandAction<[string, ActivityOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const issueId = await resolveIssueId(ctx.gql, issue);
          const paginationOptions = buildPaginationOptions(
            parseLimit(options.limit),
            options.after,
          );
          const result = await getIssueActivity(ctx.gql, issueId, {
            ...paginationOptions,
            commentsOnly: Boolean(options.commentsOnly),
            withReactions: Boolean(options.withReactions),
          });

          outputSuccess(result);
        },
      ),
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
      commandAction<[string, DiscussionsOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const issueId = await resolveIssueId(ctx.gql, issue);
          const paginationOptions = buildPaginationOptions(
            parseLimit(options.limit || "25"),
            options.after,
          );
          const result = options.withReactions
            ? await listDiscussionsForIssueWithReactions(
                ctx.gql,
                issueId,
                paginationOptions,
              )
            : await listDiscussionsForIssue(
                ctx.gql,
                issueId,
                paginationOptions,
              );

          outputSuccess(result);
        },
      ),
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
      commandAction<[string, DiscussionsOptions, Command]>(
        async (thread, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const paginationOptions = buildPaginationOptions(
            parseLimit(options.limit || "50"),
            options.after,
          );
          const result = options.withReactions
            ? await listDiscussionRepliesWithReactions(
                ctx.gql,
                asUuid(thread),
                paginationOptions,
                "issue",
              )
            : await listDiscussionReplies(
                ctx.gql,
                asUuid(thread),
                paginationOptions,
                "issue",
              );

          outputSuccess(result);
        },
      ),
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
      commandAction<[string, DiscussionBodyOptions, Command]>(
        async (thread, options, command) => {
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
        },
      ),
    );

  issues
    .command("edit <comment>")
    .description("edit a root discussion or reply comment")
    .option("--body <text>", "new comment body (required, markdown supported)")
    .action(
      commandAction<[string, DiscussionBodyOptions, Command]>(
        async (comment, options, command) => {
          const ctx = createContext(getRootOpts(command));

          if (!options.body) {
            throw invalidParameterError("--body", "is required");
          }

          const result = await editDiscussionComment(
            ctx.gql,
            asUuid(comment),
            {
              body: options.body,
            },
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("edit-reply <reply>")
    .description("edit a discussion reply")
    .option("--body <text>", "new reply body (required, markdown supported)")
    .action(
      commandAction<[string, DiscussionBodyOptions, Command]>(
        async (reply, options, command) => {
          const ctx = createContext(getRootOpts(command));

          if (!options.body) {
            throw invalidParameterError("--body", "is required");
          }

          const result = await editDiscussionReply(
            ctx.gql,
            asUuid(reply),
            {
              body: options.body,
            },
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("delete-comment <comment>")
    .description("delete a root discussion or reply comment")
    .action(
      commandAction<[string, unknown, Command]>(
        async (comment, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));

          const result = await deleteDiscussionComment(
            ctx.gql,
            asUuid(comment),
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("delete-reply <reply>")
    .description("delete a discussion reply")
    .action(
      commandAction<[string, unknown, Command]>(
        async (reply, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));

          const result = await deleteDiscussionReply(
            ctx.gql,
            asUuid(reply),
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("resolve <thread>")
    .description("resolve a discussion thread")
    .option("--with-comment <comment>", "comment to mark as resolving comment")
    .action(
      commandAction<[string, ResolveDiscussionOptions, Command]>(
        async (thread, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const result = await resolveDiscussion(ctx.gql, {
            threadId: asUuid(thread),
            ...(options.withComment !== undefined
              ? { resolvingCommentId: asUuid(options.withComment) }
              : {}),
            entityKind: "issue",
          });

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("unresolve <thread>")
    .description("unresolve a discussion thread")
    .action(
      commandAction<[string, unknown, Command]>(
        async (thread, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));

          const result = await unresolveDiscussion(
            ctx.gql,
            asUuid(thread),
            "issue",
          );

          outputSuccess(result);
        },
      ),
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
    .option("--subscribers <users>", "subscribe users (comma-separated)")
    .option("--delegate <user>", "delegate to a user")
    .option("--due-date <date>", "due date (YYYY-MM-DD)")
    .option("--blocks <issue>", "this issue blocks <issue>")
    .option("--blocked-by <issue>", "this issue is blocked by <issue>")
    .option("--relates-to <issue>", "this issue relates to <issue>")
    .option("--duplicate-of <issue>", "this issue duplicates <issue>")
    .option("--similar-to <issue>", "this issue is similar to <issue>")
    .action(
      commandAction<[string, CreateOptions, Command]>(
        async (title, options, command) => {
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

          if (options.projectMilestone && !options.project) {
            throw new Error(
              "--project-milestone requires --project to be specified",
            );
          }

          const idsInput: ResolveCreateIssueIdsInput = {
            team: options.team,
            withEstimateContext: parsedEstimate !== undefined,
          };
          if (options.assignee) idsInput.assignee = options.assignee;
          if (options.project) idsInput.project = options.project;
          if (options.labels) {
            idsInput.labels = options.labels.split(",").map((l) => l.trim());
          }
          if (options.projectMilestone) {
            idsInput.projectMilestone = options.projectMilestone;
          }
          if (options.cycle) idsInput.cycle = options.cycle;
          if (options.status) idsInput.status = options.status;
          if (options.parentTicket)
            idsInput.parentTicket = options.parentTicket;
          if (options.subscribers) {
            idsInput.subscribers = parseCommaSeparated(options.subscribers);
          }
          if (options.delegate) idsInput.delegate = options.delegate;

          const ids = await resolveCreateIssueIds(ctx.gql, idsInput);

          if (parsedEstimate !== undefined && ids.estimateContext) {
            validateEstimateAgainstTeamConfig(parsedEstimate, {
              teamKey: ids.estimateContext.teamKey,
              issueEstimationType: ids.estimateContext.issueEstimationType,
              issueEstimationExtended:
                ids.estimateContext.issueEstimationExtended,
              issueEstimationAllowZero:
                ids.estimateContext.issueEstimationAllowZero,
            });
          }

          const input: CreateIssueInput = {
            title,
            teamId: ids.teamId,
          };

          if (options.description) {
            input.description = options.description;
          }

          if (ids.assigneeId) {
            input.assigneeId = ids.assigneeId;
          }

          if (parsedPriority !== undefined) {
            input.priority = parsedPriority;
          }

          if (parsedEstimate !== undefined) {
            input.estimate = parsedEstimate;
          }

          if (ids.projectId) {
            input.projectId = ids.projectId;
          }

          if (ids.labelIds) {
            input.labelIds = ids.labelIds;
          }

          if (ids.projectMilestoneId) {
            input.projectMilestoneId = ids.projectMilestoneId;
          }

          if (ids.cycleId) {
            input.cycleId = ids.cycleId;
          }

          if (ids.stateId) {
            input.stateId = ids.stateId;
          }

          if (ids.parentId) {
            input.parentId = ids.parentId;
          }

          if (ids.subscriberIds) {
            input.subscriberIds = ids.subscriberIds;
          }

          if (ids.delegateId) {
            input.delegateId = ids.delegateId;
          }

          if (options.dueDate) {
            input.dueDate = parseDueDate(options.dueDate);
          }

          const result = await createIssue(ctx.gql, input);

          if (relationActions.length > 0) {
            await resolveAndApplyRelations(
              ctx,
              asUuid(result.id),
              relationActions,
            );
          }

          outputSuccess(result);
        },
      ),
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
    .option("--clear-assignee", "clear assignee")
    .option("--project <project>", "new project")
    .option("--clear-project", "clear project (also clears project milestone)")
    .option("--labels <labels>", "labels to apply (comma-separated)")
    .option("--label-mode <mode>", "add | remove | overwrite")
    .option("--clear-labels", "remove all labels")
    .option("--parent-ticket <issue>", "set parent issue")
    .option("--clear-parent-ticket", "clear parent")
    .option("--project-milestone <ms>", "set project milestone")
    .option("--clear-project-milestone", "clear project milestone")
    .option("--cycle <cycle>", "set cycle")
    .option("--clear-cycle", "clear cycle")
    .option("--team <team>", "move the issue to another team")
    .option("--subscribers <users>", "subscribers to apply (comma-separated)")
    .option("--subscriber-mode <mode>", "add | remove | overwrite")
    .option("--clear-subscribers", "remove all subscribers")
    .option("--delegate <user>", "set delegate")
    .option("--clear-delegate", "clear delegate")
    .option("--estimate <n>", "new estimate")
    .option("--clear-estimate", "clear estimate")
    .option("--due-date <date>", "set due date (YYYY-MM-DD)")
    .option("--clear-due-date", "clear due date")
    .option("--blocks <issue>", "add blocks relation")
    .option("--blocked-by <issue>", "add blocked-by relation")
    .option("--relates-to <issue>", "add relates-to relation")
    .option("--duplicate-of <issue>", "add duplicate relation")
    .option("--similar-to <issue>", "add similar relation")
    .option("--remove-relation <issue>", "remove relation with <issue>")
    .action(
      commandAction<[string, UpdateOptions, Command]>(
        async (issue, options, command) => {
          if (options.assignee && options.clearAssignee) {
            throw new Error(
              "Cannot use --assignee and --clear-assignee together",
            );
          }

          if (options.project && options.clearProject) {
            throw new Error(
              "Cannot use --project and --clear-project together",
            );
          }

          if (options.clearProject && options.projectMilestone) {
            throw new Error(
              "Cannot use --clear-project and --project-milestone together",
            );
          }

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

          if (options.subscriberMode && !options.subscribers) {
            throw new Error(
              "--subscriber-mode requires --subscribers to be specified",
            );
          }

          if (options.clearSubscribers && options.subscribers) {
            throw new Error(
              "--clear-subscribers cannot be used with --subscribers",
            );
          }

          if (options.clearSubscribers && options.subscriberMode) {
            throw new Error(
              "--clear-subscribers cannot be used with --subscriber-mode",
            );
          }

          if (options.delegate && options.clearDelegate) {
            throw new Error(
              "Cannot use --delegate and --clear-delegate together",
            );
          }

          const labelMode = parseLabelMode(options.labelMode);
          const subscriberMode = parseSetMode(
            "--subscriber-mode",
            options.subscriberMode,
          );

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

          // The estimate has to satisfy the scale of the team that ends up
          // owning the issue. With --team that is the destination, not the
          // team the issue is leaving: validating against the current team
          // would reject a value the move makes legal and wave through one it
          // makes illegal, which then comes back as a raw API error.
          const destinationEstimateTeam =
            parsedEstimate !== undefined && options.team
              ? await resolveTeamEstimateContext(ctx.gql, options.team)
              : undefined;

          const issueEstimateContext =
            parsedEstimate !== undefined && !destinationEstimateTeam
              ? await resolveIssueEstimateContext(ctx.gql, issue)
              : undefined;

          const resolvedIssueId = issueEstimateContext
            ? issueEstimateContext.issueId
            : await resolveIssueId(ctx.gql, issue);

          const estimateTeam =
            destinationEstimateTeam ?? issueEstimateContext?.team;

          if (parsedEstimate !== undefined && estimateTeam) {
            validateEstimateAgainstTeamConfig(parsedEstimate, {
              teamKey: estimateTeam.teamKey,
              issueEstimationType: estimateTeam.issueEstimationType,
              issueEstimationExtended: estimateTeam.issueEstimationExtended,
              issueEstimationAllowZero: estimateTeam.issueEstimationAllowZero,
            });
          }

          const needsContext =
            options.status ||
            options.projectMilestone ||
            options.cycle ||
            (options.labels &&
              (labelMode === "add" || labelMode === "remove")) ||
            (options.subscribers &&
              (subscriberMode === "add" || subscriberMode === "remove"));
          const issueContext = needsContext
            ? await getIssue(ctx.gql, resolvedIssueId)
            : undefined;

          const updContext: UpdateIssueContext = {};
          if (issueContext && "team" in issueContext && issueContext.team) {
            updContext.teamId = asUuid(issueContext.team.id);
            if (issueContext.team.key) {
              updContext.teamKey = issueContext.team.key;
            }
          }
          if (
            issueContext &&
            "project" in issueContext &&
            issueContext.project?.name
          ) {
            updContext.projectName = issueContext.project.name;
          }

          const updIdsInput: ResolveUpdateIssueIdsInput = {};
          if (!options.clearAssignee && options.assignee) {
            updIdsInput.assignee = options.assignee;
          }
          if (!options.clearProject && options.project) {
            updIdsInput.project = options.project;
          }
          if (!options.clearLabels && options.labels) {
            updIdsInput.labels = options.labels.split(",").map((l) => l.trim());
          }
          if (!options.clearProjectMilestone && options.projectMilestone) {
            updIdsInput.projectMilestone = options.projectMilestone;
          }
          if (!options.clearCycle && options.cycle) {
            updIdsInput.cycle = options.cycle;
          }
          if (options.status) updIdsInput.status = options.status;
          if (!options.clearParentTicket && options.parentTicket) {
            updIdsInput.parentTicket = options.parentTicket;
          }
          if (options.team) updIdsInput.team = options.team;
          if (!options.clearSubscribers && options.subscribers) {
            updIdsInput.subscribers = parseCommaSeparated(options.subscribers);
          }
          if (!options.clearDelegate && options.delegate) {
            updIdsInput.delegate = options.delegate;
          }

          const needsResolution =
            updIdsInput.assignee !== undefined ||
            updIdsInput.project !== undefined ||
            updIdsInput.labels !== undefined ||
            updIdsInput.projectMilestone !== undefined ||
            updIdsInput.cycle !== undefined ||
            updIdsInput.status !== undefined ||
            updIdsInput.parentTicket !== undefined ||
            updIdsInput.team !== undefined ||
            updIdsInput.subscribers !== undefined ||
            updIdsInput.delegate !== undefined;

          const ids: ResolvedUpdateIssueIds = needsResolution
            ? await resolveUpdateIssueIds(ctx.gql, updIdsInput, updContext)
            : {};

          const input: UpdateIssueInput = {};

          if (options.title) {
            input.title = options.title;
          }

          if (options.description) {
            input.description = options.description;
          }

          if (ids.stateId) {
            input.stateId = ids.stateId;
          }

          if (parsedPriority !== undefined) {
            input.priority = parsedPriority;
          }

          if (options.clearEstimate) {
            input.estimate = null;
          } else if (parsedEstimate !== undefined) {
            input.estimate = parsedEstimate;
          }

          if (options.clearAssignee) {
            input.assigneeId = null;
          } else if (ids.assigneeId) {
            input.assigneeId = ids.assigneeId;
          }

          if (options.clearProject) {
            input.projectId = null;
          } else if (ids.projectId) {
            input.projectId = ids.projectId;
          }

          if (options.clearLabels) {
            input.labelIds = [];
          } else if (options.labels && ids.labelIds) {
            const labelIds = ids.labelIds;
            const currentLabels =
              issueContext &&
              "labels" in issueContext &&
              issueContext.labels?.nodes
                ? issueContext.labels.nodes.map((l) => asUuid(l.id))
                : [];

            input.labelIds = applySetMode(labelMode, currentLabels, labelIds);
          }

          if (options.clearParentTicket) {
            input.parentId = null;
          } else if (ids.parentId) {
            input.parentId = ids.parentId;
          }

          // A milestone belongs to a project, so --clear-project must detach the
          // milestone too — otherwise the issue keeps pointing at a milestone of
          // a project it no longer belongs to. Moving the issue to a different
          // project with --project is deliberately not handled here: the new
          // milestone is the caller's to pick, and reconciling the old one is
          // left to the API rather than guessed at locally.
          if (options.clearProjectMilestone || options.clearProject) {
            input.projectMilestoneId = null;
          } else if (ids.projectMilestoneId) {
            input.projectMilestoneId = ids.projectMilestoneId;
          }

          if (options.clearCycle) {
            input.cycleId = null;
          } else if (ids.cycleId) {
            input.cycleId = ids.cycleId;
          }

          if (ids.teamId) {
            input.teamId = ids.teamId;
          }

          if (options.clearSubscribers) {
            input.subscriberIds = [];
          } else if (options.subscribers && ids.subscriberIds) {
            input.subscriberIds = applySetMode(
              subscriberMode,
              currentSubscriberIds(issueContext),
              ids.subscriberIds,
            );
          }

          if (options.clearDelegate) {
            input.delegateId = null;
          } else if (ids.delegateId) {
            input.delegateId = ids.delegateId;
          }

          if (options.clearDueDate) {
            input.dueDate = null;
          } else if (options.dueDate) {
            input.dueDate = parseDueDate(options.dueDate);
          }

          const result = await updateIssue(ctx.gql, resolvedIssueId, input);

          if (relationActions.length > 0) {
            await resolveAndApplyRelations(
              ctx,
              resolvedIssueId,
              relationActions,
            );
          }

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("from-branch [branch]")
    .description("find the issue a git branch belongs to")
    .addHelpText(
      "after",
      "\nWith no argument the current checkout's branch is used, so this works as `linearis issues from-branch` inside a worktree.",
    )
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (branch, _unused1, command) => {
          const branchName = branch ?? getCurrentBranch();
          const ctx = createContext(getRootOpts(command));
          const result = await findIssueByBranch(ctx.gql, branchName);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("subscribe <issue>")
    .description("subscribe a user to an issue's notifications")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--user <user>", "user to subscribe (defaults to you)")
    .action(
      commandAction<[string, SubscriberOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const [issueId, userId] = await resolveIssueAndUser(
            ctx,
            issue,
            options.user,
          );
          const result = await subscribeToIssue(ctx.gql, issueId, userId);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("unsubscribe <issue>")
    .description("remove a user from an issue's subscribers")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--user <user>", "user to unsubscribe (defaults to you)")
    .action(
      commandAction<[string, SubscriberOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const [issueId, userId] = await resolveIssueAndUser(
            ctx,
            issue,
            options.user,
          );
          const result = await unsubscribeFromIssue(ctx.gql, issueId, userId);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("share <issue>")
    .description("grant a user access to an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.\nThis grants access; it does not mint a link. The issue's permalink is the \`url\` field on \`issues read\`.`,
    )
    .requiredOption("--with <user>", "user to grant access to")
    .action(
      commandAction<[string, ShareOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const [issueId, userId] = await resolveIssueAndUser(
            ctx,
            issue,
            options.with,
          );
          const result = await shareIssue(ctx.gql, issueId, userId);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("unshare <issue>")
    .description("revoke a user's access to an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .requiredOption("--with <user>", "user to revoke access from")
    .action(
      commandAction<[string, ShareOptions, Command]>(
        async (issue, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const [issueId, userId] = await resolveIssueAndUser(
            ctx,
            issue,
            options.with,
          );
          const result = await unshareIssue(ctx.gql, issueId, userId);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("remind <issue>")
    .description("schedule a reminder for yourself on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.\n--at accepts an ISO-8601 instant (2026-08-14T09:00:00Z) or a relative offset (+2h, +3d).`,
    )
    .requiredOption("--at <when>", "when to be reminded")
    .action(
      commandAction<[string, RemindOptions, Command]>(
        async (issue, options, command) => {
          const reminderAt = parseDateTimeOption("--at", options.at);
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await remindOnIssue(ctx.gql, issueId, reminderAt);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("archive <issue>")
    .description("archive an issue")
    .action(
      commandAction<[string, unknown, Command]>(
        async (issue, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await archiveIssue(ctx.gql, issueId);
          outputSuccess(result);
        },
      ),
    );

  issues
    .command("unarchive <issue>")
    .description("unarchive an issue")
    .action(
      commandAction<[string, unknown, Command]>(
        async (issue, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await unarchiveIssue(ctx.gql, issueId);
          outputSuccess(result);
        },
      ),
    );

  issues
    .command("restore <issue>")
    .description("restore an issue from the trash")
    .addHelpText(
      "after",
      "\n`issues delete` trashes rather than destroys, and this is the way back. Archiving is a separate state — use `issues unarchive` for that.",
    )
    .action(
      commandAction<[string, unknown, Command]>(
        async (issue, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await restoreIssue(ctx.gql, issueId);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("snooze <issue>")
    .description("snooze an issue until a given time, or wake it")
    .addHelpText(
      "after",
      "\n--until accepts an ISO-8601 instant (2026-08-20T09:00:00Z) or a relative offset (+2h, +3d).",
    )
    .option("--until <when>", "snooze until this instant")
    .option("--clear", "wake the issue now")
    .action(
      commandAction<[string, SnoozeOptions, Command]>(
        async (issue, options, command) => {
          const snoozedUntilAt = parseSnoozeTarget(options);
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await snoozeIssue(ctx.gql, issueId, snoozedUntilAt);

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("delete <issue>")
    .description("delete an issue")
    .action(
      commandAction<[string, unknown, Command]>(
        async (issue, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await deleteIssue(ctx.gql, issueId);
          outputSuccess(result);
        },
      ),
    );

  issues
    .command("usage")
    .description("show detailed usage for issues")
    .action(() => {
      console.log(formatDomainUsage(issues, ISSUES_META));
    });
}
