import type { LinearSdkClient } from "../client/linear-client.js";
import { notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";

export interface ResolveProjectIdOptions {
  includeArchived?: boolean;
}

export async function resolveProjectId(
  client: LinearSdkClient,
  nameOrId: string,
  options: ResolveProjectIdOptions = {},
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const result = await client.sdk.projects({
    filter: { name: { eqIgnoreCase: nameOrId } },
    first: 1,
    includeArchived: options.includeArchived,
  });

  if (result.nodes.length === 0) {
    throw notFoundError("Project", nameOrId);
  }

  return result.nodes[0].id;
}

export async function resolveProjectLabelId(
  client: LinearSdkClient,
  nameOrId: string,
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const result = await client.sdk.projectLabels({
    filter: { name: { eqIgnoreCase: nameOrId } },
    first: 1,
  });

  if (result.nodes.length === 0) {
    throw notFoundError("Project label", nameOrId);
  }

  return result.nodes[0].id;
}

export async function resolveProjectLabelIds(
  client: LinearSdkClient,
  namesOrIds: string[],
): Promise<string[]> {
  return Promise.all(
    namesOrIds.map((nameOrId) => resolveProjectLabelId(client, nameOrId)),
  );
}
