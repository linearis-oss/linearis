import type { Command } from "commander";
import { type DomainMeta, formatDomainUsage } from "../../common/usage.js";
import { setupProjectEntityCommands } from "./entity.js";
import { setupProjectRelationCommands } from "./relations.js";
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
    "",
    "project labels are managed under `labels --type project`, not here.",
    "`projects create/update --labels` applies existing ones by name.",
    "",
    "`projects activity` shares the envelope and flags of `issues activity`",
    "but not the item shape: Linear's ProjectHistory carries one opaque",
    "`entries` object instead of typed from/to fields, so history items are",
    "passed through verbatim rather than normalized into `changes[]`.",
    "",
    "project relations are scheduling dependencies, not issue-style link",
    "types: each end anchors to a project's start or end (or to one of its",
    'milestones). `--from end --to start` is the default and means "this',
    'must finish before that starts".',
  ].join("\n"),
  arguments: {
    project: "project identifier (UUID or name)",
    update: "project status update identifier (UUID)",
    status: "project status identifier (UUID or name)",
    relation: "project relation UUID, or a project when --blocks is given",
    name: "string",
  },
  seeAlso: [
    "labels list --type project",
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
  setupProjectRelationCommands(projects);

  projects
    .command("usage")
    .description("show detailed usage for projects")
    .action(() => {
      console.log(formatDomainUsage(projects, PROJECTS_META));
    });
}
