import { Command } from "commander";
import { createGraphQLService } from "../utils/graphql-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

/**
 * Setup whoami command on the program
 *
 * Registers the `whoami` command which returns information about the
 * currently authenticated user (viewer).
 *
 * @param program - Commander.js program instance to register command on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupWhoamiCommand(program);
 * // Enables: linearis whoami
 * ```
 */
export function setupWhoamiCommand(program: Command): void {
  /**
   * Get current user information
   *
   * Command: `linearis whoami`
   *
   * Returns information about the currently authenticated user including
   * ID, name, email, display name, avatar URL, and admin status.
   */
  program.command("whoami")
    .description("Get information about the current authenticated user")
    .action(
      handleAsyncCommand(
        async (_options: any, command: Command) => {
          const graphQLService = await createGraphQLService(command.parent!.opts());

          const query = `
            query GetCurrentUser {
              viewer {
                id
                name
                displayName
                email
                avatarUrl
                admin
                active
                createdAt
              }
            }
          `;

          const result = await graphQLService.rawRequest(query);

          if (!result.viewer) {
            throw new Error("Failed to get current user information");
          }

          outputSuccess(result.viewer);
        },
      ),
    );
}
