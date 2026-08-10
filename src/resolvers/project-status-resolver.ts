import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { GetProjectStatusesDocument } from "../gql/graphql.js";

/**
 * Resolves project status name to UUID.
 *
 * Accepts UUID (returned as-is) or a status name (case-insensitive match).
 *
 * projectStatuses has no server-side name filter, so this fetches the full
 * (small, fixed) set and matches client-side.
 *
 * @param client - GraphQL client for querying project statuses
 * @param nameOrId - Status name or UUID
 * @param options.includeArchived - Search archived statuses too. Needed by
 *   `projects statuses unarchive`, where the status being named is by
 *   definition not in the default set.
 * @returns Status UUID
 * @throws Error if status name not found
 */
export async function resolveProjectStatusId(
  client: GraphQLClient,
  nameOrId: string,
  options: { includeArchived?: boolean } = {},
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const result = await client.request(GetProjectStatusesDocument, {
    includeArchived: options.includeArchived ?? false,
  });
  const match = result.projectStatuses.nodes.find(
    (s) => s.name.toLowerCase() === nameOrId.toLowerCase(),
  );

  if (!match) {
    throw notFoundError("Project status", nameOrId);
  }

  return asUuid(match.id);
}
