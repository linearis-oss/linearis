import { Command } from "commander";
import { createContext, type CommandOptions } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { listProjects } from "../services/project-service.js";

/**
 * Setup projects commands on the program
 *
 * Registers `projects` command group for Linear project management.
 * Provides listing functionality with comprehensive project information
 * including teams, progress, and leadership details.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupProjectsCommands(program);
 * // Enables: linearis projects list [--limit <number>]
 * ```
 */
export function setupProjectsCommands(program: Command): void {
  const projects = program.command("projects")
    .description("Project operations");

  // Show projects help when no subcommand
  projects.action(() => {
    projects.help();
  });

  /**
   * List projects
   *
   * Command: `linearis projects list [--limit <number>]`
   *
   * Lists all projects with their teams, leads, and progress information.
   * Note: Linear SDK doesn't implement pagination, so all projects are shown.
   */
  projects.command("list")
    .description("List projects")
    .option(
      "-l, --limit <number>",
      "limit results (not implemented by Linear SDK, showing all)",
      "100",
    )
    .action(handleCommand(async (...args: unknown[]) => {
      const [, command] = args as [CommandOptions, Command];
      const ctx = await createContext(command.parent!.parent!.opts());
      const result = await listProjects(ctx.sdk);
      outputSuccess(result);
    }));
}
