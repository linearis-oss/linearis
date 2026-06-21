import type { Command } from "commander";
import { createContext, getRootOpts } from "../common/context.js";
import type { Priority } from "../common/domain-values.js";
import { resolveReactionEmojiInput } from "../common/emoji.js";
import { invalidParameterError } from "../common/errors.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import type { ProjectCreateInput, ProjectUpdateInput } from "../gql/graphql.js";
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
  createProject,
  deleteProject,
  getProject,
  listProjects,
  unarchiveProject,
  updateProject,
} from "../services/project-service.js";

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
          expectedEntityKind: "project",
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
          expectedEntityKind: "project",
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
          expectedEntityKind: "project",
          reactionId,
        });
        outputSuccess(result);
      }),
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
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListOptions, Command];
        const ctx = createContext(getRootOpts(command));
        const result = await listProjects(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
          includeArchived: options.includeArchived,
        });
        outputSuccess(result);
      }),
    );

  projects
    .command("read <project>")
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
      handleCommand(async (...args: unknown[]) => {
        const [project, options, command] = args as [
          string,
          ReadOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const projectId = await resolveProjectId(ctx.sdk, project);
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
      }),
    );

  projects
    .command("discuss <project>")
    .description("start a discussion thread on a project")
    .option("--body <text>", "discussion body (required, markdown supported)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, options, command] = args as [
          string,
          DiscussionBodyOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        if (!options.body) {
          throw invalidParameterError("--body", "is required");
        }

        const projectId = await resolveProjectId(ctx.sdk, project);
        const result = await startProjectDiscussion(ctx.gql, {
          projectId,
          body: options.body,
        });

        outputSuccess(result);
      }),
    );

  projects
    .command("discussions <project>")
    .description("list root discussion threads on a project")
    .option("-l, --limit <n>", "max results", "25")
    .option("--after <cursor>", "cursor for next page")
    .option("--with-reactions", "include normalized discussion reactions")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, options, command] = args as [
          string,
          DiscussionsOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const projectId = await resolveProjectId(ctx.sdk, project);
        const paginationOptions = {
          limit: parseLimit(options.limit || "25"),
          after: options.after,
        };
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
      }),
    );

  const projectThreads = projects
    .command("threads")
    .description("discussion thread reaction operations");
  addCommentReactionCommands(projectThreads, "thread");

  const projectReplies = projects
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
              "project",
            )
          : await listDiscussionReplies(
              ctx.gql,
              thread,
              paginationOptions,
              "project",
            );

        outputSuccess(result);
      }),
    );
  addCommentReactionCommands(projectReplies, "reply");

  projects
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
          entityKind: "project",
        });

        outputSuccess(result);
      }),
    );

  projects
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
          "project",
        );

        outputSuccess(result);
      }),
    );

  projects
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
          "project",
        );

        outputSuccess(result);
      }),
    );

  projects
    .command("delete-comment <comment>")
    .description("delete a root discussion or reply comment")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [comment, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionComment(
          ctx.gql,
          comment,
          "project",
        );

        outputSuccess(result);
      }),
    );

  projects
    .command("delete-reply <reply>")
    .description("delete a discussion reply")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [reply, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await deleteDiscussionReply(ctx.gql, reply, "project");

        outputSuccess(result);
      }),
    );

  projects
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
          entityKind: "project",
        });

        outputSuccess(result);
      }),
    );

  projects
    .command("unresolve <thread>")
    .description("unresolve a discussion thread")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [thread, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));

        const result = await unresolveDiscussion(ctx.gql, thread, "project");

        outputSuccess(result);
      }),
    );

  projects
    .command("create <name>")
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
      handleCommand(async (...args: unknown[]) => {
        const [name, options, command] = args as [
          string,
          CreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const teamNames = getCreateTeamNames(options);
        const teamIds = await Promise.all(
          teamNames.map((t) => resolveTeamId(ctx.sdk, t)),
        );

        const input: ProjectCreateInput = {
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
          input.leadId = await resolveUserId(ctx.sdk, options.lead);
        }

        if (options.members) {
          const memberNames = options.members
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean);
          input.memberIds = await Promise.all(
            memberNames.map((m) => resolveUserId(ctx.sdk, m)),
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
          input.labelIds = await resolveProjectLabelIds(ctx.sdk, labelNames);
        }

        const result = await createProject(ctx.gql, input);
        outputSuccess(result);
      }),
    );

  projects
    .command("update <project>")
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
      handleCommand(async (...args: unknown[]) => {
        const [project, options, command] = args as [
          string,
          UpdateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

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

        if (
          options.labelMode &&
          !["add", "remove", "overwrite"].includes(options.labelMode)
        ) {
          throw invalidParameterError(
            "--label-mode",
            "must be one of 'add', 'remove', or 'overwrite'",
          );
        }

        const projectId = await resolveProjectId(ctx.sdk, project);
        const needsLabelContext =
          options.labels &&
          (options.labelMode === "add" || options.labelMode === "remove");
        const projectContext = needsLabelContext
          ? await getProject(ctx.gql, projectId)
          : undefined;

        const input: ProjectUpdateInput = {};

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
          input.leadId = await resolveUserId(ctx.sdk, options.lead);
        }

        if (options.members) {
          const memberNames = options.members
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean);
          input.memberIds = await Promise.all(
            memberNames.map((m) => resolveUserId(ctx.sdk, m)),
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
            teamNames.map((t) => resolveTeamId(ctx.sdk, t)),
          );
        }

        if (options.clearLabels) {
          input.labelIds = [];
        } else if (options.labels) {
          const labelNames = options.labels
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean);
          const labelIds = await resolveProjectLabelIds(ctx.sdk, labelNames);

          if (options.labelMode === "add") {
            const currentLabels = projectContext?.labels?.nodes
              ? projectContext.labels.nodes.map((l) => l.id)
              : [];
            input.labelIds = [...new Set([...currentLabels, ...labelIds])];
          } else if (options.labelMode === "remove") {
            const currentLabels = projectContext?.labels?.nodes
              ? projectContext.labels.nodes.map((l) => l.id)
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
      }),
    );

  projects
    .command("archive <project>")
    .description("archive a project")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const projectId = await resolveProjectId(ctx.sdk, project);
        const result = await archiveProject(ctx.gql, projectId);
        outputSuccess(result);
      }),
    );

  projects
    .command("unarchive <project>")
    .description("unarchive a project")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const projectId = await resolveProjectId(ctx.sdk, project, {
          includeArchived: true,
        });
        const result = await unarchiveProject(ctx.gql, projectId);
        outputSuccess(result);
      }),
    );

  projects
    .command("delete <project>")
    .description("delete a project")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
        const projectId = await resolveProjectId(ctx.sdk, project, {
          includeArchived: true,
        });
        const result = await deleteProject(ctx.gql, projectId);
        outputSuccess(result);
      }),
    );

  projects
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
