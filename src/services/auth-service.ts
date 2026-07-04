import type { GraphQLClient } from "../client/graphql-client.js";
import { GetViewerDocument, type GetViewerQuery } from "../gql/graphql.js";

// Viewer projection types
export type Viewer = GetViewerQuery["viewer"];

export async function validateToken(client: GraphQLClient): Promise<Viewer> {
  const result = await client.request(GetViewerDocument);
  return result.viewer;
}
