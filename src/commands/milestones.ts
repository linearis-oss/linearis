import type { Command } from "commander";
import type { CommandContext } from "../common/context.js";
import { createContext, getRootOpts } from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import {
  milestoneChoices,
  projectChoices,
} from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { buildPaginationOptions } from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveMilestoneId } from "../resolvers/milestone-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import {
  createMilestone,
  getMilestone,
  listMilestones,
  type UpdateMilestoneInput,
  updateMilestone,
} from "../services/milestone-service.js";

// Option interfaces for commands
interface MilestoneListOptions {
  project: string;
  limit?: string;
  after?: string;
}

interface MilestoneReadOptions {
  project?: string;
  limit?: string;
}

interface MilestoneCreateOptions {
  project: string;
  description?: string;
  targetDate?: string;
}

interface MilestoneUpdateOptions {
  project?: string;
  name?: string;
  description?: string;
  targetDate?: string;
  sortOrder?: string;
}

/** Create-wizard shape: the create options plus the `name` positional. */
interface MilestoneCreateWizardOptions extends Record<string, unknown> {
  project?: string;
  description?: string;
  targetDate?: string;
  name?: string;
}

/**
 * Interactive wizard for `milestones create`. Milestones are project-scoped,
 * so `project` is required and precedes the milestone-specific fields. Entity
 * choice values are UUIDs (see choices.ts); the resolvers pass those through
 * unchanged via `isUuid(...)`.
 */
export const milestoneCreateSpec: PromptSpec<MilestoneCreateWizardOptions> = {
  intro: "Create a new milestone",
  fields: [
    {
      name: "project",
      kind: "select",
      message: "Project",
      required: true,
      choices: projectChoices,
    },
    { name: "name", kind: "text", message: "Name", required: true },
    { name: "description", kind: "multiline", message: "Description" },
    { name: "targetDate", kind: "date", message: "Target date" },
  ],
};

/**
 * Interactive wizard for `milestones update`. All fields optional; a field
 * already supplied by a flag is skipped, the rest are prompted fresh (the
 * wizard does not pre-load the milestone's current values). The `[milestone]`
 * positional is resolved first by the picker before these fields are prompted.
 */
export const milestoneUpdateSpec: PromptSpec<MilestoneCreateWizardOptions> = {
  intro: "Update a milestone",
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
      name: "targetDate",
      kind: "date",
      message: "Target date",
    },
  ],
};

/** Wizard shape for `milestones list`: a required project select. */
interface MilestoneListWizardOptions extends Record<string, unknown> {
  project?: string;
  limit?: string;
  after?: string;
}

/**
 * Interactive wizard for `milestones list`. Milestones are project-scoped and
 * `--project` is required, so — unlike the other list commands — a TTY user with
 * no `--project` is prompted for one instead of hitting the missing-required
 * error. Agents/pipes keep the old "--project is required" throw.
 */
export const milestoneListSpec: PromptSpec<MilestoneListWizardOptions> = {
  intro: "List milestones in a project",
  fields: [
    {
      name: "project",
      kind: "select",
      message: "Project",
      required: true,
      searchable: true,
      choices: projectChoices,
    },
  ],
};

/**
 * Entity picker for an absent `[milestone]` positional. Milestones are
 * project-scoped, so this first prompts for a project (unless one was already
 * supplied via `--project`), then loads that project's milestones. This is the
 * cross-field-dependency case for the milestones domain: the milestone list is
 * only fetched once the parent project is known.
 *
 * Returns the selected milestone UUID (which the resolver accepts).
 */
function makeMilestonePicker(
  projectHint: string | undefined,
): (ctx: CommandContext, io: PromptIO) => Promise<string> {
  return async (ctx, io) => {
    let projectId = projectHint;
    if (projectId === undefined) {
      const projectOptions = await projectChoices(ctx);
      if (projectOptions.length === 0) {
        throw invalidParameterError("project", "no projects are available");
      }
      const projectAnswer = await io.select({
        message: "Project",
        options: projectOptions,
      });
      if (io.isCancel(projectAnswer)) {
        throw new InteractiveCancelledError();
      }
      projectId = projectAnswer as string;
    } else {
      projectId = await resolveProjectId(ctx.gql, projectId);
    }

    const options = await milestoneChoices(ctx, { project: projectId });
    if (options.length === 0) {
      throw invalidParameterError(
        "milestone",
        "the selected project has no milestones",
      );
    }
    const answer = await io.select({ message: "Milestone", options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}

export const MILESTONES_META: DomainMeta = {
  name: "milestones",
  summary: "progress checkpoints within projects",
  context: [
    "a milestone marks a phase or deadline within a project. milestones",
    "can have target dates and contain issues assigned to them.",
  ].join("\n"),
  arguments: {
    milestone: "milestone identifier (UUID or name)",
    name: "string",
  },
  seeAlso: [
    "issues create --project-milestone",
    "issues update --project-milestone",
  ],
};

export function setupMilestonesCommands(program: Command): void {
  const milestones = program
    .command("milestones")
    .description("Project milestone operations");

  milestones.action(() => milestones.help());

  // List milestones in a project
  milestones
    .command("list")
    .description("list milestones in a project")
    .option("--project <project>", "target project (required)")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .addHelpText(
      "after",
      "\n--project is required. Pass it, or run in a terminal (or with -i) to pick one interactively.",
    )
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          Partial<MilestoneListOptions>,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          MilestoneListWizardOptions,
          never
        >(ctx, getRootOpts(command), {
          spec: milestoneListSpec,
          options: options as MilestoneListWizardOptions,
          missingRequired: options.project === undefined,
        });
        const project = filled.options.project;
        if (project === undefined) {
          throw invalidParameterError("--project", "is required");
        }

        const projectId = await resolveProjectId(ctx.gql, project);

        const milestones = await listMilestones(
          ctx.gql,
          projectId,
          buildPaginationOptions(
            parseLimit(filled.options.limit || "50"),
            filled.options.after,
          ),
        );

        outputSuccess(milestones);
      }),
    );

  // Get milestone details with issues
  milestones
    .command("read [milestone]")
    .description("get milestone details including issues")
    .option("--project <project>", "scope name lookup to project")
    .option("--limit <n>", "max issues to fetch", "50")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [milestoneArg, options, command] = args as [
          string | undefined,
          MilestoneReadOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          Record<string, never>,
          string
        >(ctx, getRootOpts(command), {
          spec: { fields: [] },
          options: {},
          missingRequired: milestoneArg === undefined,
          positional: {
            name: "milestone",
            value: milestoneArg,
            picker: makeMilestonePicker(options.project),
          },
        });
        if (filled.positional === undefined) {
          throw invalidParameterError("milestone", "is required");
        }
        const milestone = filled.positional;

        const milestoneId = await resolveMilestoneId(
          ctx.gql,
          milestone,
          options.project,
        );

        const milestoneResult = await getMilestone(
          ctx.gql,
          milestoneId,
          parseLimit(options.limit || "50"),
        );

        outputSuccess(milestoneResult);
      }),
    );

  // Create a new milestone
  milestones
    .command("create [name]")
    .description("create a new milestone")
    .option("--project <project>", "target project (required)")
    .option("-d, --description <text>", "milestone description")
    .option("--target-date <date>", "target date in ISO format (YYYY-MM-DD)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [nameArg, options, command] = args as [
          string | undefined,
          MilestoneCreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          MilestoneCreateWizardOptions,
          never
        >(ctx, getRootOpts(command), {
          spec: milestoneCreateSpec,
          options: {
            ...options,
            ...(nameArg !== undefined ? { name: nameArg } : {}),
          } as MilestoneCreateWizardOptions,
          missingRequired:
            nameArg === undefined || options.project === undefined,
        });
        const filledOptions = filled.options as MilestoneCreateOptions;
        const name = (filled.options.name as string | undefined) ?? nameArg;
        if (name === undefined) {
          throw invalidParameterError("name", "is required");
        }
        if (!filledOptions.project) {
          throw invalidParameterError("--project", "is required");
        }

        // Resolve project ID
        const projectId = await resolveProjectId(
          ctx.gql,
          filledOptions.project,
        );

        const milestone = await createMilestone(ctx.gql, {
          projectId,
          name,
          description: filledOptions.description,
          targetDate: filledOptions.targetDate,
        });

        outputSuccess(milestone);
      }),
    );

  // Update an existing milestone
  milestones
    .command("update [milestone]")
    .description("update an existing milestone")
    .option("--project <project>", "scope name lookup to project")
    .option("-n, --name <name>", "new name")
    .option("--description <text>", "new description")
    .option(
      "--target-date <date>",
      "new target date in ISO format (YYYY-MM-DD)",
    )
    .option("--sort-order <n>", "display order")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [milestoneArg, options, command] = args as [
          string | undefined,
          MilestoneUpdateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          MilestoneCreateWizardOptions,
          string
        >(ctx, getRootOpts(command), {
          spec: milestoneUpdateSpec,
          options: { ...options } as MilestoneCreateWizardOptions,
          missingRequired: milestoneArg === undefined,
          positional: {
            name: "milestone",
            value: milestoneArg,
            picker: makeMilestonePicker(options.project),
          },
        });
        const filledOptions = filled.options as MilestoneUpdateOptions;
        if (filled.positional === undefined) {
          throw invalidParameterError("milestone", "is required");
        }
        const milestone = filled.positional;

        const milestoneId = await resolveMilestoneId(
          ctx.gql,
          milestone,
          filledOptions.project,
        );

        // Build update input (only include provided fields)
        const updateInput: UpdateMilestoneInput = {};
        if (filledOptions.name !== undefined) {
          updateInput.name = filledOptions.name;
        }
        if (filledOptions.description !== undefined) {
          updateInput.description = filledOptions.description;
        }
        if (filledOptions.targetDate !== undefined) {
          updateInput.targetDate = filledOptions.targetDate;
        }
        if (filledOptions.sortOrder !== undefined) {
          updateInput.sortOrder = parseFloat(filledOptions.sortOrder);
        }

        const updated = await updateMilestone(
          ctx.gql,
          milestoneId,
          updateInput,
        );

        outputSuccess(updated);
      }),
    );

  milestones
    .command("usage")
    .description("show detailed usage for milestones")
    .action(() => {
      console.log(formatDomainUsage(milestones, MILESTONES_META));
    });
}
