import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { GetProjectStatusesDocument } from "../gql/graphql.js";

/**
 * Resolves project status name to UUID.
 *
 * Accepts UUID (returned as-is) or a status name (case-insensitive match).
 *
 * ARCHITECTURAL EXCEPTION: This resolver uses GraphQLClient instead of
 * LinearSdkClient because the Linear SDK's projectStatuses() method does
 * not support server-side filtering. A GraphQL query fetches all statuses
 * (a small fixed set) and filters client-side. This is a documented
 * deviation from the standard resolver contract (resolvers normally use
 * SDK only).
 *
 * @param client - GraphQL client for querying project statuses
 * @param nameOrId - Status name or UUID
 * @returns Status UUID
 * @throws Error if status name not found
 */
export async function resolveProjectStatusId(
  client: GraphQLClient,
  nameOrId: string,
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const result = await client.request(GetProjectStatusesDocument);
  const match = result.projectStatuses.nodes.find(
    (s) => s.name.toLowerCase() === nameOrId.toLowerCase(),
  );

  if (!match) {
    throw notFoundError("Project status", nameOrId);
  }

  return asUuid(match.id);
}
