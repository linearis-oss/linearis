import type { GraphQLClient } from "../client/graphql-client.js";
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
): Promise<Label[]> {
  const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;

  const result = await client.request<GetLabelsQuery>(GetLabelsDocument, {
    first: 50,
    filter,
  });

  return result.issueLabels.nodes.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description ?? undefined,
  }));
}
