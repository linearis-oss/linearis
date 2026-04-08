import type { Command } from "commander";
import { createContext } from "../common/context.js";
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
  createProject,
  getProject,
  listProjects,
  updateProject,
} from "../services/project-service.js";

interface ListOptions {
  limit: string;
  after?: string;
}

interface CreateOptions {
  teams: string;
  description?: string;
  content?: string;
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
  lead?: string;
  members?: string;
  priority?: string;
  status?: string;
  startDate?: string;
  targetDate?: string;
  teams?: string;
  labels?: string;
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

function parsePriority(value: string): number {
  const priority = Number.parseInt(value, 10);
  if (Number.isNaN(priority) || priority < 0 || priority > 4) {
    throw invalidParameterError("priority", `must be 0-4, got "${value}"`);
  }
  return priority;
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
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListOptions, Command];
        const ctx = createContext(command.parent!.parent!.opts());
        const result = await listProjects(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
        });
        outputSuccess(result);
      }),
    );

  projects
    .command("read <project>")
    .description("get full project details")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, , command] = args as [string, unknown, Command];
        const ctx = createContext(command.parent!.parent!.opts());
        const projectId = await resolveProjectId(ctx.sdk, project);
        const result = await getProject(ctx.gql, projectId);
        outputSuccess(result);
      }),
    );

  projects
    .command("create <name>")
    .description("create a new project")
    .requiredOption("--teams <teams>", "comma-separated team names or UUIDs")
    .option("--description <text>", "project description")
    .option("--content <text>", "project content (markdown)")
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
        const ctx = createContext(command.parent!.parent!.opts());

        const teamNames = options.teams
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
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
    .option("--lead <user>", "new lead (name, email, or UUID)")
    .option("--members <users>", "comma-separated member names or UUIDs")
    .option("--priority <0-4>", "new priority")
    .option("--status <status>", "new status name or UUID")
    .option("--start-date <date>", "new start date (YYYY-MM-DD)")
    .option("--target-date <date>", "new target date (YYYY-MM-DD)")
    .option("--teams <teams>", "comma-separated team names or UUIDs")
    .option("--labels <labels>", "comma-separated label names or UUIDs")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [project, options, command] = args as [
          string,
          UpdateOptions,
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());

        const projectId = await resolveProjectId(ctx.sdk, project);

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

        if (options.teams) {
          const teamNames = options.teams
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          input.teamIds = await Promise.all(
            teamNames.map((t) => resolveTeamId(ctx.sdk, t)),
          );
        }

        if (options.labels) {
          const labelNames = options.labels
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean);
          input.labelIds = await resolveProjectLabelIds(ctx.sdk, labelNames);
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
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
