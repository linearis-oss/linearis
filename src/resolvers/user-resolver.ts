import type { LinearSdkClient } from "../client/linear-client.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";

export async function resolveUserId(
  client: LinearSdkClient,
  nameOrEmailOrId: string,
): Promise<UUID> {
  if (isUuid(nameOrEmailOrId)) return asUuid(nameOrEmailOrId);

  // Try by display name first (case-insensitive)
  const byName = await client.sdk.users({
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
  const byEmail = await client.sdk.users({
    filter: { email: { eqIgnoreCase: nameOrEmailOrId } },
    first: 1,
  });

  const [byEmailMatch] = byEmail.nodes;
  if (byEmailMatch) return asUuid(byEmailMatch.id);

  throw notFoundError("User", nameOrEmailOrId);
}
