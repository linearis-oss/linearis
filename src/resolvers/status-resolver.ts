import type { LinearDocument } from "@linear/sdk";
import type { LinearSdkClient } from "../client/linear-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";

export async function resolveStatusId(
  client: LinearSdkClient,
  nameOrId: string,
  teamId?: string,
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  const filter: LinearDocument.WorkflowStateFilter = {
    name: { eqIgnoreCase: nameOrId },
  };

  if (teamId) {
    filter.team = { id: { eq: teamId } };
  }

  const result = await client.sdk.workflowStates({
    filter,
    first: 1,
  });

  return firstOrThrow(result.nodes, () =>
    notFoundError(
      "Status",
      nameOrId,
      teamId ? `for team ${teamId}` : undefined,
    ),
  ).id;
}
