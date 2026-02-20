import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import { GetUsersDocument, type GetUsersQuery } from "../gql/graphql.js";

export interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export async function listUsers(
  client: GraphQLClient,
  activeOnly: boolean = false,
  options: PaginationOptions = {},
): Promise<PaginatedResult<User>> {
  const { limit = 50, after } = options;
  const filter = activeOnly ? { active: { eq: true } } : undefined;
  const result = await client.request<GetUsersQuery>(GetUsersDocument, {
    first: limit,
    after,
    filter,
  });

  // Sort by name to match Linear SDK behavior
  return {
    nodes: result.users.nodes.sort((a, b) => a.name.localeCompare(b.name)),
    pageInfo: result.users.pageInfo,
  };
}
