import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import { GetLabelsDocument, type GetLabelsQuery } from "../gql/graphql.js";

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export async function listLabels(
  client: GraphQLClient,
  teamId?: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<Label>> {
  const { limit = 50, after } = options;
  const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;

  const result = await client.request<GetLabelsQuery>(GetLabelsDocument, {
    first: limit,
    after,
    filter,
  });

  return {
    nodes: result.issueLabels.nodes.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description ?? undefined,
    })),
    pageInfo: result.issueLabels.pageInfo,
  };
}
