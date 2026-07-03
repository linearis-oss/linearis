import type { LinearDocument } from "@linear/sdk";
import type { LinearSdkClient } from "../client/linear-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";

export async function resolveStatusId(
  client: LinearSdkClient,
  nameOrId: string,
  teamId?: UUID,
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

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

  return asUuid(
    firstOrThrow(result.nodes, () =>
      notFoundError(
        "Status",
        nameOrId,
        teamId ? `for team ${teamId}` : undefined,
      ),
    ).id,
  );
}
