import type { GraphQLClient } from "../client/graphql-client.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { FindUsersDocument, GetViewerDocument } from "../gql/graphql.js";

/** Spellings of "the authenticated user" accepted wherever a user is expected. */
const VIEWER_ALIASES: ReadonlySet<string> = new Set(["me", "@me"]);

/**
 * True when a user reference names the caller rather than a lookup value.
 *
 * Exported for the batch resolvers: they resolve most user references through
 * a name/email GraphQL filter, and `me` matches neither, so they have to divert
 * it to {@link resolveViewerId} before building the query.
 */
export function isViewerAlias(nameOrEmailOrId: string): boolean {
  return VIEWER_ALIASES.has(nameOrEmailOrId.toLowerCase());
}

/**
 * Resolves the authenticated user's UUID.
 *
 * ARCHITECTURAL EXCEPTION: this resolver queries `viewer` directly rather than
 * going through a lean filter-based lookup. There is no filter that selects
 * "the caller" — `viewer` is the only way to ask — and the query is already as
 * lean as it gets (three scalars on a single node).
 */
export async function resolveViewerId(client: GraphQLClient): Promise<UUID> {
  const { viewer } = await client.request(GetViewerDocument);
  return asUuid(viewer.id);
}

/**
 * Resolves a user reference to a UUID.
 *
 * Accepts a UUID, a display name, an email address, or `me`/`@me` for the
 * authenticated user.
 */
export async function resolveUserId(
  client: GraphQLClient,
  nameOrEmailOrId: string,
): Promise<UUID> {
  if (isUuid(nameOrEmailOrId)) return asUuid(nameOrEmailOrId);

  if (isViewerAlias(nameOrEmailOrId)) {
    return resolveViewerId(client);
  }

  // Try by display name first (case-insensitive)
  const { users: byName } = await client.request(FindUsersDocument, {
    filter: { displayName: { eqIgnoreCase: nameOrEmailOrId } },
    first: 10,
  });

  const [byNameMatch] = byName.nodes;
  if (byName.nodes.length === 1 && byNameMatch) return asUuid(byNameMatch.id);

  if (byName.nodes.length > 1) {
    throw multipleMatchesError(
      "User",
      nameOrEmailOrId,
      byName.nodes.map((u) => `${u.name} <${u.email}>`),
      "Use email or UUID to disambiguate",
    );
  }

  // Fall back to email (case-insensitive)
  const { users: byEmail } = await client.request(FindUsersDocument, {
    filter: { email: { eqIgnoreCase: nameOrEmailOrId } },
    first: 1,
  });

  const [byEmailMatch] = byEmail.nodes;
  if (byEmailMatch) return asUuid(byEmailMatch.id);

  throw notFoundError("User", nameOrEmailOrId);
}
