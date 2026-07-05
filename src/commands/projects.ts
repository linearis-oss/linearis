import type { Command } from "commander";
import type { CommandContext } from "../common/context.js";
import { createContext, getRootOpts } from "../common/context.js";
import { type Priority, parseLabelMode } from "../common/domain-values.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import { asUuid } from "../common/identifier.js";
import {
  labelChoices,
  optionalChoices,
  priorityChoices,
  projectStatusChoices,
  teamChoices,
  userChoices,
} from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { ChoicePicker } from "../common/interactive/pickers.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { commandAction, outputSuccess, parseLimit } from "../common/output.js";
import { buildPaginationOptions } from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import {
  resolveProjectId,
  resolveProjectLabelIds,
} from "../resolvers/project-resolver.js";
import { resolveProjectStatusId } from "../resolvers/project-status-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
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
  listDiscussionsForProject,
  listDiscussionsForProjectWithReactions,
  replyToDiscussion,
  resolveDiscussion,
  startProjectDiscussion,
  unresolveDiscussion,
} from "../services/discussion-service.js";
import {
  archiveProject,
  type CreateProjectInput,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  type UpdateProjectInput,
  unarchiveProject,
  updateProject,
} from "../services/project-service.js";
import {
  makeDiscussionPickers,
  resolveDiscussionBody,
  resolveEmojiPositional,
  resolvePickedPositional,
} from "./discussion-pickers.js";

interface ListOptions {
  limit: string;
  after?: string;
  includeArchived?: boolean;
}

interface ReadOptions {
  milestonesFirst: string;
  issuesFirst: string;
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

interface ReactionOptions {
  shortcode?: string;
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
          expectedEntityKind: "project",
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
          expectedEntityKind: "project",
          emoji: resolveReactionEmojiInput(resolvedEmoji, options.shortcode),
        });
        outputSuccess(result);
      }),
    );

  parent
    // `unreact-id` stays fully non-interactive: its <reactionId> cannot be
    // sourced from any list service (flag-only by-ID escape hatch for agents).
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
            expectedEntityKind: "project",
            reactionId: asUuid(reactionId),
          });
          outputSuccess(result);
        },
      ),
    );
}

interface CreateOptions {
  teams?: string;
  team?: string;
  description?: string;
  content?: string;
  icon?: string;
  color?: string;
  lead?: string;
  members?: string;
  priority?: string;
  status?: string;
  startDate?: string;
  targetDate?: string;
  labels?: string;
}

interface UpdateOptions {
  name?: string;
  description?: string;
  content?: string;
  icon?: string;
  color?: string;
  lead?: string;
  clearLead?: boolean;
  members?: string;
  priority?: string;
  status?: string;
  startDate?: string;
  clearStartDate?: boolean;
  targetDate?: string;
  clearTargetDate?: boolean;
  teams?: string;
  team?: string;
  labels?: string;
  labelMode?: string;
  clearLabels?: boolean;
}

/** Create-wizard shape: the create options plus the `name` positional. */
type CreateWizardOptions = CreateOptions &
  Record<string, unknown> & { name?: string };

/** Update-wizard shape: the update options with an index signature. */
type UpdateWizardOptions = UpdateOptions & Record<string, unknown>;

/**
 * Interactive wizard for `projects create`. Entity choice values are UUIDs
 * (see choices.ts); the resolvers pass those through unchanged via
 * `isUuid(...)`. `teams` is a multiselect whose UUID list is joined into the
 * comma-separated `--teams` string the command body expects.
 */
export const projectCreateSpec: PromptSpec<CreateWizardOptions> = {
  intro: "Create a new project",
  fields: [
    { name: "name", kind: "text", message: "Name", required: true },
    {
      name: "teams",
      kind: "multiselect",
      message: "Teams",
      required: true,
      choices: teamChoices,
    },
    { name: "description", kind: "multiline", message: "Description" },
    { name: "content", kind: "multiline", message: "Content (markdown)" },
    { name: "icon", kind: "text", message: "Icon (emoji or icon name)" },
    {
      name: "color",
      kind: "text",
      message: "Color (hex, e.g. #B45309)",
      validate: (value) =>
        value === "" || /^#[0-9a-fA-F]{6}$/.test(value)
          ? undefined
          : "must be a hex color like #B45309",
    },
    {
      name: "lead",
      kind: "select",
      message: "Lead",
      choices: optionalChoices(userChoices, "None (no lead)"),
    },
    {
      name: "members",
      kind: "multiselect",
      message: "Members",
      choices: userChoices,
    },
    {
      name: "priority",
      kind: "select",
      message: "Priority",
      choices: async () => priorityChoices(),
    },
    {
      name: "status",
      kind: "select",
      message: "Status",
      choices: optionalChoices(projectStatusChoices, "None (no status)"),
    },
    {
      name: "labels",
      kind: "multiselect",
      message: "Labels",
      required: false,
      choices: labelChoices,
    },
    { name: "startDate", kind: "date", message: "Start date" },
    { name: "targetDate", kind: "date", message: "Target date" },
  ],
};

/**
 * Interactive wizard for `projects update`. All fields optional; current option
 * values seed each field and prevent re-prompting for fields already provided
 * by flags.
 */
export const projectUpdateSpec: PromptSpec<UpdateWizardOptions> = {
  intro: "Update a project",
  fields: [
    {
      name: "name",
      kind: "text",
      message: "Name",
    },
    {
      name: "description",
      kind: "multiline",
      message: "Description",
    },
    {
      name: "content",
      kind: "multiline",
      message: "Content (markdown)",
    },
    { name: "icon", kind: "text", message: "Icon (emoji or icon name)" },
    {
      name: "color",
      kind: "text",
      message: "Color (hex, e.g. #B45309)",
      validate: (value) =>
        value === "" || /^#[0-9a-fA-F]{6}$/.test(value)
          ? undefined
          : "must be a hex color like #B45309",
    },
    {
      name: "lead",
      kind: "select",
      message: "Lead",
      choices: optionalChoices(userChoices, "Keep current"),
    },
    {
      name: "members",
      kind: "multiselect",
      message: "Members",
      choices: userChoices,
    },
    {
      name: "priority",
      kind: "select",
      message: "Priority",
      choices: async () => priorityChoices(),
    },
    {
      name: "status",
      kind: "select",
      message: "Status",
      choices: optionalChoices(projectStatusChoices, "Keep current"),
    },
    {
      name: "labels",
      kind: "multiselect",
      message: "Labels",
      required: false,
      choices: labelChoices,
    },
    {
      name: "startDate",
      kind: "date",
      message: "Start date",
    },
    {
      name: "targetDate",
      kind: "date",
      message: "Target date",
    },
  ],
};

/**
 * Multiselect fields yield a `string[]` of UUIDs, but the command body expects
 * the CLI-shaped comma-separated `string`. Normalise the named keys in place so
 * the command body below the wizard call stays unchanged.
 */
function normalizeWizardLists<O extends Record<string, unknown>>(
  filled: O,
  keys: readonly string[],
): O {
  const normalized = { ...filled };
  for (const key of keys) {
    const value = normalized[key];
    if (Array.isArray(value)) {
      const joined = value.join(",");
      if (joined.length > 0) {
        (normalized as Record<string, unknown>)[key] = joined;
      } else {
        delete (normalized as Record<string, unknown>)[key];
      }
    }
  }
  return normalized;
}

/**
 * Entity picker for an absent `[project]` positional. Lists recent projects and
 * returns the selected project's UUID (which the resolver accepts).
 */
async function projectPicker(
  ctx: CommandContext,
  io: PromptIO,
): Promise<string> {
  const { nodes } = await listProjects(ctx.gql);
  const options = nodes.map((project) => ({
    value: project.id,
    label: project.name,
    hint: project.state,
  }));
  const answer = await io.select({ message: "Project", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * Fill an absent `[project]` positional via the project picker when gating
 * allows, else require it (preserving the old missing-argument error for
 * agents/pipes). The command body downstream is unchanged.
 */
async function resolveProjectPositional(
  ctx: CommandContext,
  command: Command,
  project: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: project === undefined,
      positional: { name: "project", value: project, picker: projectPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("project", "is required");
  }
  return filled.positional;
}

/**
 * Discussion positional pickers for the project domain (see
 * {@link makeDiscussionPickers}). `rootThreadPicker` fills a `[thread]`,
 * `commentOrReplyPicker` fills a `[comment]` (root or reply), and `replyPicker`
 * fills a `[reply]`.
 */
const { rootThreadPicker, commentOrReplyPicker, replyPicker } =
  makeDiscussionPickers({
    entityKind: "project",
    entityPicker: projectPicker,
    resolveEntityId: (ctx, human) => resolveProjectId(ctx.gql, human),
    listThreads: listDiscussionsForProject,
  });

export const PROJECTS_META: DomainMeta = {
  name: "projects",
  summary: "groups of issues toward a goal",
  context: [
    "a project collects related issues across teams. projects can have",
    "milestones to track progress toward deadlines or phases. projects",
    "have a status (backlog, planned, started, paused, completed,",
    "canceled), priority (0-4), health (onTrack, atRisk, offTrack),",
    "and can be assigned labels, a lead, and members.",
  ].join("\n"),
  arguments: {
    project: "project identifier (UUID or name)",
    name: "string",
  },
  seeAlso: [
    "milestones list --project",
    "documents list --project",
    "issues create --project",
  ],
};

function parsePriority(value: string): Priority {
  const priority = Number.parseInt(value, 10);
  if (Number.isNaN(priority) || priority < 0 || priority > 4) {
    throw invalidParameterError("priority", `must be 0-4, got "${value}"`);
  }
  return priority as Priority;
}

function parseNonNegativeIntegerOption(name: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw invalidParameterError(name, `must be a non-negative integer`);
  }
  return Number.parseInt(value, 10);
}

function parseCommaSeparatedOption(name: string, value: string): string[] {
  const values = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw invalidParameterError(name, "must include at least one value");
  }

  return values;
}

function getCreateTeamNames(options: CreateOptions): string[] {
  if (options.team && options.teams) {
    throw invalidParameterError("--team", "cannot be combined with --teams");
  }

  const teams = options.teams ?? options.team;
  if (!teams) {
    throw invalidParameterError("--teams", "is required");
  }

  return parseCommaSeparatedOption(options.teams ? "--teams" : "--team", teams);
}

function getUpdateTeamNames(options: UpdateOptions): string[] | undefined {
  if (options.team && options.teams) {
    throw invalidParameterError("--team", "cannot be combined with --teams");
  }

  const teams = options.teams ?? options.team;
  if (!teams) {
    return undefined;
  }

  return parseCommaSeparatedOption(options.teams ? "--teams" : "--team", teams);
}

export function setupProjectsCommands(program: Command): void {
  const projects = program
    .command("projects")
    .description("Project operations");

  projects.action(() => projects.help());

  projects
    .command("list")
    .description("list projects")
    .option("-l, --limit <n>", "max results", "100")
    .option("--after <cursor>", "cursor for next page")
    .option("--include-archived", "include archived projects")
    .action(
      commandAction<[ListOptions, Command]>(async (options, command) => {
        const ctx = createContext(getRootOpts(command));
        const result = await listProjects(ctx.gql, {
          ...buildPaginationOptions(parseLimit(options.limit), options.after),
          ...(options.includeArchived !== undefined
            ? { includeArchived: options.includeArchived }
            : {}),
        });
        outputSuccess(result);
      }),
    );

  projects
    .command("read [project]")
    .description("get full project details")
    .option(
      "--milestones-first <n>",
      "how many milestones to fetch; 0 omits milestones",
      "25",
    )
    .option(
      "--issues-first <n>",
      "how many issues to fetch; 0 omits issues",
      "50",
    )
    .action(
      commandAction<[string | undefined, ReadOptions, Command]>(
        async (projectArg, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const project = await resolveProjectPositional(
            ctx,
            command,
            projectArg,
          );
          const projectId = await resolveProjectId(ctx.gql, project);
          const result = await getProject(ctx.gql, projectId, {
            milestonesFirst: parseNonNegativeIntegerOption(
              "--milestones-first",
              options.milestonesFirst,
            ),
            issuesFirst: parseNonNegativeIntegerOption(
              "--issues-first",
              options.issuesFirst,
            ),
          });
          outputSuccess(result);
        },
      ),
    );

  projects
    .command("discuss [project]")
    .description("start a discussion thread on a project")
    .option("--body <text>", "discussion body (required, markdown supported)")
    .action(
      commandAction<[string | undefined, DiscussionBodyOptions, Command]>(
        async (projectArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const project = await resolveProjectPositional(
            ctx,
            command,
            projectArg,
          );
          const body = await resolveDiscussionBody(ctx, command, options);
          const projectId = await resolveProjectId(ctx.gql, project);
          const result = await startProjectDiscussion(ctx.gql, {
            projectId,
            body,
          });

          outputSuccess(result);
        },
      ),
    );

  projects
    .command("discussions [project]")
    .description("list root discussion threads on a project")
    .option("-l, --limit <n>", "max results", "25")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      commandAction<[string | undefined, DiscussionsOptions, Command]>(
        async (projectArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const project = await resolveProjectPositional(
            ctx,
            command,
            projectArg,
          );
          const projectId = await resolveProjectId(ctx.gql, project);
          const paginationOptions = buildPaginationOptions(
            parseLimit(options.limit || "25"),
            options.after,
          );
          const result = options.withReactions
            ? await listDiscussionsForProjectWithReactions(
                ctx.gql,
                projectId,
                paginationOptions,
              )
            : await listDiscussionsForProject(
                ctx.gql,
                projectId,
                paginationOptions,
              );

          outputSuccess(result);
        },
      ),
    );

  const projectThreads = projects
    .command("threads")
    .description("discussion thread reaction operations");
  addCommentReactionCommands(projectThreads, "thread", rootThreadPicker);

  const projectReplies = projects
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
                "project",
              )
            : await listDiscussionReplies(
                ctx.gql,
                asUuid(threadId),
                paginationOptions,
                "project",
              );

          outputSuccess(result);
        },
      ),
    );
  addCommentReactionCommands(projectReplies, "reply", replyPicker);

  projects
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
            entityKind: "project",
          });

          outputSuccess(result);
        },
      ),
    );

  projects
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
            "project",
          );

          outputSuccess(result);
        },
      ),
    );

  projects
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
            "project",
          );

          outputSuccess(result);
        },
      ),
    );

  projects
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
            "project",
          );

          outputSuccess(result);
        },
      ),
    );

  projects
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
            "project",
          );

          outputSuccess(result);
        },
      ),
    );

  projects
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
            entityKind: "project",
          });

          outputSuccess(result);
        },
      ),
    );

  projects
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
            "project",
          );

          outputSuccess(result);
        },
      ),
    );

  projects
    .command("create [name]")
    .description("create a new project")
    .option("--teams <teams>", "comma-separated team names or UUIDs")
    .option("--team <team>", "team name or UUID (alias for --teams)")
    .option("--description <text>", "project description")
    .option("--content <text>", "project content (markdown)")
    .option("--icon <icon>", "project icon")
    .option("--color <color>", "project color")
    .option("--lead <user>", "project lead (name, email, or UUID)")
    .option("--members <users>", "comma-separated member names or UUIDs")
    .option("--priority <0-4>", "0=none 1=urgent 2=high 3=medium 4=low")
    .option("--status <status>", "project status name or UUID")
    .option("--start-date <date>", "start date (YYYY-MM-DD)")
    .option("--target-date <date>", "target date (YYYY-MM-DD)")
    .option("--labels <labels>", "comma-separated label names or UUIDs")
    .action(
      commandAction<[string | undefined, CreateOptions, Command]>(
        async (nameArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const filled = await maybeCollectInteractive<
            CreateWizardOptions,
            never
          >(ctx, getRootOpts(command), {
            spec: projectCreateSpec,
            options: {
              ...options,
              ...(nameArg !== undefined ? { name: nameArg } : {}),
            } as CreateWizardOptions,
            missingRequired:
              nameArg === undefined ||
              (options.team === undefined && options.teams === undefined),
          });
          const name = filled.options.name ?? nameArg;
          if (name === undefined) {
            throw invalidParameterError("name", "is required");
          }
          options = normalizeWizardLists(filled.options, [
            "teams",
            "members",
            "labels",
          ]);

          const teamNames = getCreateTeamNames(options);
          const teamIds = await Promise.all(
            teamNames.map((t) => resolveTeamId(ctx.gql, t)),
          );

          const input: CreateProjectInput = {
            name,
            teamIds,
          };

          if (options.description) {
            input.description = options.description;
          }

          if (options.content) {
            input.content = options.content;
          }

          if (options.icon !== undefined) {
            input.icon = options.icon;
          }

          if (options.color !== undefined) {
            input.color = options.color;
          }

          if (options.lead) {
            input.leadId = await resolveUserId(ctx.gql, options.lead);
          }

          if (options.members) {
            const memberNames = options.members
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean);
            input.memberIds = await Promise.all(
              memberNames.map((m) => resolveUserId(ctx.gql, m)),
            );
          }

          if (options.priority) {
            input.priority = parsePriority(options.priority);
          }

          if (options.status) {
            input.statusId = await resolveProjectStatusId(
              ctx.gql,
              options.status,
            );
          }

          if (options.startDate) {
            input.startDate = options.startDate;
          }

          if (options.targetDate) {
            input.targetDate = options.targetDate;
          }

          if (options.labels) {
            const labelNames = options.labels
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean);
            input.labelIds = await resolveProjectLabelIds(ctx.gql, labelNames);
          }

          const result = await createProject(ctx.gql, input);
          outputSuccess(result);
        },
      ),
    );

  projects
    .command("update [project]")
    .description("update an existing project")
    .option("--name <name>", "new name")
    .option("--description <text>", "new description")
    .option("--content <text>", "new content (markdown)")
    .option("--icon <icon>", "new icon")
    .option("--color <color>", "new color")
    .option("--lead <user>", "new lead (name, email, or UUID)")
    .option("--clear-lead", "remove project lead")
    .option("--members <users>", "comma-separated member names or UUIDs")
    .option("--priority <0-4>", "new priority")
    .option("--status <status>", "new status name or UUID")
    .option("--start-date <date>", "new start date (YYYY-MM-DD)")
    .option("--clear-start-date", "remove start date")
    .option("--target-date <date>", "new target date (YYYY-MM-DD)")
    .option("--clear-target-date", "remove target date")
    .option("--teams <teams>", "comma-separated team names or UUIDs")
    .option("--team <team>", "team name or UUID (alias for --teams)")
    .option("--labels <labels>", "comma-separated label names or UUIDs")
    .option("--label-mode <mode>", "add | remove | overwrite")
    .option("--clear-labels", "remove all labels")
    .action(
      commandAction<[string | undefined, UpdateOptions, Command]>(
        async (projectArg, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const filled = await maybeCollectInteractive<
            UpdateWizardOptions,
            string
          >(ctx, getRootOpts(command), {
            spec: projectUpdateSpec,
            options: options as UpdateWizardOptions,
            missingRequired: projectArg === undefined,
            positional: {
              name: "project",
              value: projectArg,
              picker: projectPicker,
            },
          });
          options = normalizeWizardLists(filled.options, [
            "teams",
            "members",
            "labels",
          ]);
          if (filled.positional === undefined) {
            throw invalidParameterError("project", "is required");
          }
          const project = filled.positional;

          if (options.lead && options.clearLead) {
            throw invalidParameterError(
              "--lead",
              "cannot be combined with --clear-lead",
            );
          }

          if (options.startDate && options.clearStartDate) {
            throw invalidParameterError(
              "--start-date",
              "cannot be combined with --clear-start-date",
            );
          }

          if (options.targetDate && options.clearTargetDate) {
            throw invalidParameterError(
              "--target-date",
              "cannot be combined with --clear-target-date",
            );
          }

          if (options.labelMode && !options.labels) {
            throw invalidParameterError(
              "--label-mode",
              "requires --labels to be specified",
            );
          }

          if (options.clearLabels && options.labels) {
            throw invalidParameterError(
              "--clear-labels",
              "cannot be used with --labels",
            );
          }

          if (options.clearLabels && options.labelMode) {
            throw invalidParameterError(
              "--clear-labels",
              "cannot be used with --label-mode",
            );
          }

          const labelMode = parseLabelMode(options.labelMode);

          const projectId = await resolveProjectId(ctx.gql, project);
          const needsLabelContext =
            options.labels && (labelMode === "add" || labelMode === "remove");
          const projectContext = needsLabelContext
            ? await getProject(ctx.gql, projectId)
            : undefined;

          const input: UpdateProjectInput = {};

          if (options.name) {
            input.name = options.name;
          }

          if (options.description) {
            input.description = options.description;
          }

          if (options.content) {
            input.content = options.content;
          }

          if (options.icon !== undefined) {
            input.icon = options.icon;
          }

          if (options.color !== undefined) {
            input.color = options.color;
          }

          if (options.clearLead) {
            input.leadId = null;
          } else if (options.lead) {
            input.leadId = await resolveUserId(ctx.gql, options.lead);
          }

          if (options.members) {
            const memberNames = options.members
              .split(",")
              .map((m) => m.trim())
              .filter(Boolean);
            input.memberIds = await Promise.all(
              memberNames.map((m) => resolveUserId(ctx.gql, m)),
            );
          }

          if (options.priority) {
            input.priority = parsePriority(options.priority);
          }

          if (options.status) {
            input.statusId = await resolveProjectStatusId(
              ctx.gql,
              options.status,
            );
          }

          if (options.clearStartDate) {
            input.startDate = null;
          } else if (options.startDate) {
            input.startDate = options.startDate;
          }

          if (options.clearTargetDate) {
            input.targetDate = null;
          } else if (options.targetDate) {
            input.targetDate = options.targetDate;
          }

          const teamNames = getUpdateTeamNames(options);
          if (teamNames) {
            input.teamIds = await Promise.all(
              teamNames.map((t) => resolveTeamId(ctx.gql, t)),
            );
          }

          if (options.clearLabels) {
            input.labelIds = [];
          } else if (options.labels) {
            const labelNames = options.labels
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean);
            const labelIds = await resolveProjectLabelIds(ctx.gql, labelNames);

            if (labelMode === "add") {
              const currentLabels = projectContext?.labels?.nodes
                ? projectContext.labels.nodes.map((l) => asUuid(l.id))
                : [];
              input.labelIds = [...new Set([...currentLabels, ...labelIds])];
            } else if (labelMode === "remove") {
              const currentLabels = projectContext?.labels?.nodes
                ? projectContext.labels.nodes.map((l) => asUuid(l.id))
                : [];
              input.labelIds = currentLabels.filter(
                (id) => !labelIds.includes(id),
              );
            } else {
              input.labelIds = labelIds;
            }
          }

          if (Object.keys(input).length === 0) {
            throw invalidParameterError(
              "update options",
              "at least one option must be provided",
            );
          }

          const result = await updateProject(ctx.gql, projectId, input);
          outputSuccess(result);
        },
      ),
    );

  projects
    .command("archive [project]")
    .description("archive a project")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (projectArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const project = await resolveProjectPositional(
            ctx,
            command,
            projectArg,
          );
          const projectId = await resolveProjectId(ctx.gql, project);
          const result = await archiveProject(ctx.gql, projectId);
          outputSuccess(result);
        },
      ),
    );

  projects
    .command("unarchive [project]")
    .description("unarchive a project")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (projectArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const project = await resolveProjectPositional(
            ctx,
            command,
            projectArg,
          );
          const projectId = await resolveProjectId(ctx.gql, project, {
            includeArchived: true,
          });
          const result = await unarchiveProject(ctx.gql, projectId);
          outputSuccess(result);
        },
      ),
    );

  projects
    .command("delete [project]")
    .description("delete a project")
    .action(
      commandAction<[string | undefined, unknown, Command]>(
        async (projectArg, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const project = await resolveProjectPositional(
            ctx,
            command,
            projectArg,
          );
          const projectId = await resolveProjectId(ctx.gql, project, {
            includeArchived: true,
          });
          const result = await deleteProject(ctx.gql, projectId);
          outputSuccess(result);
        },
      ),
    );

  projects
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
