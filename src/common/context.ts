import { GraphQLClient } from "../client/graphql-client.js";
import { LinearSdkClient } from "../client/linear-client.js";
import { type CommandOptions, getApiToken } from "./auth.js";

export type { CommandOptions };

export interface CommandContext {
  gql: GraphQLClient;
  sdk: LinearSdkClient;
}

export function createContext(options: CommandOptions): CommandContext {
  const token = getApiToken(options);
  return {
    gql: new GraphQLClient(token),
    sdk: new LinearSdkClient(token),
  };
}

export function createGraphQLClient(token: string): GraphQLClient {
  return new GraphQLClient(token);
}
