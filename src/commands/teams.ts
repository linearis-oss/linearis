import { Command } from "commander";
import { getRootOpts } from "../utils/context.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

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
    .description("List all teams")
    .action(
      handleAsyncCommand(async (options: any, command: Command) => {
        // Initialize Linear service for team operations
        const service = await createLinearService(getRootOpts(command));

        // Fetch all teams from the workspace
        const result = await service.getTeams();
        outputSuccess(result);
      })
    );
}
