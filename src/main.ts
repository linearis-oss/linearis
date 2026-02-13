#!/usr/bin/env node

import { Option, program } from "commander";
import pkg from "../package.json" with { type: "json" };
import { AUTH_META, setupAuthCommands } from "./commands/auth.js";
import { COMMENTS_META, setupCommentsCommands } from "./commands/comments.js";
import { CYCLES_META, setupCyclesCommands } from "./commands/cycles.js";
import {
  DOCUMENTS_META,
  setupDocumentsCommands,
} from "./commands/documents.js";
import { FILES_META, setupFilesCommands } from "./commands/files.js";
import { ISSUES_META, setupIssuesCommands } from "./commands/issues.js";
import { LABELS_META, setupLabelsCommands } from "./commands/labels.js";
import {
  MILESTONES_META,
  setupMilestonesCommands,
} from "./commands/milestones.js";
import { PROJECTS_META, setupProjectsCommands } from "./commands/projects.js";
import { setupTeamsCommands, TEAMS_META } from "./commands/teams.js";
import { setupUsersCommands, USERS_META } from "./commands/users.js";
import {
  type DomainMeta,
  formatDomainUsage,
  formatOverview,
} from "./common/usage.js";

program
  .name("linearis")
  .description("CLI for Linear.app with JSON output")
  .version(pkg.version)
  .option("--api-token <token>", "Linear API token");

const allMetas: DomainMeta[] = [
  AUTH_META,
  ISSUES_META,
  COMMENTS_META,
  LABELS_META,
  PROJECTS_META,
  CYCLES_META,
  MILESTONES_META,
  DOCUMENTS_META,
  FILES_META,
  TEAMS_META,
  USERS_META,
];

program.action(() => console.log(formatOverview(pkg.version, allMetas)));

setupAuthCommands(program);
setupIssuesCommands(program);
setupCommentsCommands(program);
setupLabelsCommands(program);
setupProjectsCommands(program);
setupCyclesCommands(program);
setupMilestonesCommands(program);
setupFilesCommands(program);
setupTeamsCommands(program);
setupUsersCommands(program);
setupDocumentsCommands(program);

program
  .command("usage")
  .description("show overview of all domains")
  .addOption(
    new Option("--all", "output all domain usages concatenated")
      .default(false)
      .hideHelp(),
  )
  .action((options: { all: boolean }) => {
    console.log(formatOverview(pkg.version, allMetas));
    if (options.all) {
      for (const meta of allMetas) {
        console.log("\n---\n");
        const cmd = program.commands.find((c) => c.name() === meta.name);
        if (cmd) {
          console.log(formatDomainUsage(cmd, meta));
        }
      }
    }
  });

program.parse();
