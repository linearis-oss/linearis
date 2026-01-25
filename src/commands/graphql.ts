import { Command } from "commander";
import fs from "fs";
import { createGraphQLService } from "../utils/graphql-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";

/**
 * Read all data from stdin
 *
 * Collects chunks from stdin stream and returns as UTF-8 string.
 * Used when query is piped to the command.
 *
 * @returns Promise resolving to stdin content as string
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Setup graphql command on the program
 *
 * Registers the `graphql` command for executing raw GraphQL queries
 * against the Linear API. Supports inline queries, file input, and stdin.
 *
 * @param program - Commander.js program instance to register commands on
 *
 * @example
 * ```typescript
 * // In main.ts
 * setupGraphQLCommands(program);
 * // Enables: linearis graphql '{ viewer { id } }'
 * ```
 */
export function setupGraphQLCommands(program: Command): void {
  program
    .command("graphql [query]")
    .description("Execute a raw GraphQL query against the Linear API")
    .option("-f, --file <path>", "read query from file")
    .option("-v, --vars <json>", "JSON variables for the query")
    .action(
      handleAsyncCommand(
        async (query: string | undefined, options: any, command: Command) => {
          // Get query from: 1) --file, 2) positional arg, 3) stdin
          let finalQuery = query;

          if (options.file) {
            finalQuery = fs.readFileSync(options.file, "utf8");
          } else if (!finalQuery && !process.stdin.isTTY) {
            // Read from stdin when piped
            finalQuery = await readStdin();
          }

          if (!finalQuery) {
            throw new Error(
              "No query provided. Use inline query, --file, or pipe to stdin.",
            );
          }

          // Parse variables if provided
          let variables: Record<string, unknown> | undefined;
          if (options.vars) {
            try {
              variables = JSON.parse(options.vars);
            } catch {
              throw new Error(`Invalid JSON in --vars: ${options.vars}`);
            }
          }

          // Execute query
          const service = await createGraphQLService(command.parent!.opts());
          const result = await service.rawRequest(finalQuery, variables);
          outputSuccess(result);
        },
      ),
    );
}
