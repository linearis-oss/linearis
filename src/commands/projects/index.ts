import type { Command } from "commander";
import { type DomainMeta, formatDomainUsage } from "../../common/usage.js";
import { setupProjectEntityCommands } from "./entity.js";
import { setupProjectStatusCommands } from "./statuses.js";
import { setupProjectUpdateCommands } from "./updates.js";

export const PROJECTS_META: DomainMeta = {
  name: "projects",
  summary: "groups of issues toward a goal",
  context: [
    "a project collects related issues across teams. projects can have",
    "milestones to track progress toward deadlines or phases. projects",
    "have a status (backlog, planned, started, paused, completed,",
    "canceled), priority (0-4), health (onTrack, atRisk, offTrack),",
    "and can be assigned labels, a lead, and members.",
    "",
    "projects have one put-away state, not two: `delete` trashes a project",
    "and `unarchive` restores it. there is no `archive` verb.",
    "",
    "a project's health is derived from its most recent status update, so",
    "changing health means posting one with `projects updates create`.",
    "",
    "project statuses are workspace-scoped, not per-team: `projects",
    "statuses` administers the one ordered flow every project draws from.",
  ].join("\n"),
  arguments: {
    project: "project identifier (UUID or name)",
    update: "project status update identifier (UUID)",
    status: "project status identifier (UUID or name)",
    name: "string",
  },
  seeAlso: [
    "milestones list --project",
    "documents list --project",
    "issues create --project",
  ],
};

export function setupProjectsCommands(program: Command): void {
  const projects = program
    .command("projects")
    .description("Project operations");

  setupProjectEntityCommands(projects);
  setupProjectUpdateCommands(projects);
  setupProjectStatusCommands(projects);

  projects
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
