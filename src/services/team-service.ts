import type { GraphQLClient } from "../client/graphql-client.js";
import { GetTeamsDocument, type GetTeamsQuery } from "../gql/graphql.js";

export interface Team {
  id: string;
  key: string;
  name: string;
}

export async function listTeams(client: GraphQLClient): Promise<Team[]> {
  const result = await client.request<GetTeamsQuery>(GetTeamsDocument, {
    first: 50,
  });
  return result.teams.nodes;
}
