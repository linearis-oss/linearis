import type { LinearSdkClient } from "../client/linear-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";

export type LabelResolverScope = "workspace" | "team";

export interface ResolveLabelOptions {
  teamId?: string;
  scope?: LabelResolverScope;
}

function buildLabelFilter(
  nameOrId: string,
  options: ResolveLabelOptions,
): Record<string, unknown> {
  if (options.scope === "workspace") {
    return {
      name: { eqIgnoreCase: nameOrId },
      team: { null: true },
    };
  }

  if (options.scope === "team" && options.teamId) {
    return {
      name: { eqIgnoreCase: nameOrId },
      team: { id: { eq: options.teamId }, null: false },
    };
  }

  if (options.teamId) {
    return {
      name: { eqIgnoreCase: nameOrId },
      team: { id: { eq: options.teamId } },
    };
  }

  return { name: { eqIgnoreCase: nameOrId } };
}

export async function resolveLabelId(
  client: LinearSdkClient,
  nameOrId: string,
  options: ResolveLabelOptions = {},
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const result = await client.sdk.issueLabels({
    filter: buildLabelFilter(nameOrId, options),
    first: 1,
  });

  return asUuid(
    firstOrThrow(result.nodes, () => notFoundError("Label", nameOrId)).id,
  );
}

export async function resolveLabelIds(
  client: LinearSdkClient,
  namesOrIds: string[],
): Promise<UUID[]> {
  return Promise.all(namesOrIds.map((id) => resolveLabelId(client, id)));
}
