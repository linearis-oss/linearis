import type { GraphQLClient } from "../client/graphql-client.js";
import {
  GetViewerDocument,
  type GetViewerQuery,
} from "../gql/graphql.js";

export interface Viewer {
  id: string;
  name: string;
  email: string;
}

export async function validateToken(
  client: GraphQLClient,
): Promise<Viewer> {
  const result = await client.request<GetViewerQuery>(GetViewerDocument);
  return result.viewer;
}
