import type { Command } from "commander";
import { type CommandOptions, createContext } from "../common/context.js";
import { invalidParameterError } from "../common/errors.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import {
  type LabelType,
  listLabels,
  listProjectLabels,
} from "../services/label-service.js";

interface ListLabelsOptions extends CommandOptions {
  team?: string;
  type?: string;
  limit: string;
  after?: string;
}

function parseLabelType(value?: string): LabelType {
  if (value === undefined || value === "issue" || value === "project") {
    return value ?? "issue";
  }

  throw invalidParameterError("--type", 'must be one of "issue" or "project"');
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
    .option("--team <team>", "filter by team (key, name, or UUID)")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListLabelsOptions, Command];
        const ctx = createContext(command.parent!.parent!.opts());
        const type = parseLabelType(options.type);
        const pagination = {
          limit: parseLimit(options.limit),
          after: options.after,
        };

        if (type === "project") {
          if (options.team) {
            throw invalidParameterError(
              "--team",
              "cannot be used with --type project because project labels are workspace-scoped",
            );
          }

          outputSuccess(await listProjectLabels(ctx.gql, pagination));
          return;
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
