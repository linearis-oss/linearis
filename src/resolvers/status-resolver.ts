import type { LinearDocument } from "@linear/sdk";
import type { LinearSdkClient } from "../client/linear-client.js";
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

  if (result.nodes.length === 0) {
    const context = teamId ? `for team ${teamId}` : undefined;
    throw notFoundError("Status", nameOrId, context);
  }

  return result.nodes[0].id;
}
