import { Command } from "commander";
import { createContext, type CommandOptions } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { formatDomainUsage, type DomainMeta } from "../common/usage.js";
import { listTeams } from "../services/team-service.js";

/**
 * Setup teams commands on the program
 *
 * Registers `teams` command group for listing Linear teams.
 * Provides team information including key, name, and description.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupTeamsCommands(program);
 * // Enables: linearis teams list
 * ```
 */
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
  const teams = program
    .command("teams")
    .description("Team operations");

  // Show teams help when no subcommand
  teams.action(() => {
    teams.help();
  });

  /**
   * List all teams
   *
   * Command: `linearis teams list`
   *
   * Lists all teams in the workspace with their key, name, and description.
   */
  teams
    .command("list")
    .description("list all teams")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [, command] = args as [CommandOptions, Command];
        const ctx = await createContext(command.parent!.parent!.opts());
        const result = await listTeams(ctx.gql);
        outputSuccess(result);
      })
    );

  teams
    .command("usage")
    .description("show detailed usage for teams")
    .action(() => {
      console.log(formatDomainUsage(teams, TEAMS_META));
    });
}
