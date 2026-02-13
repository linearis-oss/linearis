import type { GraphQLClient } from "../client/graphql-client.js";
import type { Viewer } from "../common/types.js";
import { GetViewerDocument, type GetViewerQuery } from "../gql/graphql.js";

export async function validateToken(client: GraphQLClient): Promise<Viewer> {
  const result = await client.request<GetViewerQuery>(GetViewerDocument);
  return result.viewer;
}
