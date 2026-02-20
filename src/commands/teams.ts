import type { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { listTeams } from "../services/team-service.js";

export const TEAMS_META: DomainMeta = {
  name: "teams",
  summary: "organizational units owning issues and cycles",
  context: [
    "a team is a group of users that owns issues, cycles, statuses, and",
    "labels. teams are identified by a short key (e.g. ENG), name, or UUID.",
  ].join("\n"),
  arguments: {},
  seeAlso: [],
};

export function setupTeamsCommands(program: Command): void {
  const teams = program.command("teams").description("Team operations");

  teams.action(() => teams.help());

  teams
    .command("list")
    .description("list all teams")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          { limit: string; after?: string },
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());
        const result = await listTeams(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
        });
        outputSuccess(result);
      }),
    );

  teams
    .command("usage")
    .description("show detailed usage for teams")
    .action(() => {
      console.log(formatDomainUsage(teams, TEAMS_META));
    });
}
