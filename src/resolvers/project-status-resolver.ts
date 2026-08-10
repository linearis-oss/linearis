import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
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
 * @throws Error if status name not found, or if several statuses share it
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
  const matches = result.projectStatuses.nodes.filter(
    (s) => s.name.toLowerCase() === nameOrId.toLowerCase(),
  );

  if (matches.length === 0) {
    throw notFoundError("Project status", nameOrId);
  }

  // Names are only unique among live statuses: archiving one frees its name
  // for a replacement. With includeArchived the old and the new are both in
  // the list, and nothing in a name tells them apart, so say which is which
  // rather than let list order decide what gets updated or unarchived.
  if (matches.length > 1) {
    throw multipleMatchesError(
      "project status",
      nameOrId,
      matches.map(
        (s) => `${s.name}${s.archivedAt ? " (archived)" : ""} (${s.id})`,
      ),
      "address the status by UUID",
    );
  }

  const match = firstOrThrow(matches, () =>
    notFoundError("Project status", nameOrId),
  );
  return asUuid(match.id);
}
