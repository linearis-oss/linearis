import { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { formatDomainUsage, type DomainMeta } from "../common/usage.js";
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
export const PROJECTS_META: DomainMeta = {
  name: "projects",
  summary: "groups of issues toward a goal",
  context: [
    "a project collects related issues across teams. projects can have",
    "milestones to track progress toward deadlines or phases.",
  ].join("\n"),
  arguments: {},
  seeAlso: ["milestones list --project", "documents list --project"],
};

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
    .description("list projects")
    .option(
      "-l, --limit <n>",
      "max results",
      "100",
    )
    .action(handleCommand(async (...args: unknown[]) => {
      const [options, command] = args as [{ limit: string }, Command];
      const ctx = createContext(command.parent!.parent!.opts());
      const result = await listProjects(ctx.gql, parseInt(options.limit));
      outputSuccess(result);
    }));

  projects
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
