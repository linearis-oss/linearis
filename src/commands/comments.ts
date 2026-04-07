import { Command } from "commander";
import { getRootOpts } from "../utils/context.js";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

/**
 * Setup comments commands on the program
 * 
 * Registers the `comments` command group and its subcommands for managing
 * Linear issue comments. Provides create operations for adding comments
 * to issues with smart ID resolution.
 * 
 * @param program - Commander.js program instance to register commands on
 * 
 * @example
 * ```typescript
 * // In main.ts
 * setupCommentsCommands(program);
 * // Enables: linearis comments create ABC-123 --body "My comment"
 * ```
 */
export function setupCommentsCommands(program: Command): void {
  const comments = program.command("comments")
    .description("Comment operations");

  // Show comments help when no subcommand
  comments.action(() => {
    comments.help();
  });

  /**
   * Create new comment on issue
   * 
   * Command: `linearis comments create <issueId> --body <comment>`
   * 
   * Supports both UUID and TEAM-123 format issue identifiers.
   * Resolves identifiers to UUIDs before creating the comment.
   */
  comments.command("create <issueId>")
    .description("Create new comment on issue.")
    .addHelpText('after', `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`)
    .option("--body <body>", "comment body (required)")
    .action(
      handleAsyncCommand(
        async (issueId: string, options: any, command: Command) => {
          // Initialize Linear service with authentication
          const service = await createLinearService(
            getRootOpts(command),
          );

          // Validate required body flag
          if (!options.body) {
            throw new Error("--body is required");
          }

          // Resolve issue ID if it's an identifier (TEAM-123 -> UUID)
          const resolvedIssueId = await service.resolveIssueId(issueId);

          // Create comment using Linear SDK
          const result = await service.createComment({
            issueId: resolvedIssueId,
            body: options.body,
          });

          outputSuccess(result);
        },
      ),
    );
}
