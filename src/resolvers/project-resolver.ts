import type { LinearSdkClient } from "../client/linear-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";
import { omitUndefined } from "../common/object.js";

export interface ResolveProjectIdOptions {
  includeArchived?: boolean;
}

export async function resolveProjectId(
  client: LinearSdkClient,
  nameOrId: string,
  options: ResolveProjectIdOptions = {},
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const result = await client.sdk.projects(
    omitUndefined({
      filter: { name: { eqIgnoreCase: nameOrId } },
      first: 2,
      includeArchived: options.includeArchived,
    }),
  );

  if (result.nodes.length === 0) {
    throw notFoundError("Project", nameOrId);
  }

  if (result.nodes.length > 1) {
    throw multipleMatchesError(
      "Project",
      nameOrId,
      result.nodes.map((project) => project.id),
      "provide project UUID",
    );
  }

  return firstOrThrow(result.nodes, () => notFoundError("Project", nameOrId))
    .id;
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

  return firstOrThrow(result.nodes, () =>
    notFoundError("Project label", nameOrId),
  ).id;
}

export async function resolveProjectLabelIds(
  client: LinearSdkClient,
  namesOrIds: string[],
): Promise<string[]> {
  return Promise.all(
    namesOrIds.map((nameOrId) => resolveProjectLabelId(client, nameOrId)),
  );
}
