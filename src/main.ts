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

import { program } from "commander";
import pkg from "../package.json" with { type: "json" };
import { setupCommentsCommands } from "./commands/comments.js";
import { setupEmbedsCommands } from "./commands/embeds.js";
import { setupGraphQLCommands } from "./commands/graphql.js";
import { setupIssuesCommands } from "./commands/issues.js";
import { setupLabelsCommands } from "./commands/labels.js";
import { setupProjectsCommands } from "./commands/projects.js";
import { setupCyclesCommands } from "./commands/cycles.js";
import { setupProjectMilestonesCommands } from "./commands/project-milestones.js";
import { setupTeamsCommands } from "./commands/teams.js";
import { setupUsersCommands } from "./commands/users.js";
import { setupDocumentsCommands } from "./commands/documents.js";
import { outputUsageInfo } from "./utils/usage.js";

// Setup main program
program
  .name("linearis")
  .description("CLI for Linear.app with JSON output")
  .version(pkg.version)
  .option("--api-token <token>", "Linear API token");

// Default action - show help when no subcommand
program.action(() => {
  program.help();
});

// Setup all subcommand groups
setupIssuesCommands(program);
setupCommentsCommands(program);
setupLabelsCommands(program);
setupProjectsCommands(program);
setupCyclesCommands(program);
setupProjectMilestonesCommands(program);
setupEmbedsCommands(program);
setupGraphQLCommands(program);
setupTeamsCommands(program);
setupUsersCommands(program);
setupDocumentsCommands(program);

// Add usage command
program.command("usage")
  .description("show usage info for *all* tools")
  .action(() => outputUsageInfo(program));

// Parse command line arguments
program.parse();
