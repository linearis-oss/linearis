import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  FindWorkflowStatesDocument,
  type WorkflowStateFilter,
} from "../gql/graphql.js";

export async function resolveStatusId(
  client: GraphQLClient,
  nameOrId: string,
  teamId?: UUID,
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const filter: WorkflowStateFilter = {
    name: { eqIgnoreCase: nameOrId },
  };

  if (teamId) {
    filter.team = { id: { eq: teamId } };
  }

  const { workflowStates } = await client.request(FindWorkflowStatesDocument, {
    filter,
    first: 1,
  });

  return asUuid(
    firstOrThrow(workflowStates.nodes, () =>
      notFoundError(
        "Status",
        nameOrId,
        teamId ? `for team ${teamId}` : undefined,
      ),
    ).id,
  );
}
