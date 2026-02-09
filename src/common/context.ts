import { GraphQLClient } from "../client/graphql-client.js";
import { LinearSdkClient } from "../client/linear-client.js";
import { type CommandOptions, getApiToken } from "./auth.js";

export type { CommandOptions };

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
export function createContext(options: CommandOptions): CommandContext {
  const token = getApiToken(options);
  return {
    gql: new GraphQLClient(token),
    sdk: new LinearSdkClient(token),
  };
}

/**
 * Creates a GraphQL client from a raw token.
 *
 * Used by the auth command to validate tokens before they are stored.
 * Other commands should use createContext() instead.
 */
export function createGraphQLClient(token: string): GraphQLClient {
  return new GraphQLClient(token);
}
