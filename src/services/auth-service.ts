import type { GraphQLClient } from "../client/graphql-client.js";
import type { Viewer } from "../common/types.js";
import { GetViewerDocument } from "../gql/graphql.js";

export async function validateToken(client: GraphQLClient): Promise<Viewer> {
  const result = await client.request(GetViewerDocument);
  return result.viewer;
}
