import { Command } from "commander";
import { createContext, type CommandOptions } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { listLabels } from "../services/label-service.js";

interface ListLabelsOptions extends CommandOptions {
  team?: string;
}

/**
 * Setup labels commands on the program
 *
 * Registers `labels` command group for listing and managing Linear issue labels.
 * Provides filtering capabilities by team and comprehensive label information.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupLabelsCommands(program);
 * // Enables: linearis labels list [--team <team>]
 * ```
 */
export function setupLabelsCommands(program: Command): void {
  const labels = program.command("labels")
    .description("Label operations");

  // Show labels help when no subcommand
  labels.action(() => {
    labels.help();
  });

  /**
   * List all available labels
   *
   * Command: `linearis labels list [--team <team>]`
   *
   * Lists all workspace and team-specific labels with optional team filtering.
   * Excludes group labels (containers) and includes parent relationships.
   */
  labels.command("list")
    .description("List all available labels")
    .option("--team <team>", "filter by team key, name, or ID")
    .action(handleCommand(async (...args: unknown[]) => {
      const [options, command] = args as [ListLabelsOptions, Command];
      const ctx = await createContext(command.parent!.parent!.opts());

      // Resolve team filter if provided
      const teamId = options.team
        ? await resolveTeamId(ctx.sdk, options.team)
        : undefined;

      // Fetch labels with optional team filtering
      const result = await listLabels(ctx.sdk, teamId);
      outputSuccess(result);
    }));
}
