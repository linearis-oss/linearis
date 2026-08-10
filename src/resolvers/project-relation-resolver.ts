import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  GetProjectRelationsDocument,
  type ProjectRelationCoreFieldsFragment,
} from "../gql/graphql.js";

/** A resolved relation, plus which way round it is stored. */
export interface ResolvedProjectRelation {
  id: UUID;
  /**
   * True when the relation was found through `inverseRelations`, i.e. the
   * project named first is the relation's `relatedProject` and the second is
   * its `project`. Callers that write per-end fields must swap the two ends.
   */
  inverted: boolean;
}

/**
 * One line of the candidate list shown when a project pair carries several
 * relations. Names both ends in the relation's own direction, since that is
 * how `relations list` prints them, and includes the milestone anchors —
 * without them two relations of the same type look identical.
 */
function describeRelation(node: ProjectRelationCoreFieldsFragment): string {
  const from = node.projectMilestone
    ? `${node.project.name}/${node.projectMilestone.name}`
    : node.project.name;
  const to = node.relatedProjectMilestone
    ? `${node.relatedProject.name}/${node.relatedProjectMilestone.name}`
    : node.relatedProject.name;
  return `${from} ${node.type} ${to} (${node.id})`;
}

/**
 * Resolves a project relation to its UUID.
 *
 * Accepts a UUID (returned as-is) or, given both endpoints, finds the
 * relation between them. Relation IDs never appear in a project read, so
 * without the pair lookup the only way to name a relation for `update` or
 * `remove` would be to run `relations list` first and copy an opaque UUID.
 *
 * ARCHITECTURAL EXCEPTION: Linear exposes no lean lookup for project
 * relations. The `projectRelations` root connection accepts no filter
 * argument at all, so it cannot be narrowed to a project; the only scoped
 * view is the pair of connections hanging off `Project`. This resolver
 * therefore reads the same `GetProjectRelations` document the service uses.
 * Both directions are searched because "the relation between A and B" is one
 * relation regardless of which project declared it — but the direction that
 * matched is reported back, because the relation's own fields (`anchorType`,
 * `projectMilestoneId`) are anchored to its `project`, not to whichever
 * endpoint the caller happened to type first.
 *
 * @throws Error if no relation links the two projects, or if more than one does
 */
export async function resolveProjectRelation(
  client: GraphQLClient,
  relationOrProjectId: string,
  relatedProjectId?: UUID,
): Promise<ResolvedProjectRelation> {
  if (isUuid(relationOrProjectId) && relatedProjectId === undefined) {
    return { id: asUuid(relationOrProjectId), inverted: false };
  }

  if (relatedProjectId === undefined) {
    throw notFoundError("Project relation", relationOrProjectId);
  }

  const projectId = asUuid(relationOrProjectId);
  const result = await client.request(GetProjectRelationsDocument, {
    projectId,
  });

  if (!result.project) {
    throw notFoundError("Project", projectId);
  }

  const matches: {
    node: ProjectRelationCoreFieldsFragment;
    inverted: boolean;
  }[] = [
    ...result.project.relations.nodes
      .filter((node) => node.relatedProject.id === relatedProjectId)
      .map((node) => ({ node, inverted: false })),
    ...result.project.inverseRelations.nodes
      .filter((node) => node.project.id === relatedProjectId)
      .map((node) => ({ node, inverted: true })),
  ];

  // One pair of projects can carry several relations — different types, or the
  // same type anchored to different milestones — and they may point either way
  // round. Picking one would silently update or remove an arbitrary link, so
  // list them and make the caller name the UUID instead.
  if (matches.length > 1) {
    throw multipleMatchesError(
      "project relation",
      `between ${projectId} and ${relatedProjectId}`,
      matches.map((match) => describeRelation(match.node)),
      "address the relation by UUID",
    );
  }

  // Both connections are bounded at 100 rows, and neither accepts a filter
  // that could narrow them to the counterpart. Past that bound the page tells
  // us nothing about the rest: no match here may still be a match there, and a
  // single match here may have a twin there that would have made the pair
  // ambiguous. Either way the safe answer is to refuse, so this runs before
  // the single-match return rather than only on zero matches.
  if (
    result.project.relations.pageInfo.hasNextPage ||
    result.project.inverseRelations.pageInfo.hasNextPage
  ) {
    throw new Error(
      `Project "${projectId}" has more than 100 dependencies in one ` +
        `direction, so its links to "${relatedProjectId}" cannot be listed in ` +
        "full. Find the relation with `projects relations list` and address it " +
        "by UUID.",
    );
  }

  if (matches.length === 0) {
    throw notFoundError(
      "Project relation",
      `between ${projectId} and ${relatedProjectId}`,
    );
  }

  const match = firstOrThrow(matches, () =>
    notFoundError(
      "Project relation",
      `between ${projectId} and ${relatedProjectId}`,
    ),
  );
  return { id: asUuid(match.node.id), inverted: match.inverted };
}
