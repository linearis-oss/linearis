import type { Command } from "commander";
import { type CommandOptions, createContext } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { listUsers } from "../services/user-service.js";

interface ListUsersOptions extends CommandOptions {
  active?: boolean;
}

export const USERS_META: DomainMeta = {
  name: "users",
  summary: "workspace members and assignees",
  context: [
    "a user is a member of the Linear workspace. users can be assigned to",
    "issues and belong to teams.",
  ].join("\n"),
  arguments: {},
  seeAlso: [],
};

export function setupUsersCommands(program: Command): void {
  const users = program.command("users").description("User operations");

  users.action(() => users.help());

  users
    .command("list")
    .description("list workspace members")
    .option("--active", "only show active users")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [ListUsersOptions, Command];
        const ctx = createContext(command.parent!.parent!.opts());
        const result = await listUsers(ctx.gql, options.active || false);
        outputSuccess(result);
      }),
    );

  users
    .command("usage")
    .description("show detailed usage for users")
    .action(() => {
      console.log(formatDomainUsage(users, USERS_META));
    });
}
