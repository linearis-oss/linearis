import type { Command } from "commander";
import {
  type CommandOptions,
  createContext,
  getRootOpts,
} from "../common/context.js";
import { invalidParameterError } from "../common/errors.js";
import type { UUID } from "../common/identifier.js";
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

async function resolveIssueLabelLookup(
  command: Command,
  label: string,
  options: LabelLookupOptions,
): Promise<{ ctx: ReturnType<typeof createContext>; labelId: UUID }> {
  const ctx = createContext(getRootOpts(command));
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

  return { ctx, labelId };
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
    .command("create <name>")
    .description("create an issue label")
    .option("--team <team>", "create a team-scoped label (key, name, or UUID)")
    .option("--color <hex>", "label color as a hex code (for example #B45309)")
    .option("--description <text>", "label description")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [name, options, command] = args as [
          string,
          CreateLabelOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

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
    .command("read <label>")
    .description("read an issue label")
    .option(
      "--team <team>",
      "resolve a team-scoped label by team (key, name, or UUID)",
    )
    .option("--scope <scope>", "resolve within workspace or team scope")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [label, options, command] = args as [
          string,
          LabelLookupOptions,
          Command,
        ];
        const { ctx, labelId } = await resolveIssueLabelLookup(
          command,
          label,
          options,
        );

        outputSuccess(await getLabel(ctx.gql, labelId));
      }),
    );

  labels
    .command("update <label>")
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
        const [label, options, command] = args as [
          string,
          UpdateLabelOptions,
          Command,
        ];
        const input = buildUpdateInput(options);
        const { ctx, labelId } = await resolveIssueLabelLookup(
          command,
          label,
          options,
        );

        outputSuccess(await updateLabel(ctx.gql, labelId, input));
      }),
    );

  labels
    .command("delete <label>")
    .description("delete an issue label")
    .option(
      "--team <team>",
      "resolve a team-scoped label by team (key, name, or UUID)",
    )
    .option("--scope <scope>", "resolve within workspace or team scope")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [label, options, command] = args as [
          string,
          LabelLookupOptions,
          Command,
        ];
        const { ctx, labelId } = await resolveIssueLabelLookup(
          command,
          label,
          options,
        );

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
