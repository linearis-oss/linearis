import type { Command } from "commander";
import { type DomainMeta, formatDomainUsage } from "../../common/usage.js";
import { setupInitiativeEntityCommands } from "./entity.js";
import { setupInitiativeProjectCommands } from "./projects.js";
import { setupInitiativeRelationCommands } from "./relations.js";
import { setupInitiativeUpdateCommands } from "./updates.js";

export const INITIATIVES_META: DomainMeta = {
  name: "initiatives",
  summary: "strategic multi-project goals",
  context: [
    "initiatives represent larger outcomes that span projects and teams.",
    "use initiative updates for status communication, and relation/project",
    "commands to manage initiative hierarchies and linked projects.",
  ].join("\n"),
  arguments: {
    initiative: "initiative identifier (UUID or name)",
    parent: "parent initiative identifier (UUID or name)",
    child: "child initiative identifier (UUID or name)",
    project: "project identifier (UUID or name)",
    update: "initiative update identifier (UUID)",
    name: "string",
  },
  seeAlso: ["projects list", "projects read", "users list"],
};

export function setupInitiativesCommands(program: Command): void {
  const initiatives = program
    .command("initiatives")
    .description("Initiative operations");

  setupInitiativeEntityCommands(initiatives);
  setupInitiativeRelationCommands(initiatives);
  setupInitiativeProjectCommands(initiatives);
  setupInitiativeUpdateCommands(initiatives);

  initiatives
    .command("usage")
    .description("show detailed usage for initiatives")
    .action(() => {
      console.log(formatDomainUsage(initiatives, INITIATIVES_META));
    });
}
