#!/usr/bin/env node

/**
 * Linearis CLI - A command-line tool for Linear.app with structured JSON output
 *
 * This tool provides optimized GraphQL operations for Linear API interactions,
 * smart ID resolution (UUID and TEAM-123 formats), and comprehensive
 * entity management capabilities.
 *
 * Key features:
 * - Single-query GraphQL operations with batch resolving
 * - Human-friendly ID resolution (TEAM-123 → UUID)
 * - Structured JSON output for LLM consumption
 * - Complete API coverage with optimized queries
 */

import { program, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { setupAuthCommands, AUTH_META } from "./commands/auth.js";
import { setupCommentsCommands, COMMENTS_META } from "./commands/comments.js";
import { setupFilesCommands, FILES_META } from "./commands/files.js";
import { setupIssuesCommands, ISSUES_META } from "./commands/issues.js";
import { setupLabelsCommands, LABELS_META } from "./commands/labels.js";
import { setupProjectsCommands, PROJECTS_META } from "./commands/projects.js";
import { setupCyclesCommands, CYCLES_META } from "./commands/cycles.js";
import { setupMilestonesCommands, MILESTONES_META } from "./commands/milestones.js";
import { setupTeamsCommands, TEAMS_META } from "./commands/teams.js";
import { setupUsersCommands, USERS_META } from "./commands/users.js";
import { setupDocumentsCommands, DOCUMENTS_META } from "./commands/documents.js";
import {
  formatOverview,
  formatDomainUsage,
  type DomainMeta,
} from "./common/usage.js";

// Setup main program
program
  .name("linearis")
  .description("CLI for Linear.app with JSON output")
  .version(pkg.version)
  .option("--api-token <token>", "Linear API token");

// Collect all domain metadata (order matches overview display)
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

// Default action - show usage overview when no subcommand
program.action(() => {
  console.log(formatOverview(pkg.version, allMetas));
});

// Setup all subcommand groups
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

// Add usage command with hidden --all flag for static file generation
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

// Parse command line arguments
program.parse();
