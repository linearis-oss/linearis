import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  FindProjectMilestoneGlobalDocument,
  FindProjectMilestoneScopedDocument,
} from "../gql/graphql.js";
import { resolveProjectId } from "./project-resolver.js";

/**
 * Resolves milestone identifier to UUID.
 *
 * Accepts UUID or milestone name. When multiple milestones match a name,
 * use projectNameOrId to scope the search to a specific project.
 *
 * A project scope is authoritative: a name that project does not carry is
 * "not found", not an invitation to search the rest of the workspace.
 * Milestone names repeat across projects ("Beta", "Launch"), so a fallback
 * would silently resolve to a stranger's milestone — and the callers that
 * pass a scope (`--project`, the per-end relation flags) all mean the
 * milestone to belong to that project.
 *
 * ARCHITECTURAL EXCEPTION: This resolver queries milestones directly via
 * GraphQL (FindProjectMilestoneScoped / FindProjectMilestoneGlobal) because
 * the Linear API exposes no lean lookup fragment for milestones by name. All
 * lookups go through the single GraphQL client.
 *
 * @param gqlClient - GraphQL client for querying milestones and projects
 * @param nameOrId - Milestone name or UUID
 * @param projectNameOrId - Optional project name/ID to scope search
 * @returns Milestone UUID
 * @throws Error if not found or multiple matches without project scope
 */
export async function resolveMilestoneId(
  gqlClient: GraphQLClient,
  nameOrId: string,
  projectNameOrId?: string,
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  type MilestoneNode = {
    id: string;
    name: string;
    project?: { name: string } | null;
  };
  let nodes: MilestoneNode[];

  if (projectNameOrId) {
    const projectId = await resolveProjectId(gqlClient, projectNameOrId);
    const result = await gqlClient.request(FindProjectMilestoneScopedDocument, {
      name: nameOrId,
      projectId,
    });
    nodes = (result.project?.projectMilestones?.nodes as MilestoneNode[]) || [];
  } else {
    const globalResult = await gqlClient.request(
      FindProjectMilestoneGlobalDocument,
      { name: nameOrId },
    );
    nodes = (globalResult.projectMilestones?.nodes as MilestoneNode[]) || [];
  }

  if (nodes.length === 0) {
    throw notFoundError(
      "Milestone",
      nameOrId,
      projectNameOrId ? `in project "${projectNameOrId}"` : undefined,
    );
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

  return asUuid(
    firstOrThrow(nodes, () => notFoundError("Milestone", nameOrId)).id,
  );
}
