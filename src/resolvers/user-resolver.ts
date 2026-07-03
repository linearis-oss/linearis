import type { GraphQLClient } from "../client/graphql-client.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { FindUsersDocument } from "../gql/graphql.js";

export async function resolveUserId(
  client: GraphQLClient,
  nameOrEmailOrId: string,
): Promise<UUID> {
  if (isUuid(nameOrEmailOrId)) return asUuid(nameOrEmailOrId);

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
