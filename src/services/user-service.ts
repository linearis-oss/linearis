import type { GraphQLClient } from "../client/graphql-client.js";
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
): Promise<User[]> {
  const filter = activeOnly ? { active: { eq: true } } : undefined;
  const result = await client.request<GetUsersQuery>(GetUsersDocument, {
    first: 50,
    filter,
  });

  // Sort by name to match Linear SDK behavior
  return result.users.nodes.sort((a, b) => a.name.localeCompare(b.name));
}
