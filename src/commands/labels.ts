import { Command } from "commander";
import { getRootOpts } from "../utils/context.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

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
    .action(handleAsyncCommand(async (options: any, command: Command) => {
      // Initialize Linear service for label operations
      const service = await createLinearService(getRootOpts(command));
      
      // Fetch labels with optional team filtering
      const result = await service.getLabels(options.team);
      outputSuccess(result);
    }));
}
