import { Command } from "commander";
import { getRootOpts } from "../utils/context.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

/**
 * Setup users commands on the program
 *
 * Registers `users` command group for listing Linear users.
 * Provides user information including id, name, displayName, email, and active status.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupUsersCommands(program);
 * // Enables: linearis users list
 * ```
 */
export function setupUsersCommands(program: Command): void {
  const users = program
    .command("users")
    .description("User operations");

  // Show users help when no subcommand
  users.action(() => {
    users.help();
  });

  /**
   * List all users
   *
   * Command: `linearis users list`
   *
   * Lists all users in the workspace with their id, name, displayName, email, and active status.
   * Can filter to show only active users with --active flag.
   */
  users
    .command("list")
    .description("List all users")
    .option("--active", "Only show active users")
    .action(
      handleAsyncCommand(async (options: any, command: Command) => {
        // Initialize Linear service for user operations
        const service = await createLinearService(getRootOpts(command));

        // Fetch all users from the workspace
        const result = await service.getUsers(options.active);
        outputSuccess(result);
      })
    );
}
