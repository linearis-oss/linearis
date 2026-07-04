import type { Command } from "commander";
import type { CommandContext } from "../common/context.js";
import {
  type CommandOptions,
  createContext,
  getRootOpts,
} from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import type { UUID } from "../common/identifier.js";
import {
  labelChoices,
  teamChoices,
  withNoneChoice,
} from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { omitUndefined } from "../common/object.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import {
  type LabelResolverScope,
  resolveLabelId,
} from "../resolvers/label-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import {
  type CreateLabelInput,
  createLabel,
  deleteLabel,
  getLabel,
  type LabelScope,
  type LabelType,
  listLabels,
  listProjectLabels,
  type UpdateLabelInput,
  updateLabel,
} from "../services/label-service.js";

interface ListLabelsOptions extends CommandOptions {
  team?: string;
  type?: string;
  scope?: string;
  limit: string;
  after?: string;
}

interface LabelLookupOptions extends CommandOptions {
  team?: string;
  scope?: string;
}

interface CreateLabelOptions extends CommandOptions {
  team?: string;
  color?: string;
  description?: string;
}

interface UpdateLabelOptions extends LabelLookupOptions {
  name?: string;
  color?: string;
  description?: string;
}

/** Create-wizard shape: the create options plus the `name` positional. */
interface CreateLabelWizardOptions extends Record<string, unknown> {
  team?: string;
  color?: string;
  description?: string;
  name?: string;
}

/** Update-wizard shape: the update options with an index signature. */
interface UpdateLabelWizardOptions extends Record<string, unknown> {
  team?: string;
  scope?: string;
  name?: string;
  color?: string;
  description?: string;
}

/**
 * Interactive wizard for `labels create`. `name` is the required positional;
 * `team` is optional (a workspace label when omitted). The team choice value is
 * a UUID (see choices.ts), which the resolver passes through via `isUuid(...)`.
 * Color is a free-text hex field validated the same way as `--color`.
 */
export const labelCreateSpec: PromptSpec<CreateLabelWizardOptions> = {
  intro: "Create a new issue label",
  fields: [
    { name: "name", kind: "text", message: "Name", required: true },
    {
      name: "team",
      kind: "select",
      message: "Team",
      choices: async (ctx) =>
        withNoneChoice(await teamChoices(ctx), "— none (workspace label) —"),
    },
    {
      name: "color",
      kind: "text",
      message: "Color (hex, e.g. #B45309)",
      validate: (value) =>
        value === "" || /^#[0-9a-fA-F]{6}$/.test(value)
          ? undefined
          : "must be a hex color like #B45309",
    },
    { name: "description", kind: "multiline", message: "Description" },
  ],
};

/**
 * Interactive wizard for `labels update`. All fields optional; current option
 * values seed each field so an explicit flag is never re-prompted. The label
 * picker (run afterwards by the positional flow) resolves the `[label]`.
 */
export const labelUpdateSpec: PromptSpec<UpdateLabelWizardOptions> = {
  intro: "Update an issue label",
  fields: [
    {
      name: "name",
      kind: "text",
      message: "Name",
    },
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
      name: "description",
      kind: "multiline",
      message: "Description",
    },
  ],
};

/**
 * Entity picker for an absent `[label]` positional. Lists labels (scoped to the
 * team from `--team` when supplied) and returns the selected label's UUID, which
 * the resolver accepts via `isUuid(...)` passthrough.
 */
function makeLabelPicker(
  teamHint: string | undefined,
): (ctx: CommandContext, io: PromptIO) => Promise<string> {
  return async (ctx, io) => {
    let teamId = teamHint;
    if (teamId !== undefined) {
      teamId = await resolveTeamId(ctx.gql, teamId);
    }
    const options = await labelChoices(
      ctx,
      teamId !== undefined ? { team: teamId } : {},
    );
    const answer = await io.select({ message: "Label", options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}

function parseLabelType(value?: string): LabelType {
  if (value === undefined || value === "issue" || value === "project") {
    return value ?? "issue";
  }

  throw invalidParameterError("--type", 'must be one of "issue" or "project"');
}

function parseLabelScope(value?: string): LabelScope | undefined {
  if (value === undefined || value === "workspace" || value === "team") {
    return value;
  }

  throw invalidParameterError(
    "--scope",
    'must be one of "workspace" or "team"',
  );
}

function parseLabelColor(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw invalidParameterError("--color", "must be a hex color like #B45309");
  }

  return value;
}

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * Fill an absent `[label]` positional via the label picker when gating allows,
 * else require it (preserving the old missing-argument error for agents/pipes).
 */
async function resolveLabelPositional(
  ctx: CommandContext,
  command: Command,
  label: string | undefined,
  teamHint: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: label === undefined,
      positional: {
        name: "label",
        value: label,
        picker: makeLabelPicker(teamHint),
      },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("label", "is required");
  }
  return filled.positional;
}

async function resolveIssueLabelLookup(
  ctx: CommandContext,
  label: string,
  options: LabelLookupOptions,
): Promise<{ labelId: UUID }> {
  const scope = parseLabelScope(options.scope);

  if (scope === "team" && !options.team) {
    throw invalidParameterError("--scope", "team scope requires --team");
  }

  if (scope === "workspace" && options.team) {
    throw invalidParameterError(
      "--team",
      "cannot be used with --scope workspace",
    );
  }

  const teamId = options.team
    ? await resolveTeamId(ctx.gql, options.team)
    : undefined;
  const labelId = await resolveLabelId(
    ctx.gql,
    label,
    omitUndefined({
      teamId,
      scope: scope as LabelResolverScope | undefined,
    }),
  );

  return { labelId };
}

function buildUpdateInput(options: UpdateLabelOptions): UpdateLabelInput {
  const input: UpdateLabelInput = {};
  const color = parseLabelColor(options.color);

  if (options.name) {
    input.name = options.name;
  }

  if (color) {
    input.color = color;
  }

  if (options.description !== undefined) {
    input.description = options.description;
  }

  if (Object.keys(input).length === 0) {
    throw invalidParameterError(
      "label update",
      "at least one option must be provided",
    );
  }

  return input;
}

export const LABELS_META: DomainMeta = {
  name: "labels",
  summary: "categorization tags for issues and projects",
  context: [
    "issue labels can exist at workspace level or be scoped to a specific",
    "team. project labels are workspace-level only. use labels list to",
    "inspect existing labels, labels create/read/update/delete for issue",
    "labels, and issues/projects create/update --labels plus update",
    "--label-mode remove or --clear-labels to apply or remove them.",
  ].join("\n"),
  arguments: { name: "label name or UUID" },
  seeAlso: [
    "labels create <name>",
    "labels read <label>",
    "labels update <label>",
    "labels delete <label>",
    "issues create --labels",
    "issues update --labels",
    "projects create --labels",
    "projects update --labels",
  ],
};

export function setupLabelsCommands(program: Command): void {
  const labels = program.command("labels").description("Label operations");

  labels.action(() => labels.help());

  labels
    .command("list")
    .description("list available labels")
    .option("--type <type>", "label type: issue (default) or project", "issue")
    .option("--scope <scope>", "issue label scope: workspace or team")
    .option("--team <team>", "filter by team (key, name, or UUID)")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListLabelsOptions, Command];
        const ctx = createContext(getRootOpts(command));
        const type = parseLabelType(options.type);
        const scope = parseLabelScope(options.scope);
        const pagination = omitUndefined({
          limit: parseLimit(options.limit),
          after: options.after,
          scope,
        });

        if (type === "project") {
          if (options.team) {
            throw invalidParameterError(
              "--team",
              "cannot be used with --type project because project labels are workspace-scoped",
            );
          }

          if (scope) {
            throw invalidParameterError(
              "--scope",
              "cannot be used with --type project because project labels are always workspace-scoped",
            );
          }

          outputSuccess(await listProjectLabels(ctx.gql, pagination));
          return;
        }

        if (scope === "team" && !options.team) {
          throw invalidParameterError("--scope", "team scope requires --team");
        }

        if (scope === "workspace" && options.team) {
          throw invalidParameterError(
            "--team",
            "cannot be used with --scope workspace",
          );
        }

        const teamId = options.team
          ? await resolveTeamId(ctx.gql, options.team)
          : undefined;

        outputSuccess(await listLabels(ctx.gql, teamId, pagination));
      }),
    );

  labels
    .command("create [name]")
    .description("create an issue label")
    .option("--team <team>", "create a team-scoped label (key, name, or UUID)")
    .option("--color <hex>", "label color as a hex code (for example #B45309)")
    .option("--description <text>", "label description")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [nameArg, rawOptions, command] = args as [
          string | undefined,
          CreateLabelOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          CreateLabelWizardOptions,
          never
        >(ctx, getRootOpts(command), {
          spec: labelCreateSpec,
          options: {
            ...rawOptions,
            ...(nameArg !== undefined ? { name: nameArg } : {}),
          } as CreateLabelWizardOptions,
          missingRequired: nameArg === undefined,
        });
        const options = filled.options as CreateLabelOptions;
        const name = (filled.options.name as string | undefined) ?? nameArg;
        if (name === undefined) {
          throw invalidParameterError("name", "is required");
        }

        const input: CreateLabelInput = { name };
        const color = parseLabelColor(options.color);

        if (options.team) {
          input.teamId = await resolveTeamId(ctx.gql, options.team);
        }

        if (color) {
          input.color = color;
        }

        if (options.description) {
          input.description = options.description;
        }

        outputSuccess(await createLabel(ctx.gql, input));
      }),
    );

  labels
    .command("read [label]")
    .description("read an issue label")
    .option(
      "--team <team>",
      "resolve a team-scoped label by team (key, name, or UUID)",
    )
    .option("--scope <scope>", "resolve within workspace or team scope")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [labelArg, options, command] = args as [
          string | undefined,
          LabelLookupOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const label = await resolveLabelPositional(
          ctx,
          command,
          labelArg,
          options.team,
        );
        const { labelId } = await resolveIssueLabelLookup(ctx, label, options);

        outputSuccess(await getLabel(ctx.gql, labelId));
      }),
    );

  labels
    .command("update [label]")
    .description("update an issue label")
    .option(
      "--team <team>",
      "resolve a team-scoped label by team (key, name, or UUID)",
    )
    .option("--scope <scope>", "resolve within workspace or team scope")
    .option("--name <name>", "new label name")
    .option("--color <hex>", "new label color as a hex code")
    .option("--description <text>", "new label description")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [labelArg, rawOptions, command] = args as [
          string | undefined,
          UpdateLabelOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          UpdateLabelWizardOptions,
          string
        >(ctx, getRootOpts(command), {
          spec: labelUpdateSpec,
          options: { ...rawOptions } as UpdateLabelWizardOptions,
          missingRequired: labelArg === undefined,
          positional: {
            name: "label",
            value: labelArg,
            picker: makeLabelPicker(rawOptions.team),
          },
        });
        const options = filled.options as UpdateLabelOptions;
        if (filled.positional === undefined) {
          throw invalidParameterError("label", "is required");
        }
        const label = filled.positional;

        const input = buildUpdateInput(options);
        const { labelId } = await resolveIssueLabelLookup(ctx, label, options);

        outputSuccess(await updateLabel(ctx.gql, labelId, input));
      }),
    );

  labels
    .command("delete [label]")
    .description("delete an issue label")
    .option(
      "--team <team>",
      "resolve a team-scoped label by team (key, name, or UUID)",
    )
    .option("--scope <scope>", "resolve within workspace or team scope")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [labelArg, options, command] = args as [
          string | undefined,
          LabelLookupOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const label = await resolveLabelPositional(
          ctx,
          command,
          labelArg,
          options.team,
        );
        const { labelId } = await resolveIssueLabelLookup(ctx, label, options);

        outputSuccess(await deleteLabel(ctx.gql, labelId));
      }),
    );

  labels
    .command("usage")
    .description("show detailed usage for labels")
    .action(() => {
      console.log(formatDomainUsage(labels, LABELS_META));
    });
}
