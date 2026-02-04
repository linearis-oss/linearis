import type { LinearSdkClient } from "../client/linear-client.js";
import { isUuid } from "../common/identifier.js";

export async function resolveProjectId(
  client: LinearSdkClient,
  nameOrId: string,
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const result = await client.sdk.projects({
    filter: { name: { eqIgnoreCase: nameOrId } },
    first: 1,
  });

  if (result.nodes.length === 0) {
    throw new Error(`Project "${nameOrId}" not found`);
  }

  return result.nodes[0].id;
}
