import type { Command } from "commander";
import { firstOrThrow } from "../common/array.js";
import type { CommandContext } from "../common/context.js";
import { createContext, getRootOpts } from "../common/context.js";
import { parseLabelMode } from "../common/domain-values.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import { validateEstimateAgainstTeamConfig } from "../common/estimate-validation.js";
import {
  asUuid,
  isUuid,
  parseDueDate,
  parseIssueIdentifier,
  type UUID,
} from "../common/identifier.js";
import {
  assigneeChoices,
  cycleChoices,
  estimateChoices,
  issueChoices,
  labelChoices,
  milestoneChoices,
  optionalChoices,
  optionalProjectChoices,
  priorityChoices,
  projectChoices,
  statusChoices,
  teamChoices,
  userChoices,
} from "../common/interactive/choices.js";
import {
  maybeCollectInteractive,
  normalizeWizardLists,
} from "../common/interactive/engine.js";
import { shouldPrompt } from "../common/interactive/gating.js";
import {
  type ChoicePicker,
  makeChoicePicker,
} from "../common/interactive/pickers.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import type { RawFilterFlags } from "../common/issue-filter.js";
import {
  parseEstimateOption,
  parsePriorityOption,
} from "../common/number-options.js";
import { commandAction, outputSuccess, parseLimit } from "../common/output.js";
import { resolveFilterOptions } from "../common/resolve-filters.js";
import { buildPaginationOptions } from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import type { IssueRelationType } from "../gql/graphql.js";
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
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
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
  type UpdateIssueInput,
  unarchiveIssue,
  updateIssue,
} from "../services/issue-service.js";
import {
  createReactionForIssue,
  deleteOwnReactionByEmoji,
  deleteOwnReactionById,
} from "../services/reaction-service.js";
import {
  makeDiscussionPickers,
  resolveDiscussionBody,
  resolveEmojiPositional,
  resolvePickedPositional,
} from "./discussion-pickers.js";

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
  similarTo?: string;
  removeRelation?: string;
}

/** Create-wizard shape: the options interface plus the `title` positional. */
interface CreateWizardOptions extends Record<string, unknown> {
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
  title?: string;
}

/**
 * Update-wizard shape: the update options plus a synthetic `team` the command
 * seeds from the resolved issue (never a CLI flag) so team-scoped pickers work.
 */
type UpdateWizardOptions = UpdateOptions & {
  team?: string;
} & Record<string, unknown>;

/**
 * Interactive wizard for `issues create`. Fields are ordered so cross-field
 * deps resolve (team before cycle/status; project before milestone). Entity
 * choice values are UUIDs (see choices.ts); the resolvers pass those through
 * unchanged.
 */
export const issueCreateSpec: PromptSpec<CreateWizardOptions> = {
  intro: "Create a new issue",
  fields: [
    {
      name: "team",
      kind: "select",
      message: "Team",
      required: true,
      searchable: true,
      choices: teamChoices,
    },
    { name: "title", kind: "text", message: "Title", required: true },
    { name: "description", kind: "multiline", message: "Description" },
    {
      name: "assignee",
      kind: "select",
      message: "Assignee",
      searchable: true,
      choices: assigneeChoices,
    },
    {
      name: "priority",
      kind: "select",
      message: "Priority",
      choices: async () => priorityChoices(),
    },
    {
      name: "project",
      kind: "select",
      message: "Project",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalProjectChoices,
    },
    {
      name: "projectMilestone",
      kind: "select",
      message: "Milestone",
      searchable: true,
      when: (draft) => draft.project !== undefined,
      choices: optionalChoices(milestoneChoices, "None (no milestone)"),
    },
    {
      name: "cycle",
      kind: "select",
      message: "Cycle",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalChoices(cycleChoices, "None (no cycle)"),
    },
    {
      name: "status",
      kind: "select",
      message: "Status",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalChoices(statusChoices, "None (team default)"),
    },
    {
      name: "labels",
      kind: "multiselect",
      message: "Labels",
      required: false,
      searchable: true,
      choices: labelChoices,
    },
    {
      name: "estimate",
      kind: "select",
      message: "Estimate",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalChoices(estimateChoices, "None (no estimate)"),
    },
    {
      name: "dueDate",
      kind: "date",
      message: "Due date",
    },
  ],
};

/**
 * Interactive wizard for `issues update`. Mirrors {@link issueCreateSpec} so
 * the update prompts behave identically: the selected issue's `team` UUID is
 * seeded into the draft by the command (see the `update` action) before this
 * runs, which is what lets the team-scoped pickers (project, milestone, cycle,
 * status, estimate) work exactly as they do on create. All fields are optional
 * — a field left unset means "leave unchanged".
 */
export const issueUpdateSpec: PromptSpec<UpdateWizardOptions> = {
  intro: "Update an issue",
  fields: [
    {
      name: "title",
      kind: "text",
      message: "Title",
    },
    {
      name: "description",
      kind: "multiline",
      message: "Description",
    },
    {
      name: "assignee",
      kind: "select",
      message: "Assignee",
      searchable: true,
      // "Keep current" (not the create-only "None (unassigned)"): an empty
      // selection leaves the assignee unchanged on update, so the sentinel must
      // not imply it unassigns.
      choices: optionalChoices(userChoices, "Keep current"),
    },
    {
      name: "priority",
      kind: "select",
      message: "Priority",
      choices: async () => priorityChoices(),
    },
    {
      name: "project",
      kind: "select",
      message: "Project",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      // "Keep current" (not the create-only "None (no project)"): an empty
      // selection leaves the project unchanged on update.
      choices: optionalChoices(projectChoices, "Keep current"),
    },
    {
      name: "projectMilestone",
      kind: "select",
      message: "Milestone",
      searchable: true,
      when: (draft) => draft.project !== undefined,
      choices: optionalChoices(milestoneChoices, "Keep current"),
    },
    {
      name: "cycle",
      kind: "select",
      message: "Cycle",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalChoices(cycleChoices, "Keep current"),
    },
    {
      name: "status",
      kind: "select",
      message: "Status",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalChoices(statusChoices, "Keep current"),
    },
    {
      name: "labels",
      kind: "multiselect",
      message: "Labels",
      required: false,
      searchable: true,
      choices: labelChoices,
    },
    {
      name: "estimate",
      kind: "select",
      message: "Estimate",
      searchable: true,
      when: (draft) => draft.team !== undefined,
      choices: optionalChoices(estimateChoices, "Keep current"),
    },
    {
      name: "dueDate",
      kind: "date",
      message: "Due date",
    },
  ],
};

/**
 * Entity picker for an absent `<issue>` positional. Lists recent open issues
 * and returns the selected issue's identifier (which the resolver accepts).
 */
const issuePicker = makeChoicePicker("Issue", issueChoices);

/**
 * Cross-field picker for an absent `[relation]` positional. Picks the parent
 * issue, lists its relations, and returns the selected relation's UUID (which
 * `deleteIssueRelation` accepts). An issue with no relations shows a non-fatal
 * notice and re-prompts rather than aborting the command.
 */
async function relationPicker(
  ctx: CommandContext,
  io: PromptIO,
): Promise<string> {
  for (;;) {
    const issueIdentifier = await issuePicker(ctx, io);
    const issueId = await resolveIssueId(ctx.gql, issueIdentifier);
    const { relations } = await listIssueRelations(ctx.gql, issueId);
    if (relations.length === 0) {
      io.intro?.("That issue has no relations — choose another.");
      continue;
    }
    const options = relations.map((relation) => ({
      value: relation.id,
      label: `${relation.type}: ${relation.issue.identifier} → ${relation.relatedIssue.identifier}`,
      ...(relation.relatedIssue.title
        ? { hint: relation.relatedIssue.title }
        : {}),
    }));
    const answer = await io.autocomplete({ message: "Relation", options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  }
}

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * Fill an absent `<issue>` positional via the issue picker when gating allows,
 * else require it (preserving the old missing-argument error for
 * agents/pipes). The command body downstream is unchanged.
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

/**
 * Discussion positional pickers for the issue domain. `rootThreadPicker` fills a
 * `[thread]`, `commentOrReplyPicker` fills a `[comment]` (root or reply, matching
 * what `edit`/`delete-comment` accept), and `replyPicker` fills a `[reply]`.
 */
const { rootThreadPicker, commentOrReplyPicker, replyPicker } =
  makeDiscussionPickers({
    entityKind: "issue",
    entityPicker: issuePicker,
    resolveEntityId: (ctx, human) => resolveIssueId(ctx.gql, human),
    listThreads: listDiscussionsForIssue,
  });

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
  picker: ChoicePicker,
): void {
  parent
    .command(`react [${noun}] [emoji]`)
    .description(`add a reaction to a discussion ${noun}`)
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      commandAction<
        [string | undefined, string | undefined, ReactionOptions, Command]
      >(async (commentId, emoji, options, command) => {
        const ctx = createContext(getRootOpts(command));
        const resolvedComment = await resolvePickedPositional(
          ctx,
          command,
          noun,
          commentId,
          picker,
        );
        const resolvedEmoji = await resolveEmojiPositional(
          ctx,
          command,
          emoji,
          options.shortcode,
        );
        const result = await createDiscussionCommentReaction(ctx.gql, {
          commentId: asUuid(resolvedComment),
          target: noun,
          expectedEntityKind: "issue",
          emoji: resolveReactionEmojiInput(resolvedEmoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  parent
    .command(`unreact [${noun}] [emoji]`)
    .description(`remove your reaction from a discussion ${noun} by emoji`)
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .action(
      commandAction<
        [string | undefined, string | undefined, ReactionOptions, Command]
      >(async (commentId, emoji, options, command) => {
        const ctx = createContext(getRootOpts(command));
        const resolvedComment = await resolvePickedPositional(
          ctx,
          command,
          noun,
          commentId,
          picker,
        );
        const resolvedEmoji = await resolveEmojiPositional(
          ctx,
          command,
          emoji,
          options.shortcode,
        );
        const result = await deleteDiscussionCommentReactionByEmoji(ctx.gql, {
          commentId: asUuid(resolvedComment),
          target: noun,
          expectedEntityKind: "issue",
          emoji: resolveReactionEmojiInput(resolvedEmoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  parent
    // `unreact-id` stays fully non-interactive: its <reactionId> cannot be
    // sourced from any list service, so a picker would be a half-interactive
    // trap. It remains the flag-only by-ID escape hatch for agents.
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
    "duplicate-of) are supported.",
  ].join("\n"),
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    title: "string",
    query: "full-text search term",
  },
  seeAlso: [
    "issues activity <issue>",
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

  const relations = issues
    .command("relations")
    .description("Issue relation operations");

  relations.action(() => relations.help());

  relations
    .command("list [issue]")
    .description("list relations for an issue")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (issueArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issue = await resolveIssuePositional(ctx, command, issueArg);
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await listIssueRelations(ctx.gql, issueId);

          outputSuccess(result);
        },
      ),
    );

  relations
    .command("add [issue]")
    .description("add relation(s) to an issue")
    .option("--blocks <issues>", "issues this issue blocks (comma-separated)")
    .option("--related <issues>", "related issues (comma-separated)")
    .option(
      "--duplicate <issues>",
      "issues this is a duplicate of (comma-separated)",
    )
    .option("--similar <issues>", "similar issues (comma-separated)")
    .action(
      commandAction<[string | undefined, RelationAddOptions, Command]>(
        async (issueArg, options, command) => {
          const relation = parseRelationAddOptions(options);
          const ctx = createContext(getRootOpts(command));
          const issue = await resolveIssuePositional(ctx, command, issueArg);
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
    .command("remove [relation]")
    .description("remove a relation by UUID")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (relationArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const relation = await resolvePickedPositional(
            ctx,
            command,
            "relation",
            relationArg,
            relationPicker,
          );
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
      .option("-l, --limit <n>", "max results", "50")
      .option("--after <cursor>", "cursor for next page"),
  ).action(
    commandAction<[FilterOptions, Command]>(async (options, command) => {
      const ctx = createContext(getRootOpts(command));

      const paginationOptions = buildPaginationOptions(
        parseLimit(options.limit),
        options.after,
      );

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
    commandAction<[string, FilterOptions, Command]>(
      async (query, options, command) => {
        const ctx = createContext(getRootOpts(command));

        const paginationOptions = buildPaginationOptions(
          parseLimit(options.limit),
          options.after,
        );

        const filterOptions = await resolveFilterOptions(ctx, options);
        const filter = buildIssueFilter(filterOptions);
        const result = await searchIssues(
          ctx.gql,
          query,
          paginationOptions,
          filter,
        );
        outputSuccess(result);
      },
    ),
  );

  issues
    .command("read [issue]")
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
      commandAction<[string | undefined, ReadOptions, Command]>(
        async (issueArg, options, command) => {
          validateReadOptions(options);
          const ctx = createContext(getRootOpts(command));
          const issue = await resolveIssuePositional(ctx, command, issueArg);

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
    .command("react [issue] [emoji]")
    .description("add a root reaction to an issue")
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      commandAction<
        [string | undefined, string | undefined, ReactionOptions, Command]
      >(async (issueArg, emojiArg, options, command) => {
        const ctx = createContext(getRootOpts(command));
        const issue = await resolveIssuePositional(ctx, command, issueArg);
        const emoji = await resolveEmojiPositional(
          ctx,
          command,
          emojiArg,
          options.shortcode,
        );
        const issueId = await resolveIssueId(ctx.gql, issue);
        const result = await createReactionForIssue(ctx.gql, {
          issueId,
          emoji: resolveReactionEmojiInput(emoji, options.shortcode),
        });

        outputSuccess(result);
      }),
    );

  issues
    .command("unreact [issue] [emoji]")
    .description("remove your root reaction from an issue by emoji")
    .option("--shortcode <name>", "emoji shortcode (e.g. thumbs_up)")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .action(
      commandAction<
        [string | undefined, string | undefined, ReactionOptions, Command]
      >(async (issueArg, emojiArg, options, command) => {
        const ctx = createContext(getRootOpts(command));
        const issue = await resolveIssuePositional(ctx, command, issueArg);
        const emoji = await resolveEmojiPositional(
          ctx,
          command,
          emojiArg,
          options.shortcode,
        );
        const issueId = await resolveIssueId(ctx.gql, issue);
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
    .command("discuss [issue]")
    .description("start a discussion thread on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("--body <text>", "discussion body (required, markdown supported)")
    .action(
      commandAction<[string | undefined, DiscussionBodyOptions, Command]>(
        async (issueArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const issue = await resolveIssuePositional(ctx, command, issueArg);
          const body = await resolveDiscussionBody(ctx, command, options);
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await startIssueDiscussion(ctx.gql, {
            issueId,
            body,
          });

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("activity [issue]")
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
      commandAction<[string | undefined, ActivityOptions, Command]>(
        async (issueArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const issue = await resolveIssuePositional(ctx, command, issueArg);
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
    .command("discussions [issue]")
    .description("list root discussion threads on an issue")
    .addHelpText(
      "after",
      `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`,
    )
    .option("-l, --limit <n>", "max results", "25")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      commandAction<[string | undefined, DiscussionsOptions, Command]>(
        async (issueArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const issue = await resolveIssuePositional(ctx, command, issueArg);
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
  addCommentReactionCommands(issueThreads, "thread", rootThreadPicker);

  const issueReplies = issues
    .command("replies [thread]")
    .description("list replies in a root discussion thread")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      commandAction<[string | undefined, DiscussionsOptions, Command]>(
        async (thread, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const threadId = await resolvePickedPositional(
            ctx,
            command,
            "thread",
            thread,
            rootThreadPicker,
          );
          const paginationOptions = buildPaginationOptions(
            parseLimit(options.limit || "50"),
            options.after,
          );
          const result = options.withReactions
            ? await listDiscussionRepliesWithReactions(
                ctx.gql,
                asUuid(threadId),
                paginationOptions,
                "issue",
              )
            : await listDiscussionReplies(
                ctx.gql,
                asUuid(threadId),
                paginationOptions,
                "issue",
              );

          outputSuccess(result);
        },
      ),
    );
  addCommentReactionCommands(issueReplies, "reply", replyPicker);

  issues
    .command("reply [thread]")
    .description("reply to a root discussion thread")
    .addHelpText(
      "after",
      "\nImportant: `[thread]` must be a root discussion thread ID.",
    )
    .option("--body <text>", "reply body (required, markdown supported)")
    .action(
      commandAction<[string | undefined, DiscussionBodyOptions, Command]>(
        async (thread, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const threadId = await resolvePickedPositional(
            ctx,
            command,
            "thread",
            thread,
            rootThreadPicker,
          );
          const body = await resolveDiscussionBody(ctx, command, options);

          const result = await replyToDiscussion(ctx.gql, {
            threadId: asUuid(threadId),
            body,
            entityKind: "issue",
          });

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("edit [comment]")
    .description("edit a root discussion or reply comment")
    .option("--body <text>", "new comment body (required, markdown supported)")
    .action(
      commandAction<[string | undefined, DiscussionBodyOptions, Command]>(
        async (comment, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const commentId = await resolvePickedPositional(
            ctx,
            command,
            "comment",
            comment,
            commentOrReplyPicker,
          );
          const body = await resolveDiscussionBody(ctx, command, options);

          const result = await editDiscussionComment(
            ctx.gql,
            asUuid(commentId),
            {
              body,
            },
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("edit-reply [reply]")
    .description("edit a discussion reply")
    .option("--body <text>", "new reply body (required, markdown supported)")
    .action(
      commandAction<[string | undefined, DiscussionBodyOptions, Command]>(
        async (reply, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const replyId = await resolvePickedPositional(
            ctx,
            command,
            "reply",
            reply,
            replyPicker,
          );
          const body = await resolveDiscussionBody(ctx, command, options);

          const result = await editDiscussionReply(
            ctx.gql,
            asUuid(replyId),
            {
              body,
            },
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("delete-comment [comment]")
    .description("delete a root discussion or reply comment")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (comment, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));

          const commentId = await resolvePickedPositional(
            ctx,
            command,
            "comment",
            comment,
            commentOrReplyPicker,
          );
          const result = await deleteDiscussionComment(
            ctx.gql,
            asUuid(commentId),
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("delete-reply [reply]")
    .description("delete a discussion reply")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (reply, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));

          const replyId = await resolvePickedPositional(
            ctx,
            command,
            "reply",
            reply,
            replyPicker,
          );
          const result = await deleteDiscussionReply(
            ctx.gql,
            asUuid(replyId),
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("resolve [thread]")
    .description("resolve a discussion thread")
    .option("--with-comment <comment>", "comment to mark as resolving comment")
    .action(
      commandAction<[string | undefined, ResolveDiscussionOptions, Command]>(
        async (thread, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const threadId = await resolvePickedPositional(
            ctx,
            command,
            "thread",
            thread,
            rootThreadPicker,
          );
          const result = await resolveDiscussion(ctx.gql, {
            threadId: asUuid(threadId),
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
    .command("unresolve [thread]")
    .description("unresolve a discussion thread")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (thread, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));

          const threadId = await resolvePickedPositional(
            ctx,
            command,
            "thread",
            thread,
            rootThreadPicker,
          );
          const result = await unresolveDiscussion(
            ctx.gql,
            asUuid(threadId),
            "issue",
          );

          outputSuccess(result);
        },
      ),
    );

  issues
    .command("create [title]")
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
    .option("--similar-to <issue>", "this issue is similar to <issue>")
    .action(
      commandAction<[string | undefined, CreateOptions, Command]>(
        async (title, options, command) => {
          const rootOpts = getRootOpts(command);
          const ctx = createContext(rootOpts);

          const missingRequired =
            title === undefined || options.team === undefined;

          // When the field wizard will run, resolve any human-readable
          // --team/--project flags to UUIDs up front so the team/project-scoped
          // choice loaders (cycle, status, labels, milestone) filter correctly.
          // Mirrors the update path, which seeds the resolved team UUID: without
          // this, `-i --team ENG` would filter those pickers on the raw key and
          // silently offer no options.
          let seededOptions = options;
          if (shouldPrompt(rootOpts, { missingRequired })) {
            const [teamId, projectId] = await Promise.all([
              options.team ? resolveTeamId(ctx.gql, options.team) : undefined,
              options.project
                ? resolveProjectId(ctx.gql, options.project)
                : undefined,
            ]);
            seededOptions = {
              ...options,
              ...(teamId !== undefined ? { team: teamId } : {}),
              ...(projectId !== undefined ? { project: projectId } : {}),
            };
          }

          const filled = await maybeCollectInteractive<
            CreateWizardOptions,
            never
          >(ctx, rootOpts, {
            spec: issueCreateSpec,
            options: {
              ...seededOptions,
              ...(title !== undefined ? { title } : {}),
            } as CreateWizardOptions,
            missingRequired,
          });
          title = filled.options.title ?? title;
          if (title === undefined) {
            throw invalidParameterError("title", "is required");
          }
          options = normalizeWizardLists(filled.options, ["labels"]);

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
    .command("update [issue]")
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
    .option("--label-mode <mode>", "add | remove | overwrite")
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
    .option("--similar-to <issue>", "add similar relation")
    .option("--remove-relation <issue>", "remove relation with <issue>")
    .action(
      commandAction<[string | undefined, UpdateOptions, Command]>(
        async (issueArg, options, command) => {
          const rootOpts = getRootOpts(command);
          const ctx = createContext(rootOpts);

          // Resolve the issue first (prompts via the picker when it is missing
          // and interactive, otherwise uses the provided value or errors).
          // Doing this before the field wizard lets us seed the issue's team
          // so the team-scoped pickers match `issues create`.
          const issue = await resolveIssuePositional(ctx, command, issueArg);

          // When the field wizard will run, look up the issue's team and seed
          // it into the draft so project/milestone/cycle/status/estimate scope
          // to it exactly like create. Reused below for estimate validation.
          const seededEstimateContext = shouldPrompt(rootOpts, {
            missingRequired: issueArg === undefined,
          })
            ? await resolveIssueEstimateContext(ctx.gql, issue)
            : undefined;
          const wizardOptions = (
            seededEstimateContext
              ? { ...options, team: seededEstimateContext.team.teamId }
              : options
          ) as UpdateWizardOptions;

          const filled = await maybeCollectInteractive<
            UpdateWizardOptions,
            never
          >(ctx, rootOpts, {
            spec: issueUpdateSpec,
            options: wizardOptions,
            missingRequired: issueArg === undefined,
          });
          options = normalizeWizardLists(filled.options, ["labels"]);

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

          const labelMode = parseLabelMode(options.labelMode);

          const parsedPriority =
            options.priority !== undefined
              ? parsePriorityOption(options.priority)
              : undefined;
          const parsedEstimate =
            options.estimate !== undefined
              ? parseEstimateOption(options.estimate)
              : undefined;

          const relationActions = parseRelationFlags(options);

          const issueEstimateContext =
            parsedEstimate !== undefined
              ? (seededEstimateContext ??
                (await resolveIssueEstimateContext(ctx.gql, issue)))
              : undefined;

          const resolvedIssueId = issueEstimateContext
            ? issueEstimateContext.issueId
            : await resolveIssueId(ctx.gql, issue);

          if (parsedEstimate !== undefined && issueEstimateContext) {
            validateEstimateAgainstTeamConfig(parsedEstimate, {
              teamKey: issueEstimateContext.team.teamKey,
              issueEstimationType:
                issueEstimateContext.team.issueEstimationType,
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
            (options.labels && (labelMode === "add" || labelMode === "remove"));
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
          if (options.assignee) updIdsInput.assignee = options.assignee;
          if (options.project) updIdsInput.project = options.project;
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

          const needsResolution =
            updIdsInput.assignee !== undefined ||
            updIdsInput.project !== undefined ||
            updIdsInput.labels !== undefined ||
            updIdsInput.projectMilestone !== undefined ||
            updIdsInput.cycle !== undefined ||
            updIdsInput.status !== undefined ||
            updIdsInput.parentTicket !== undefined;

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

          if (ids.assigneeId) {
            input.assigneeId = ids.assigneeId;
          }

          if (ids.projectId) {
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

            if (labelMode === "add") {
              input.labelIds = [...new Set([...currentLabels, ...labelIds])];
            } else if (labelMode === "remove") {
              input.labelIds = currentLabels.filter(
                (id) => !labelIds.includes(id),
              );
            } else {
              input.labelIds = labelIds;
            }
          }

          if (options.clearParentTicket) {
            input.parentId = null;
          } else if (ids.parentId) {
            input.parentId = ids.parentId;
          }

          if (options.clearProjectMilestone) {
            input.projectMilestoneId = null;
          } else if (ids.projectMilestoneId) {
            input.projectMilestoneId = ids.projectMilestoneId;
          }

          if (options.clearCycle) {
            input.cycleId = null;
          } else if (ids.cycleId) {
            input.cycleId = ids.cycleId;
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
    .command("archive [issue]")
    .description("archive an issue")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (issueArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issue = await resolveIssuePositional(ctx, command, issueArg);
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await archiveIssue(ctx.gql, issueId);
          outputSuccess(result);
        },
      ),
    );

  issues
    .command("unarchive [issue]")
    .description("unarchive an issue")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (issueArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issue = await resolveIssuePositional(ctx, command, issueArg);
          const issueId = await resolveIssueId(ctx.gql, issue);
          const result = await unarchiveIssue(ctx.gql, issueId);
          outputSuccess(result);
        },
      ),
    );

  issues
    .command("delete [issue]")
    .description("delete an issue")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (issueArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const issue = await resolveIssuePositional(ctx, command, issueArg);
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
