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
import { resolveProjectLabelId } from "../resolvers/project-resolver.js";
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
  restoreLabel,
  retireLabel,
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
  type?: string;
  team?: string;
  scope?: string;
}

interface CreateLabelOptions extends CommandOptions {
  type?: string;
  team?: string;
  color?: string;
  description?: string;
  parent?: string;
  group?: boolean;
}

interface UpdateLabelOptions extends LabelLookupOptions {
  name?: string;
  color?: string;
  description?: string;
  parent?: string;
  group?: boolean;
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

/**
 * Project labels have no team dimension at all, so silently ignoring
 * `--team`/`--scope` would answer a question the caller did not ask.
 */
function rejectTeamScopingForProjectLabels(
  team: string | undefined,
  scope: LabelScope | undefined,
): void {
  if (team) {
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
}

/**
 * Resolves `--parent` against the same label kind as the label being written.
 *
 * A group and its children are always the same kind, so routing the parent
 * through the other resolver could only ever produce a not-found or a
 * cross-kind parent the API would reject.
 */
async function resolveLabelParentId(
  client: ReturnType<typeof createContext>["gql"],
  parent: string,
  type: LabelType,
): Promise<UUID> {
  return type === "project"
    ? resolveProjectLabelId(client, parent)
    : resolveLabelId(client, parent);
}

/**
 * Resolves `<label>` to a UUID for whichever label kind `--type` selects.
 *
 * Project labels are always workspace-scoped, so `--team` and `--scope` are
 * rejected rather than quietly ignored — the same guard `labels list`
 * already applies.
 */
async function resolveLabelLookup(
  command: Command,
  label: string,
  options: LabelLookupOptions,
): Promise<{
  ctx: ReturnType<typeof createContext>;
  labelId: UUID;
  type: LabelType;
}> {
  const ctx = createContext(getRootOpts(command));
  const type = parseLabelType(options.type);
  const scope = parseLabelScope(options.scope);

  if (type === "project") {
    rejectTeamScopingForProjectLabels(options.team, scope);

    return {
      ctx,
      labelId: await resolveProjectLabelId(ctx.gql, label),
      type,
    };
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
  const labelId = await resolveLabelId(
    ctx.gql,
    label,
    omitUndefined({
      teamId,
      scope: scope as LabelResolverScope | undefined,
    }),
  );

  return { ctx, labelId, type };
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

  if (options.group) {
    input.isGroup = true;
  }

  if (Object.keys(input).length === 0 && options.parent === undefined) {
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
    "team. project labels are workspace-level only, so --team and --scope",
    "are rejected with --type project. every verb takes --type issue",
    "(default) or --type project.",
    "",
    "retire is the reversible alternative to delete: a retired label stays",
    "on whatever already carries it but cannot be applied to anything new.",
    "restore undoes it.",
    "",
    "a label group (--group) contains child labels (--parent <group>); a",
    "group is not itself applicable to issues or projects.",
    "",
    "use issues/projects create/update --labels plus update --label-mode",
    "remove or --clear-labels to apply or remove labels.",
  ].join("\n"),
  arguments: { name: "label name or UUID" },
  seeAlso: [
    "labels create <name>",
    "labels read <label>",
    "labels update <label>",
    "labels delete <label>",
    "labels retire <label>",
    "labels restore <label>",
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
          rejectTeamScopingForProjectLabels(options.team, scope);

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
    .description("create a label")
    .option("--type <type>", "label type: issue (default) or project", "issue")
    .option("--team <team>", "create a team-scoped label (key, name, or UUID)")
    .option("--color <hex>", "label color as a hex code (for example #B45309)")
    .option("--description <text>", "label description")
    .option("--parent <label>", "place the label inside this label group")
    .option("--group", "create a label group rather than a label")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [name, options, command] = args as [
          string,
          CreateLabelOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const type = parseLabelType(options.type);

        if (type === "project") {
          rejectTeamScopingForProjectLabels(options.team, undefined);
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

        if (options.parent) {
          input.parentId = await resolveLabelParentId(
            ctx.gql,
            options.parent,
            type,
          );
        }

        if (options.group) {
          input.isGroup = true;
        }

        outputSuccess(await createLabel(ctx.gql, input, type));
      }),
    );

  labels
    .command("read <label>")
    .description("read a label")
    .option("--type <type>", "label type: issue (default) or project", "issue")
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
        const { ctx, labelId, type } = await resolveLabelLookup(
          command,
          label,
          options,
        );

        outputSuccess(await getLabel(ctx.gql, labelId, type));
      }),
    );

  labels
    .command("update <label>")
    .description("update a label")
    .option("--type <type>", "label type: issue (default) or project", "issue")
    .option(
      "--team <team>",
      "resolve a team-scoped label by team (key, name, or UUID)",
    )
    .option("--scope <scope>", "resolve within workspace or team scope")
    .option("--name <name>", "new label name")
    .option("--color <hex>", "new label color as a hex code")
    .option("--description <text>", "new label description")
    .option("--parent <label>", "move the label into this label group")
    .option("--group", "turn the label into a label group")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [label, options, command] = args as [
          string,
          UpdateLabelOptions,
          Command,
        ];
        const input = buildUpdateInput(options);
        const { ctx, labelId, type } = await resolveLabelLookup(
          command,
          label,
          options,
        );

        if (options.parent) {
          input.parentId = await resolveLabelParentId(
            ctx.gql,
            options.parent,
            type,
          );
        }

        outputSuccess(await updateLabel(ctx.gql, labelId, input, type));
      }),
    );

  labels
    .command("delete <label>")
    .description("delete a label")
    .option("--type <type>", "label type: issue (default) or project", "issue")
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
        const { ctx, labelId, type } = await resolveLabelLookup(
          command,
          label,
          options,
        );

        outputSuccess(await deleteLabel(ctx.gql, labelId, type));
      }),
    );

  for (const verb of ["retire", "restore"] as const) {
    labels
      .command(`${verb} <label>`)
      .description(
        verb === "retire"
          ? "retire a label: keeps it where it is, blocks new uses"
          : "restore a retired label so it can be applied again",
      )
      .option(
        "--type <type>",
        "label type: issue (default) or project",
        "issue",
      )
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
          const { ctx, labelId, type } = await resolveLabelLookup(
            command,
            label,
            options,
          );

          const apply = verb === "retire" ? retireLabel : restoreLabel;
          outputSuccess(await apply(ctx.gql, labelId, type));
        }),
      );
  }

  labels
    .command("usage")
    .description("show detailed usage for labels")
    .action(() => {
      console.log(formatDomainUsage(labels, LABELS_META));
    });
}
