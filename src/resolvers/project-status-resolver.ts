import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { GetProjectStatusesDocument } from "../gql/graphql.js";

/**
 * How many statuses one lookup reads.
 *
 * Stated here rather than left to the query default so the bound and the
 * message that reports hitting it cannot drift apart.
 */
const PROJECT_STATUS_PAGE_SIZE = 250;

/**
 * Resolves project status name to UUID.
 *
 * Accepts UUID (returned as-is) or a status name (case-insensitive match).
 *
 * projectStatuses has no server-side name filter, so this fetches the list
 * and matches client-side. The list is bounded, and a workspace that outgrows
 * the bound gets a refusal rather than an answer drawn from a partial page.
 *
 * @param client - GraphQL client for querying project statuses
 * @param nameOrId - Status name or UUID
 * @param options.includeArchived - Search archived statuses too. Needed by
 *   `projects statuses unarchive`, where the status being named is by
 *   definition not in the default set.
 * @returns Status UUID
 * @throws Error if status name not found, if several statuses share it, or if
 *   the workspace holds more statuses than one page can carry
 */
export async function resolveProjectStatusId(
  client: GraphQLClient,
  nameOrId: string,
  options: { includeArchived?: boolean } = {},
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const result = await client.request(GetProjectStatusesDocument, {
    includeArchived: options.includeArchived ?? false,
    first: PROJECT_STATUS_PAGE_SIZE,
  });
  const matches = result.projectStatuses.nodes.filter(
    (s) => s.name.toLowerCase() === nameOrId.toLowerCase(),
  );

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

  // The connection is bounded and takes no name filter, so past the bound the
  // page says nothing about the rest: an unmatched name may live on the next
  // page, and a lone match may have an archived twin there that would have
  // made the name ambiguous. Both readings are wrong in a way the caller
  // cannot see, so refuse before either the not-found or the single-match
  // return.
  if (result.projectStatuses.pageInfo.hasNextPage) {
    throw new Error(
      `The workspace has more than ${PROJECT_STATUS_PAGE_SIZE} project ` +
        `statuses, so "${nameOrId}" cannot be matched against the full list. ` +
        "Find the status with `projects statuses list` and address it by UUID.",
    );
  }

  if (matches.length === 0) {
    throw notFoundError("Project status", nameOrId);
  }

  const match = firstOrThrow(matches, () =>
    notFoundError("Project status", nameOrId),
  );
  return asUuid(match.id);
}
