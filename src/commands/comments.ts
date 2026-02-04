import { Command } from "commander";
import { createContext, type CommandOptions } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import { createComment } from "../services/comment-service.js";

interface CreateCommentOptions extends CommandOptions {
  body?: string;
}

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
   * Command: `linearis comments create <issue> --body <text>`
   *
   * Supports both UUID and TEAM-123 format issue identifiers.
   * Resolves identifiers to UUIDs before creating the comment.
   */
  comments.command("create <issue>")
    .description("create a comment on an issue")
    .addHelpText('after', `\nWhen passing issue IDs, both UUID and identifiers like ABC-123 are supported.`)
    .option("--body <text>", "comment body (required, markdown supported)")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [issue, options, command] = args as [string, CreateCommentOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());

          // Validate required body flag
          if (!options.body) {
            throw new Error("--body is required");
          }

          // Resolve issue ID if it's an identifier (TEAM-123 -> UUID)
          const resolvedIssueId = await resolveIssueId(ctx.sdk, issue);

          // Create comment using service
          const result = await createComment(ctx.sdk, {
            issueId: resolvedIssueId,
            body: options.body,
          });

          outputSuccess(result);
        },
      ),
    );
}
