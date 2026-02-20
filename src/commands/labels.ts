import type { Command } from "commander";
import { type CommandOptions, createContext } from "../common/context.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { listLabels } from "../services/label-service.js";

interface ListLabelsOptions extends CommandOptions {
  team?: string;
  limit: string;
  after?: string;
}

export const LABELS_META: DomainMeta = {
  name: "labels",
  summary: "categorization tags, workspace-wide or team-scoped",
  context: [
    "labels categorize issues. they can exist at workspace level or be",
    "scoped to a specific team. use with issues create/update --labels.",
  ].join("\n"),
  arguments: {},
  seeAlso: ["issues create --labels", "issues update --labels"],
};

export function setupLabelsCommands(program: Command): void {
  const labels = program.command("labels").description("Label operations");

  labels.action(() => labels.help());

  labels
    .command("list")
    .description("list available labels")
    .option("--team <team>", "filter by team (key, name, or UUID)")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListLabelsOptions, Command];
        const ctx = createContext(command.parent!.parent!.opts());

        const teamId = options.team
          ? await resolveTeamId(ctx.sdk, options.team)
          : undefined;

        const result = await listLabels(ctx.gql, teamId, {
          limit: parseLimit(options.limit),
          after: options.after,
        });
        outputSuccess(result);
      }),
    );

  labels
    .command("usage")
    .description("show detailed usage for labels")
    .action(() => {
      console.log(formatDomainUsage(labels, LABELS_META));
    });
}
