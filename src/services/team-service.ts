import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import { GetTeamsDocument, type GetTeamsQuery } from "../gql/graphql.js";

export interface Team {
  id: string;
  key: string;
  name: string;
}

export async function listTeams(
  client: GraphQLClient,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Team>> {
  const { limit = 50, after } = options;
  const result = await client.request<GetTeamsQuery>(GetTeamsDocument, {
    first: limit,
    after,
  });
  return {
    nodes: result.teams.nodes,
    pageInfo: result.teams.pageInfo,
  };
}
