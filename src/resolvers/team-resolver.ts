import type { LinearSdkClient } from "../client/linear-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";

export async function resolveTeamId(
  client: LinearSdkClient,
  keyOrNameOrId: string,
): Promise<string> {
  if (isUuid(keyOrNameOrId)) return keyOrNameOrId;

  // Try by key first
  const byKey = await client.sdk.teams({
    filter: { key: { eq: keyOrNameOrId } },
    first: 1,
  });
  if (byKey.nodes.length > 0) return byKey.nodes[0].id;

  // Fall back to name
  const byName = await client.sdk.teams({
    filter: { name: { eq: keyOrNameOrId } },
    first: 1,
  });
  if (byName.nodes.length > 0) return byName.nodes[0].id;

  throw notFoundError("Team", keyOrNameOrId);
}
