import type { Command } from "commander";
import { type CommandOptions, createContext } from "../common/context.js";
import { invalidParameterError } from "../common/errors.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import {
  type LabelScope,
  type LabelType,
  listLabels,
  listProjectLabels,
} from "../services/label-service.js";

interface ListLabelsOptions extends CommandOptions {
  team?: string;
  type?: string;
  scope?: string;
  limit: string;
  after?: string;
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

export const LABELS_META: DomainMeta = {
  name: "labels",
  summary: "categorization tags for issues and projects",
  context: [
    "issue labels can exist at workspace level or be scoped to a specific",
    "team. project labels are workspace-level only. use with issues",
    "create/update --labels and projects create/update --labels.",
  ].join("\n"),
  arguments: {},
  seeAlso: [
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
        const ctx = createContext(command.parent!.parent!.opts());
        const type = parseLabelType(options.type);
        const scope = parseLabelScope(options.scope);
        const pagination = {
          limit: parseLimit(options.limit),
          after: options.after,
          scope,
        };

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
          ? await resolveTeamId(ctx.sdk, options.team)
          : undefined;

        outputSuccess(await listLabels(ctx.gql, teamId, pagination));
      }),
    );

  labels
    .command("usage")
    .description("show detailed usage for labels")
    .action(() => {
      console.log(formatDomainUsage(labels, LABELS_META));
    });
}
