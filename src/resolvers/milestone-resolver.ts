import type { GraphQLClient } from "../client/graphql-client.js";
import type { LinearSdkClient } from "../client/linear-client.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";
import {
  FindProjectMilestoneGlobalDocument,
  type FindProjectMilestoneGlobalQuery,
  FindProjectMilestoneScopedDocument,
  type FindProjectMilestoneScopedQuery,
} from "../gql/graphql.js";
import { resolveProjectId } from "./project-resolver.js";

/**
 * Resolves milestone identifier to UUID.
 *
 * Accepts UUID or milestone name. When multiple milestones match a name,
 * use projectNameOrId to scope the search to a specific project.
 *
 * ARCHITECTURAL EXCEPTION: This resolver uses GraphQLClient in addition to
 * LinearSdkClient because the Linear SDK does not expose milestone lookup
 * by name. The GraphQL client is needed for the FindProjectMilestoneScoped
 * and FindProjectMilestoneGlobal queries. This is a documented deviation
 * from the standard resolver contract (resolvers normally use SDK only).
 *
 * @param gqlClient - GraphQL client for querying milestones
 * @param sdkClient - SDK client for project resolution
 * @param nameOrId - Milestone name or UUID
 * @param projectNameOrId - Optional project name/ID to scope search
 * @returns Milestone UUID
 * @throws Error if not found or multiple matches without project scope
 */
export async function resolveMilestoneId(
  gqlClient: GraphQLClient,
  sdkClient: LinearSdkClient,
  nameOrId: string,
  projectNameOrId?: string,
): Promise<string> {
  if (isUuid(nameOrId)) return nameOrId;

  type MilestoneNode = {
    id: string;
    name: string;
    project?: { name: string } | null;
  };
  let nodes: MilestoneNode[] = [];

  if (projectNameOrId) {
    const projectId = await resolveProjectId(sdkClient, projectNameOrId);
    const result = await gqlClient.request<FindProjectMilestoneScopedQuery>(
      FindProjectMilestoneScopedDocument,
      { name: nameOrId, projectId },
    );
    nodes = (result.project?.projectMilestones?.nodes as MilestoneNode[]) || [];
  }

  // Fall back to global search if no project scope or not found
  if (nodes.length === 0) {
    const globalResult =
      await gqlClient.request<FindProjectMilestoneGlobalQuery>(
        FindProjectMilestoneGlobalDocument,
        { name: nameOrId },
      );
    nodes = (globalResult.projectMilestones?.nodes as MilestoneNode[]) || [];
  }

  if (nodes.length === 0) {
    throw notFoundError("Milestone", nameOrId);
  }

  if (nodes.length > 1) {
    const matches = nodes.map(
      (m) => `"${m.name}" in project "${m.project?.name}"`,
    );
    throw multipleMatchesError(
      "milestone",
      nameOrId,
      matches,
      "specify --project or use the milestone ID",
    );
  }

  return nodes[0].id;
}
