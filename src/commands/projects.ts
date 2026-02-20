import type { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { listProjects } from "../services/project-service.js";

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
  const projects = program
    .command("projects")
    .description("Project operations");

  projects.action(() => projects.help());

  projects
    .command("list")
    .description("list projects")
    .option("-l, --limit <n>", "max results", "100")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [
          { limit: string; after?: string },
          Command,
        ];
        const ctx = createContext(command.parent!.parent!.opts());
        const result = await listProjects(ctx.gql, {
          limit: parseLimit(options.limit),
          after: options.after,
        });
        outputSuccess(result);
      }),
    );

  projects
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
