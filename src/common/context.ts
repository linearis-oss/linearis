import { GraphQLClient } from "../client/graphql-client.js";
import { LinearSdkClient } from "../client/linear-client.js";
import { getApiToken, type CommandOptions } from "./auth.js";

export interface CommandContext {
  gql: GraphQLClient;
  sdk: LinearSdkClient;
}

/**
 * Creates command context with authenticated clients.
 *
 * Initializes both GraphQL and SDK clients for use in commands.
 * The GraphQL client is used for optimized queries, while the SDK
 * client is used for ID resolution and lookups.
 *
 * @param options - Command options containing API token
 * @returns Context with initialized clients
 */
export async function createContext(options: CommandOptions): Promise<CommandContext> {
  const token = await getApiToken(options);
  return {
    gql: new GraphQLClient(token),
    sdk: new LinearSdkClient(token),
  };
}
