import type { Command } from "commander";
import { GraphQLClient } from "../client/graphql-client.js";
import { LinearSdkClient } from "../client/linear-client.js";
import { type CommandOptions, getApiToken } from "./auth.js";

export type { CommandOptions };

export function getRootOpts(command: Command): CommandOptions {
  let current: Command | null = command;
  while (current?.parent) {
    current = current.parent;
  }
  return current.opts() as CommandOptions;
}

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
