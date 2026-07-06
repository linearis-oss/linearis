import type { GraphQLClient } from "../client/graphql-client.js";
import type { UUID } from "../common/identifier.js";
import { ListWorkflowStatesForTeamDocument } from "../gql/graphql.js";

/** A workflow state (status) as offered by a team, ordered by position. */
export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  position: number;
}

/**
 * Lists a team's workflow states (statuses), ordered by position.
 *
 * Accepts a pre-resolved team UUID (per layer contract, services take UUIDs).
 * Used by the interactive status picker.
 */
export async function listWorkflowStates(
  client: GraphQLClient,
  teamId: UUID,
  first: number = 50,
): Promise<WorkflowState[]> {
  const result = await client.request(ListWorkflowStatesForTeamDocument, {
    teamId,
    first,
  });

  return [...result.workflowStates.nodes].sort(
    (a, b) => a.position - b.position,
  );
}
