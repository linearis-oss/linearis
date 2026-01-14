import { Command } from "commander";
import { createGraphQLService } from "../utils/graphql-service.js";
import { GraphQLProjectsService } from "../utils/graphql-projects-service.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

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
    .action(handleAsyncCommand(async (_options: any, command: Command) => {
      // Initialize Linear service for project operations
      const service = await createLinearService(command.parent!.parent!.opts());

      // Fetch all projects with their relationships
      const result = await service.getProjects();
      outputSuccess(result);
    }));

  /**
   * Create a new project
   *
   * Command: `linearis projects create <name> --team <team> [options]`
   *
   * Creates a new project with the specified name and team.
   * Team is required by the Linear API.
   */
  projects
    .command("create <name>")
    .description("Create a new project")
    .requiredOption(
      "--team <team>",
      "team key, name, or ID (required, can specify multiple with commas)",
    )
    .option("-d, --description <desc>", "project description")
    .option("--color <color>", "project color (hex code)")
    .option("--icon <icon>", "project icon")
    .option("--lead <leadId>", "project lead user ID (UUID)")
    .option("--target-date <date>", "target completion date (YYYY-MM-DD)")
    .option("--start-date <date>", "project start date (YYYY-MM-DD)")
    .option(
      "--state <state>",
      "project state: planned, started, paused, completed, canceled",
    )
    .action(
      handleAsyncCommand(async (name: string, options: any, command: Command) => {
        const [graphQLService, linearService] = await Promise.all([
          createGraphQLService(command.parent!.parent!.opts()),
          createLinearService(command.parent!.parent!.opts()),
        ]);
        const projectsService = new GraphQLProjectsService(
          graphQLService,
          linearService,
        );

        // Parse team IDs (comma-separated)
        const teamIds = options.team.split(",").map((t: string) => t.trim());

        // Validate state if provided
        const validStates = [
          "planned",
          "started",
          "paused",
          "completed",
          "canceled",
        ];
        if (options.state && !validStates.includes(options.state)) {
          throw new Error(
            `Invalid --state "${options.state}". Must be one of: ${validStates.join(", ")}`,
          );
        }

        // Validate date format (YYYY-MM-DD)
        const isValidDate = (dateStr: string): boolean => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
          const date = new Date(dateStr);
          return !isNaN(date.getTime());
        };

        if (options.targetDate && !isValidDate(options.targetDate)) {
          throw new Error(
            `Invalid --target-date "${options.targetDate}". Must be YYYY-MM-DD format.`,
          );
        }

        if (options.startDate && !isValidDate(options.startDate)) {
          throw new Error(
            `Invalid --start-date "${options.startDate}". Must be YYYY-MM-DD format.`,
          );
        }

        const createArgs = {
          name,
          teamIds,
          description: options.description,
          color: options.color,
          icon: options.icon,
          leadId: options.lead,
          targetDate: options.targetDate,
          startDate: options.startDate,
          state: options.state,
        };

        const result = await projectsService.createProject(createArgs);
        outputSuccess(result);
      }),
    );
}
