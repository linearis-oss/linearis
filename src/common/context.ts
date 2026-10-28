import type { Command } from "commander";
import {
  GraphQLClient,
  setGraphqlRequestTimeoutMs,
} from "../client/graphql-client.js";
import {
  type CommandOptions,
  getApiToken,
  resolveGraphqlTimeoutMs,
} from "./auth.js";

export type { CommandOptions };

export interface CommandContext {
  gql: GraphQLClient;
}

export function configureGraphqlRequestTimeout(options: CommandOptions): void {
  setGraphqlRequestTimeoutMs(resolveGraphqlTimeoutMs(options));
}

export function createContext(options: CommandOptions): CommandContext {
  const token = getApiToken(options);
  configureGraphqlRequestTimeout(options);
  return {
    gql: new GraphQLClient(token),
  };
}

export function createGraphQLClient(token: string): GraphQLClient {
  return new GraphQLClient(token);
}

export function getRootOpts(command: Command): CommandOptions {
  let current: Command = command;

  while (current.parent) {
    current = current.parent;
  }

  return current.opts() as CommandOptions;
}
